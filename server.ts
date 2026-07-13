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

  constructor(private redisClient: any | null) {}

  private makeKey(symbols: string[]): string {
    return `market:batch:${crypto.createHash('md5').update(symbols.sort().join(',')).digest('hex')}`;
  }

  async get<T>(symbols: string[]): Promise<T | null> {
    const key = this.makeKey(symbols);
    
    // L1 Check
    const l1 = this.l1Cache.get(key);
    if (l1 && (Date.now() - l1.cachedAt < l1.ttlMs)) return l1.data;

    // L2 Check (Redis)
    if (!this.redisClient || !this.redisClient.isOpen) return null;
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
    if (!this.redisClient || !this.redisClient.isOpen) return;
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
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  // ── Redis Setup ──
  const redisCache = createClient({
    url: redisUrl,
    socket: {
      // Disable endless reconnect noise when Redis is intentionally absent.
      reconnectStrategy: () => false,
    },
  });
  const redisSub   = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: () => false,
    },
  });

  let redisCacheConnected = false;
  let redisSubConnected = false;

  redisCache.on('error', err => {
    if ((err as any)?.code === 'ECONNREFUSED') {
      console.warn('[REDIS:CACHE] ECONNREFUSED (Redis unavailable)');
      return;
    }
    console.error('[REDIS:CACHE] Error:', err);
  });
  redisSub.on('error', err => {
    if ((err as any)?.code === 'ECONNREFUSED') {
      console.warn('[REDIS:SUB] ECONNREFUSED (Redis unavailable)');
      return;
    }
    console.error('[REDIS:SUB] Error:', err);
  });

  const [cacheConnectResult, subConnectResult] = await Promise.allSettled([
    redisCache.connect(),
    redisSub.connect(),
  ]);

  redisCacheConnected = cacheConnectResult.status === 'fulfilled' && redisCache.isOpen;
  redisSubConnected = subConnectResult.status === 'fulfilled' && redisSub.isOpen;

  if (redisCacheConnected || redisSubConnected) {
    console.log('[REDIS] Connected:', {
      cache: redisCacheConnected,
      sub: redisSubConnected,
      url: redisUrl,
    });
  } else {
    console.warn(`[REDIS] Connection failed at ${redisUrl}. Running without Redis cache/pubsub.`);
  }

  const cache    = new MarketDataCache(redisCacheConnected ? redisCache : null);
  const registry = new ClientRegistry();

  // ── WebSocket Server ──
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(`[SERVER] Port ${PORT} is already in use. Another dev server is likely running.`);
      return;
    }
    console.error('[WS] Server error:', err);
  });

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
  if (redisSubConnected) {
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

  // ── Claude AI Chat Endpoint ──
  app.use(express.json());
  app.post('/api/chat', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { messages, systemPrompt } = req.body as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      systemPrompt?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('[CLAUDE] API error:', response.status, err);
        return res.status(502).json({ error: 'CLAUDE_API_ERROR', details: err });
      }

      const data = await response.json() as any;
      const text = data?.content?.[0]?.text ?? '';
      return res.json({ text });
    } catch (e: any) {
      console.error('[CLAUDE] Fetch error:', e);
      return res.status(500).json({ error: 'CLAUDE_FETCH_ERROR', details: e.message });
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

  httpServer.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(`[SERVER] Port ${PORT} is already in use. Stop the existing process or run on another port.`);
      process.exit(0);
    }
    console.error('[SERVER] HTTP error:', err);
    process.exit(1);
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Raven Worldview Active on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[SERVER] Fatal startup error:', err);
  process.exit(1);
});
