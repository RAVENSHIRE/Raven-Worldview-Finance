import 'dotenv/config';
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import yf from 'yahoo-finance2';
import { createClient } from 'redis';
import crypto from 'crypto';

// ─── TYPES ──────────────────────────────────────────────────────────────────
interface ConnectedClient {
  ws: WebSocket;
  id: string;
  connectedAt: number;
  subscriptions: Set<string>;
}

// ─── YAHOO FINANCE SETUP ─────────────────────────────────────────────────────
let yahooFinance: any = yf;
if (typeof yf === 'function') {
    try {
        yahooFinance = new (yf as any)();
    } catch (e) {
        yahooFinance = yf;
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── MARKET DATA CACHE (L1 + L2) ──────────────────────────────────────────────
class MarketDataCache {
  private l1Cache = new Map<string, { data: any, cachedAt: number, ttlMs: number }>();
  private readonly L1_TTL_MS = 30_000; // 30s
  private readonly L2_TTL_S  = 35;     // 35s

  constructor(private redisClient: any) {}

  private makeKey(symbols: string[]): string {
    return `market:batch:${crypto.createHash('md5').update(symbols.sort().join(',')).digest('hex')}`;
  }

  async get<T>(symbols: string[]): Promise<T | null> {
    const key = this.makeKey(symbols);
    
    // L1 Check
    const l1 = this.l1Cache.get(key);
    if (l1 && (Date.now() - l1.cachedAt < l1.ttlMs)) return l1.data;

    // L2 Check (Redis)
    try {
      const l2 = await this.redisClient.get(key);
      if (l2) {
        const data = JSON.parse(l2);
        // Hydrate L1
        this.l1Cache.set(key, { data, cachedAt: Date.now(), ttlMs: this.L1_TTL_MS });
        return data;
      }
    } catch (err) {
      console.warn('[CACHE] Redis L2 read error:', err);
    }
    return null;
  }

  async set<T>(symbols: string[], data: T): Promise<void> {
    const key = this.makeKey(symbols);
    this.l1Cache.set(key, { data, cachedAt: Date.now(), ttlMs: this.L1_TTL_MS });
    try {
      await this.redisClient.setEx(key, this.L2_TTL_S, JSON.stringify(data));
    } catch (err) {
      console.warn('[CACHE] Redis L2 write error:', err);
    }
  }
}

// ─── WEBSOCKET CLIENT REGISTRY ────────────────────────────────────────────────
class ClientRegistry {
  private clients = new Map<string, ConnectedClient>();

  register(ws: WebSocket): string {
    const id = crypto.randomUUID();
    this.clients.set(id, {
      ws,
      id,
      connectedAt: Date.now(),
      subscriptions: new Set(['*'])
    });
    console.log(`[WS] Client registered: ${id} | Total: ${this.clients.size}`);
    return id;
  }

  deregister(id: string): void {
    this.clients.delete(id);
    console.log(`[WS] Client deregistered: ${id} | Total: ${this.clients.size}`);
  }

  broadcast(payload: object, channel?: string): void {
    const frame = JSON.stringify(payload);
    const deadClients: string[] = [];

    for (const [id, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        deadClients.push(id);
        continue;
      }
      if (channel && !client.subscriptions.has('*') && !client.subscriptions.has(channel)) {
        continue;
      }
      try {
        client.ws.send(frame);
      } catch {
        deadClients.push(id);
      }
    }
    deadClients.forEach(id => this.deregister(id));
  }

  get count(): number { return this.clients.size; }
}

// ─── MAIN SERVER BOOTSTRAP ────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // ── Redis Setup ──
  const redisOpts = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: { connectTimeout: 2_000, reconnectStrategy: false as const },
  };
  const redisCache = createClient(redisOpts);
  const redisSub   = createClient(redisOpts);

  redisCache.on('error', () => {});
  redisSub.on('error',   () => {});

  try {
    await Promise.all([redisCache.connect(), redisSub.connect()]);
    console.log('[REDIS] Cache + Sub clients connected');
  } catch {
    console.warn('[REDIS] Not available — running without cache/pubsub.');
    redisCache.disconnect().catch(() => {});
    redisSub.disconnect().catch(() => {});
  }

  const cache    = new MarketDataCache(redisCache);
  const registry = new ClientRegistry();

  // ── WebSocket Server ──
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    const clientId = registry.register(ws);
    
    ws.send(JSON.stringify({
      type: 'SYSTEM',
      label: 'CONNECTION_ESTABLISHED: GEO_FEED_SYNCED',
      clientId,
      timestamp: new Date().toISOString()
    }));

    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });
    
    const heartbeat = setInterval(() => {
      if (!isAlive) {
        clearInterval(heartbeat);
        registry.deregister(clientId);
        ws.terminate();
        return;
      }
      isAlive = false;
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30_000);

    ws.on('close', () => {
      clearInterval(heartbeat);
      registry.deregister(clientId);
    });

    ws.on('error', () => {
      clearInterval(heartbeat);
      registry.deregister(clientId);
    });
  });

  // ── Redis Subscriptions ──
  const CHANNELS = ['raven:geo', 'raven:equity', 'raven:agent'];
  if (redisSub.isOpen) {
    await redisSub.subscribe(CHANNELS, (message, channel) => {
      try {
        const payload = JSON.parse(message);
        if (channel === 'raven:geo' && payload.severity === 'danger') {
          registry.broadcast({ ...payload, _fastPath: true }, 'raven:geo');
          return;
        }
        registry.broadcast(payload, channel);
      } catch (err) {
        console.error(`[REDIS:SUB] Parse error on ${channel}:`, err);
      }
    });
    console.log(`[REDIS:SUB] Subscribed to: ${CHANNELS.join(', ')}`);
  }

  // ── API Routes ──
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'Raven-Worldview-Alpha',
      clients: registry.count,
      uptime: process.uptime()
    });
  });

  // PostgreSQL stub for /api/universe (Foundation Phase Task 4)
  app.get('/api/universe', async (_req, res) => {
    // In a production environment, this would fetch from PostgreSQL.
    // For now, we return a structured list of active tickers for hydration.
    const universe = [
      { ticker: 'AAPL', name: 'Apple Inc.', lat: 37.3349, lon: -122.0091, sector: 'Technology', iso_code: 'USA' },
      { ticker: 'TSLA', name: 'Tesla, Inc.', lat: 30.2672, lon: -97.7431, sector: 'Consumer Cyclical', iso_code: 'USA' },
      { ticker: 'NVDA', name: 'NVIDIA Corp.', lat: 37.3541, lon: -121.9552, sector: 'Technology', iso_code: 'USA' },
      { ticker: 'RKLB', name: 'Rocket Lab USA', lat: -39.2603, lon: 177.8648, sector: 'Industrials', iso_code: 'NZL' },
      { ticker: 'SNB', name: 'Swiss National Bank', lat: 47.3686, lon: 8.5391, sector: 'Financial Services', iso_code: 'CHE' }
    ];
    res.json(universe);
  });

  app.get('/api/market/batch', async (req, res) => {
    const rawSymbols = (req.query.symbols as string || '').split(',').filter(Boolean);
    const symbols = rawSymbols.slice(0, 30);
    
    if (symbols.length === 0) return res.json({});

    const cached = await cache.get<Record<string, any>>(symbols);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    try {
      const results = await (yahooFinance as any).quote(symbols);
      const map: Record<string, any> = {};
      const normalize = (r: any) => ({
        price:       r.regularMarketPrice ?? null,
        change1d:    r.regularMarketChangePercent ?? null,
        volume:      r.regularMarketVolume ?? null,
        marketCap:   r.marketCap ?? null,
        lastUpdated: new Date().toISOString()
      });

      if (Array.isArray(results)) {
        results.forEach(r => { if (r?.symbol) map[r.symbol] = normalize(r); });
      } else if (results?.symbol) {
        map[results.symbol] = normalize(results);
      }

      await cache.set(symbols, map);
      res.setHeader('X-Cache', 'MISS');
      return res.json(map);
    } catch (e: any) {
      res.status(500).json({ error: 'FETCH_ERROR', details: e.message });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Raven Worldview Active on http://localhost:${PORT}`);
  });
}

startServer();
