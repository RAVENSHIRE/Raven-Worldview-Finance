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

// ─── SCREEN STORE (durable: Redis no-TTL + in-mem mirror) ─────────────────────
// Persists screening reports under a `screen:*` namespace. Unlike the market
// cache these keys have no TTL. The in-memory Map mirrors Redis so the app keeps
// working (for the session lifetime) if Redis is unavailable.
interface StoredReport {
  id: string;
  text: string;
  source?: string;
  filterVersionId?: string;
  capturedAt: string;
}

class ScreenStore {
  private mem = new Map<string, StoredReport>();
  private index: string[] = []; // report ids, newest first
  private readonly INDEX_KEY = 'screen:reports';
  private readonly KEY_PREFIX = 'screen:report:';
  // Cap the in-memory mirror so a long-running process doesn't grow unbounded.
  // Redis remains the source of truth; older entries are re-hydrated on demand.
  private readonly MAX_MEM_REPORTS = 500;

  constructor(private redisClient: any) {}

  private key(id: string): string { return `${this.KEY_PREFIX}${id}`; }

  async saveReport(report: StoredReport): Promise<void> {
    this.mem.set(report.id, report);
    this.index.unshift(report.id);
    // Evict oldest ids (index is newest-first) from both mem and index.
    if (this.index.length > this.MAX_MEM_REPORTS) {
      for (const id of this.index.splice(this.MAX_MEM_REPORTS)) this.mem.delete(id);
    }
    try {
      await this.redisClient.set(this.key(report.id), JSON.stringify(report));
      await this.redisClient.lPush(this.INDEX_KEY, report.id);
    } catch (err) {
      console.warn('[SCREEN] Redis write error (kept in memory):', err);
    }
  }

  async getReport(id: string): Promise<StoredReport | null> {
    const local = this.mem.get(id);
    if (local) return local;
    try {
      const raw = await this.redisClient.get(this.key(id));
      if (raw) {
        const report = JSON.parse(raw) as StoredReport;
        this.mem.set(id, report);
        return report;
      }
    } catch (err) {
      console.warn('[SCREEN] Redis read error:', err);
    }
    return null;
  }

  private async listIds(limit: number): Promise<string[]> {
    try {
      const ids = await this.redisClient.lRange(this.INDEX_KEY, 0, limit - 1);
      if (Array.isArray(ids) && ids.length) return ids;
    } catch (err) {
      console.warn('[SCREEN] Redis index read error:', err);
    }
    return this.index.slice(0, limit);
  }

  async listReports(limit = 20): Promise<StoredReport[]> {
    const ids = await this.listIds(limit);
    const reports = await Promise.all(ids.map(id => this.getReport(id)));
    return reports.filter((r): r is StoredReport => r !== null);
  }

  async latestReport(): Promise<StoredReport | null> {
    const [id] = await this.listIds(1);
    return id ? this.getReport(id) : null;
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

  // Body parsers: screening reports arrive as raw text/plain or JSON.
  app.use(express.json({ limit: '2mb' }));
  app.use(express.text({ type: 'text/plain', limit: '2mb' }));

  // ── Redis Setup ──
  const redisCache = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  const redisSub   = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

  redisCache.on('error', err => console.error('[REDIS:CACHE] Error:', err));
  redisSub.on('error',   err => console.error('[REDIS:SUB] Error:',   err));

  try {
    await Promise.all([redisCache.connect(), redisSub.connect()]);
    console.log('[REDIS] Cache + Sub clients connected');
  } catch (err) {
    console.error('[REDIS] Connection failed. Running without Redis cache/pubsub.', err);
  }

  const cache    = new MarketDataCache(redisCache);
  const screens  = new ScreenStore(redisCache);
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
  const CHANNELS = ['raven:geo', 'raven:equity', 'raven:agent', 'raven:screen'];
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

  // ── Screening Report Routes ──
  const previewOf = (text: string): string =>
    (text.split('\n').find(l => l.trim().length > 0) || '').slice(0, 120);

  // Ingest a plain-text screening report blob from an external workflow.
  // Accepts raw text/plain or JSON { text, source?, filterVersionId?, capturedAt? }.
  app.post('/api/screen/report', async (req, res) => {
    const body: any = req.body;
    const text: string = typeof body === 'string' ? body : (body?.text ?? '');

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'EMPTY_REPORT' });
    }

    const report = {
      id: crypto.randomUUID(),
      text,
      source: typeof body === 'object' ? body.source : undefined,
      filterVersionId: typeof body === 'object' ? body.filterVersionId : undefined,
      capturedAt: (typeof body === 'object' && body.capturedAt) || new Date().toISOString(),
    };

    await screens.saveReport(report);

    // Push to connected clients over the existing pub/sub → WS bridge.
    const meta = { ...report, preview: previewOf(report.text) };
    try {
      await redisCache.publish('raven:screen', JSON.stringify({
        type: 'SCREEN_REPORT',
        payload: meta,
      }));
    } catch {
      // Redis pub/sub unavailable — fall back to direct broadcast.
      registry.broadcast({ type: 'SCREEN_REPORT', payload: meta }, 'raven:screen');
    }

    res.status(201).json({ id: report.id });
  });

  // Index of recent reports (metadata + preview, no full blobs).
  app.get('/api/screen/reports', async (req, res) => {
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, 100);
    const reports = await screens.listReports(limit);
    res.json(reports.map(r => ({
      id: r.id,
      source: r.source,
      filterVersionId: r.filterVersionId,
      capturedAt: r.capturedAt,
      preview: previewOf(r.text),
    })));
  });

  // Most recent full report.
  app.get('/api/screen/report/latest', async (_req, res) => {
    const report = await screens.latestReport();
    if (!report) return res.status(404).json({ error: 'NO_REPORTS' });
    res.json(report);
  });

  // Full report by id.
  app.get('/api/screen/report/:id', async (req, res) => {
    const report = await screens.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
    res.json(report);
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
