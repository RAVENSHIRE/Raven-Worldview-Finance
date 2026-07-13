import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import yf from 'yahoo-finance2';
import { createClient } from 'redis';
import crypto from 'crypto';
import { createIngestPipeline } from './workers/ingest';
import { createMacroWorker } from './workers/macro';

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

// ─── WATCHLIST STORE (durable Redis + in-mem mirror) ──────────────────────────
// A "company node" placed on the globe. Resolved from a Yahoo quote plus an
// approximate HQ/exchange location so it can be rendered spatially.
interface WatchlistNode {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  lat: number;
  lon: number;
  price: number;
  change1d: number;
  marketCap: number;
  addedAt: string;
  lastUpdated: string;
}

// Approximate coordinates for the city of each exchange. Yahoo returns short
// exchange codes; we place a node at its exchange's location (with a small
// deterministic jitter so co-listed names don't overlap exactly).
const EXCHANGE_COORDS: Record<string, [number, number]> = {
  NMS: [40.71, -74.0], NGM: [40.71, -74.0], NCM: [40.71, -74.0], NASDAQ: [40.71, -74.0],
  NYQ: [40.71, -74.0], NYS: [40.71, -74.0], PCX: [40.71, -74.0], ASE: [40.71, -74.0],
  MCE: [40.42, -3.70],                                   // Madrid
  AMS: [52.37, 4.90],                                    // Amsterdam
  GER: [50.11, 8.68], FRA: [50.11, 8.68], XETRA: [50.11, 8.68], // Frankfurt
  LSE: [51.51, -0.13], LON: [51.51, -0.13],              // London
  PAR: [48.85, 2.35],                                    // Paris
  MIL: [45.46, 9.19],                                    // Milan
  EBS: [47.37, 8.54], SWX: [47.37, 8.54], VTX: [47.37, 8.54], // Zurich
  TOR: [43.65, -79.38],                                  // Toronto
  HKG: [22.32, 114.17],                                  // Hong Kong
  TYO: [35.68, 139.69], JPX: [35.68, 139.69],            // Tokyo
  SHH: [31.23, 121.47], SHZ: [22.54, 114.06],            // Shanghai / Shenzhen
  NSI: [19.08, 72.88], BSE: [19.08, 72.88],              // Mumbai
  ASX: [-33.87, 151.21],                                 // Sydney
  STO: [59.33, 18.06],                                   // Stockholm
  SAO: [-23.55, -46.63],                                 // Sao Paulo
  KSC: [37.57, 126.98],                                  // Seoul
  TAI: [25.03, 121.57],                                  // Taipei
};

// Yahoo ticker suffixes → exchange city, so an international ticker still gets
// placed even when no live quote (and thus no exchange code) is available.
const SUFFIX_COORDS: Record<string, [number, number]> = {
  AS: [52.37, 4.90], MC: [40.42, -3.70], SW: [47.37, 8.54], VX: [47.37, 8.54],
  L: [51.51, -0.13], DE: [50.11, 8.68], F: [50.11, 8.68], PA: [48.85, 2.35],
  MI: [45.46, 9.19], TO: [43.65, -79.38], HK: [22.32, 114.17], T: [35.68, 139.69],
  SS: [31.23, 121.47], SZ: [22.54, 114.06], NS: [19.08, 72.88], BO: [19.08, 72.88],
  AX: [-33.87, 151.21], ST: [59.33, 18.06], SA: [-23.55, -46.63], KS: [37.57, 126.98],
  TW: [25.03, 121.57],
};

function resolveCoords(ticker: string, exchange?: string): [number, number] {
  const suffix = ticker.includes('.') ? ticker.split('.').pop()! : '';
  const base =
    (exchange && EXCHANGE_COORDS[exchange]) ||
    (suffix && SUFFIX_COORDS[suffix]) ||
    [20, 0]; // mid-Atlantic default (US-listed names with no suffix land here)
  // Deterministic jitter (±~1.2°) from the ticker so co-listed names separate.
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const jLat = ((h % 240) / 100) - 1.2;
  const jLon = (((h >> 8) % 240) / 100) - 1.2;
  return [base[0] + jLat, base[1] + jLon];
}

class WatchlistStore {
  private mem = new Map<string, WatchlistNode>();
  private readonly SET_KEY = 'watchlist:tickers';
  private readonly KEY_PREFIX = 'watchlist:node:';
  private hydrated = false;

  constructor(private redisClient: any) {}

  private key(t: string): string { return `${this.KEY_PREFIX}${t}`; }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    try {
      const tickers: string[] = await this.redisClient.sMembers(this.SET_KEY);
      for (const t of tickers) {
        const raw = await this.redisClient.get(this.key(t));
        if (raw) this.mem.set(t, JSON.parse(raw));
      }
    } catch (err) {
      console.warn('[WATCHLIST] Redis hydrate error:', err);
    }
    this.hydrated = true;
  }

  async save(node: WatchlistNode): Promise<void> {
    this.mem.set(node.ticker, node);
    try {
      await this.redisClient.sAdd(this.SET_KEY, node.ticker);
      await this.redisClient.set(this.key(node.ticker), JSON.stringify(node));
    } catch (err) {
      console.warn('[WATCHLIST] Redis write error (kept in memory):', err);
    }
  }

  async remove(ticker: string): Promise<boolean> {
    const existed = this.mem.delete(ticker);
    try {
      await this.redisClient.sRem(this.SET_KEY, ticker);
      await this.redisClient.del(this.key(ticker));
    } catch (err) {
      console.warn('[WATCHLIST] Redis delete error:', err);
    }
    return existed;
  }

  async list(): Promise<WatchlistNode[]> {
    await this.hydrate();
    return Array.from(this.mem.values()).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }

  async has(ticker: string): Promise<boolean> {
    await this.hydrate();
    return this.mem.has(ticker);
  }

  // Synchronous view of currently-known tickers (in-memory mirror only).
  tickersSync(): string[] {
    return Array.from(this.mem.keys());
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
  // Boot never blocks on Redis. The clients retry forever in the background
  // with capped backoff, so Redis started AFTER the app is picked up
  // automatically; until then the stores fall back to their in-memory mirrors.
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisSocket = {
    connectTimeout: 3000,
    reconnectStrategy: (retries: number) => Math.min(200 * 2 ** retries, 5000),
  };
  // disableOfflineQueue: commands issued while disconnected reject immediately
  // (callers catch and fall back to memory) instead of queueing forever and
  // hanging every request until Redis appears.
  const redisCache = createClient({ url: REDIS_URL, socket: redisSocket, disableOfflineQueue: true });
  const redisSub   = createClient({ url: REDIS_URL, socket: redisSocket, disableOfflineQueue: true });

  // Log the first few connection errors, then go quiet (the background retry
  // loop would otherwise spam one line every few seconds).
  const errLogger = (label: string) => {
    let count = 0;
    return (err: any) => {
      count++;
      if (count <= 3) console.error(`[REDIS:${label}] Error:`, err?.message ?? err);
      if (count === 3) console.error(`[REDIS:${label}] (suppressing further connection errors)`);
    };
  };
  redisCache.on('error', errLogger('CACHE'));
  redisSub.on('error',   errLogger('SUB'));

  const connectBg = (client: any, label: string) =>
    client.connect()
      .then(() => console.log(`[REDIS] ${label} connected`))
      .catch((err: any) => console.warn(`[REDIS] ${label} unavailable:`, err?.message ?? err));

  // Give Redis a short head start, then boot regardless.
  await Promise.race([
    Promise.all([connectBg(redisCache, 'cache'), connectBg(redisSub, 'sub')]),
    new Promise<void>(resolve => setTimeout(resolve, 3000)),
  ]);

  const cache     = new MarketDataCache(redisCache);
  const screens   = new ScreenStore(redisCache);
  const watchlist = new WatchlistStore(redisCache);
  const registry  = new ClientRegistry();

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
  const CHANNELS = ['raven:geo', 'raven:equity', 'raven:agent', 'raven:screen', 'raven:watchlist'];
  const handleChannelMessage = (message: string, channel: string) => {
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
  };

  // Subscribe once, whenever the sub client first becomes ready — at boot if
  // Redis is already up, or later when a delayed connection succeeds.
  // (node-redis restores subscriptions itself on subsequent reconnects.)
  let channelsSubscribed = false;
  const subscribeChannels = async () => {
    if (channelsSubscribed) return;
    channelsSubscribed = true;
    await redisSub.subscribe(CHANNELS, handleChannelMessage);
    console.log(`[REDIS:SUB] Subscribed to: ${CHANNELS.join(', ')}`);
  };
  // NOTE: isReady (connected + ready), not isOpen — isOpen is true from the
  // moment connect() is called, including while stuck in a reconnect loop, and
  // awaiting subscribe() on a non-ready client blocks boot forever.
  if (redisSub.isReady) {
    await subscribeChannels();
  } else {
    redisSub.once('ready', () => {
      subscribeChannels().catch(err => console.error('[REDIS:SUB] Subscribe failed:', err?.message ?? err));
    });
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

  // ── Daily Ingestion Pipeline (movers → Perplexity intel → hybrid store) ──
  const UNIVERSE_TICKERS = ['PLTR', 'RKLB', 'MSTR', 'ARM', 'ASML', 'COIN', 'SMCI', 'NESN', 'UBSG', 'SAN.MC', 'BBVA.MC', 'ITX.MC', 'AAPL', 'TSLA', 'NVDA'];
  const ingest = createIngestPipeline({
    redis: redisCache,
    yahooFinance,
    broadcast: (payload) => registry.broadcast(payload),
    universeTickers: () => Array.from(new Set([...UNIVERSE_TICKERS, ...watchlist.tickersSync()])),
  });
  ingest.startScheduler();

  const macro = createMacroWorker({ redis: redisCache, broadcast: (p) => registry.broadcast(p) });
  macro.startScheduler();

  // Latest macro outlook (risk-on/off regime, red flags, vulnerable sectors).
  app.get('/api/macro', async (_req, res) => {
    const outlook = await macro.get();
    if (!outlook) return res.status(404).json({ error: 'NO_MACRO_YET', hint: 'POST /api/macro/run to trigger' });
    res.json(outlook);
  });

  app.post('/api/macro/run', async (_req, res) => {
    try {
      res.json(await macro.run());
    } catch (e: any) {
      res.status(500).json({ error: 'MACRO_FAILED', details: e?.message });
    }
  });

  // Latest isolated top-10 winners/losers snapshot.
  app.get('/api/movers', async (_req, res) => {
    const movers = await ingest.getMovers();
    if (!movers) return res.status(404).json({ error: 'NO_MOVERS_YET', hint: 'POST /api/ingest/run to trigger a run' });
    res.json(movers);
  });

  // Structured intelligence report for one ticker.
  app.get('/api/intel/:ticker', async (req, res) => {
    const ticker = req.params.ticker.trim().toUpperCase();
    const report = await ingest.store.get(ticker);
    if (!report) return res.status(404).json({ error: 'NO_INTEL', ticker });
    res.json(report);
  });

  // Manual trigger (testing / catch-up outside the 21:05 UTC schedule).
  app.post('/api/ingest/run', async (_req, res) => {
    try {
      const movers = await ingest.runDailyIngest();
      res.status(202).json({ ok: true, queued: movers.winners.length + movers.losers.length });
    } catch (e: any) {
      res.status(500).json({ error: 'INGEST_FAILED', details: e?.message });
    }
  });

  // Queue a single ticker for intel enrichment (e.g. after a watchlist add).
  app.post('/api/intel/:ticker/refresh', async (req, res) => {
    const ticker = req.params.ticker.trim().toUpperCase();
    await ingest.enqueueTicker(ticker);
    res.status(202).json({ ok: true, ticker });
  });

  // ── Multi-Signal Intake ──
  // Accepts raw signal payloads from any source layer: screener exports,
  // 13F/SEC filing excerpts, tweets, Substack posts, YouTube transcripts,
  // forwarded IR emails. JSON { source, text } or raw text/plain (?source=).
  const SIGNAL_SOURCES = new Set(['screener', '13f', 'sec-filing', 'twitter', 'substack', 'youtube', 'email', 'other']);
  app.post('/api/signal', async (req, res) => {
    const body: any = req.body;
    const text = (typeof body === 'string' ? body : body?.text || '').trim();
    const source = String((typeof body === 'object' && body?.source) || req.query.source || 'other').toLowerCase();
    if (!text) return res.status(400).json({ error: 'EMPTY_PAYLOAD' });
    if (!SIGNAL_SOURCES.has(source)) return res.status(400).json({ error: 'UNKNOWN_SOURCE', allowed: [...SIGNAL_SOURCES] });
    await ingest.enqueueSignal(source as any, text.slice(0, 200_000));
    res.status(202).json({ ok: true, source, queued: true });
  });

  app.get('/api/signals', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10) || 50, 200);
    res.json(await ingest.getSignals(limit));
  });

  // ── Fundamentals (3-statement history for the Reverse-DCF module) ──
  // Merges yahoo quoteSummary statement modules into per-year rows. When the
  // provider is unreachable, returns statements derived from the live quote
  // (or plain heuristics) flagged source:'derived' so the UI can label them.
  app.get('/api/fundamentals/:ticker', async (req, res) => {
    const ticker = req.params.ticker.trim().toUpperCase();

    const derived = (marketCap: number, currency = 'USD') => {
      const y = new Date().getFullYear();
      const revenue0 = marketCap > 0 ? marketCap / 6 : 5e9;
      const rows = [2, 1, 0].map(back => {
        const revenue = revenue0 / Math.pow(1.08, back);
        return {
          year: y - 1 - back,
          revenue,
          ebitda: revenue * 0.22,
          netIncome: revenue * 0.12,
          totalDebt: revenue * 0.35,
          cash: revenue * 0.2,
          totalStockholdersEquity: revenue * 0.8,
          operatingCashFlow: revenue * 0.19,
          capitalExpenditure: revenue * 0.05,
          freeCashFlow: revenue * 0.14,
        };
      });
      return { ticker, currency, marketCap: marketCap || revenue0 * 6, history: rows, source: 'derived' };
    };

    try {
      const qs = await yahooFinance.quoteSummary(ticker, {
        modules: ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory', 'price'],
      });

      const byYear = new Map<number, any>();
      const rowFor = (endDate: any) => {
        const year = new Date(endDate).getFullYear();
        if (!byYear.has(year)) byYear.set(year, { year });
        return byYear.get(year);
      };

      for (const s of qs?.incomeStatementHistory?.incomeStatementHistory ?? []) {
        const r = rowFor(s.endDate);
        r.revenue = s.totalRevenue ?? 0;
        r.ebitda = s.ebit ?? 0;                    // ebit as ebitda proxy when D&A absent
        r.netIncome = s.netIncome ?? 0;
      }
      for (const s of qs?.balanceSheetHistory?.balanceSheetStatements ?? []) {
        const r = rowFor(s.endDate);
        r.cash = s.cash ?? 0;
        r.totalDebt = (s.shortLongTermDebt ?? 0) + (s.longTermDebt ?? 0);
        r.totalStockholdersEquity = s.totalStockholderEquity ?? 0;
      }
      for (const s of qs?.cashflowStatementHistory?.cashflowStatements ?? []) {
        const r = rowFor(s.endDate);
        r.operatingCashFlow = s.totalCashFromOperatingActivities ?? 0;
        r.capitalExpenditure = s.capitalExpenditures ?? 0;
      }

      const history = Array.from(byYear.values()).sort((a, b) => a.year - b.year).slice(-3);
      const marketCap = qs?.price?.marketCap ?? 0;
      if (history.length === 0) return res.json(derived(marketCap, qs?.price?.currency ?? 'USD'));

      res.json({ ticker, currency: qs?.price?.currency ?? 'USD', marketCap, history, source: 'api' });
    } catch (e: any) {
      console.warn(`[FUNDAMENTALS] ${ticker} provider fetch failed (${e?.message}); serving derived model`);
      res.json(derived(0));
    }
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

  // ── Watchlist Routes ──
  const broadcastWatchlist = async (payload: object) => {
    try {
      await redisCache.publish('raven:watchlist', JSON.stringify(payload));
    } catch {
      registry.broadcast(payload, 'raven:watchlist');
    }
  };

  // List all watchlist nodes (for globe hydration on load).
  app.get('/api/watchlist', async (_req, res) => {
    res.json(await watchlist.list());
  });

  // Add a company by ticker: resolve it via Yahoo, place it on the globe,
  // persist it, and broadcast the new node to connected clients.
  app.post('/api/watchlist', async (req, res) => {
    const raw = (typeof req.body === 'string' ? req.body : req.body?.ticker) || '';
    const ticker = String(raw).trim().toUpperCase();
    if (!ticker) return res.status(400).json({ error: 'EMPTY_TICKER' });

    if (await watchlist.has(ticker)) {
      return res.status(409).json({ error: 'ALREADY_WATCHED', ticker });
    }

    // Best-effort live quote. Placement on the globe must not depend on it —
    // if the quote provider is unavailable the company is still added with
    // price/change left at 0 until a later batch sync fills them in.
    let quote: any = null;
    try {
      const q: any = await (yahooFinance as any).quote(ticker);
      quote = Array.isArray(q) ? q[0] : q;
    } catch (e: any) {
      console.warn(`[WATCHLIST] Quote resolve failed for ${ticker} (adding without quote):`, e.message);
    }

    const exchange = quote?.exchange || quote?.fullExchangeName || 'UNRESOLVED';
    const [lat, lon] = resolveCoords(ticker, quote?.exchange);
    const node = {
      ticker,
      name: quote?.longName || quote?.shortName || ticker,
      exchange,
      sector: quote?.sector || quote?.quoteType || 'Equity',
      lat,
      lon,
      price: quote?.regularMarketPrice ?? 0,
      change1d: quote?.regularMarketChangePercent ?? 0,
      marketCap: quote?.marketCap ?? 1e9,
      addedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    await watchlist.save(node);
    await broadcastWatchlist({ type: 'WATCHLIST_ADD', payload: node });
    return res.status(201).json(node);
  });

  // Remove a company from the watchlist.
  app.delete('/api/watchlist/:ticker', async (req, res) => {
    const ticker = req.params.ticker.trim().toUpperCase();
    const existed = await watchlist.remove(ticker);
    if (!existed) return res.status(404).json({ error: 'NOT_WATCHED', ticker });
    await broadcastWatchlist({ type: 'WATCHLIST_REMOVE', payload: { ticker } });
    res.json({ ok: true, ticker });
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
