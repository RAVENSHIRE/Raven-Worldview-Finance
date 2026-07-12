// ─── PRE-MOVER SYSTEMS · DAILY INGESTION WORKER ──────────────────────────────
// Isolates the top 10 daily market winners and losers at market close,
// enriches each mover through the Perplexity API (alpha generation), and
// persists structured intelligence reports to the hybrid store:
//   PostgreSQL/TimescaleDB (DATABASE_URL set)  →  durable analytical store
//   Redis                                       →  hot cache / no-Postgres mode
//   in-memory                                   →  last-resort fallback
//
// Resilience: a Redis-backed FIFO job queue with per-job retry + exponential
// backoff smooths Perplexity rate limits (429s). If Perplexity times out or
// keeps failing, the job falls back to a standard LLM (Gemini) fed with raw
// RSS financial headlines for that ticker.

import crypto from 'crypto';

export type SupplyChainNode = {
  name: string;
  relation: 'supplier' | 'customer';
  lat?: number;
  lon?: number;
};

export type IntelReport = {
  ticker: string;
  catalystSummary: string;
  informationAsymmetryScore: number; // 1-10
  narrativeConsensus: string;
  supplyChain: SupplyChainNode[];
  source: 'perplexity' | 'fallback-llm' | 'stub';
  generatedAt: string;
};

export type MoverEntry = {
  ticker: string;
  name: string;
  price: number;
  change1d: number;
  volume: number;
  direction: 'winner' | 'loser';
};

export type SignalSourceType =
  | 'screener' | '13f' | 'sec-filing' | 'twitter' | 'substack' | 'youtube' | 'email' | 'other';

export type AsymmetricSignal = {
  id: string;
  ticker: string;
  sourceType: SignalSourceType;
  catalystCore: string;
  sentimentShift: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  informationAsymmetryScore: number;   // 1-10
  supplyChain: SupplyChainNode[];
  extractedAt: string;
};

type IngestDeps = {
  redis: any;                                   // node-redis client (may be disconnected)
  yahooFinance: any;
  broadcast: (payload: object) => void;         // fan out to WS clients
  universeTickers: () => string[];              // movers universe when screener API unavailable
};

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PERPLEXITY_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 4;                          // per ticker before falling back
const BACKOFF_BASE_MS = 2_000;                   // 2s → 4s → 8s between retries
const QUEUE_KEY = 'ingest:queue';
const INTEL_KEY = (t: string) => `intel:report:${t}`;

const PERPLEXITY_SYSTEM_PROMPT = `You are a financial intelligence engine. For the given stock ticker, respond with ONLY a JSON object (no markdown fences, no prose) with exactly these keys:
{
  "catalystSummary": "2-3 sentence summary of today's price catalyst",
  "informationAsymmetryScore": <integer 1-10, how much material information is not yet priced in>,
  "narrativeConsensus": "<one of: UNDERVALUED / STRONG ACCUMULATION | OVERVALUED / DISTRIBUTION | FAIRLY PRICED | SPECULATIVE MOMENTUM>",
  "supplyChain": [
    {"name": "<top supplier 1>", "relation": "supplier", "lat": <HQ latitude>, "lon": <HQ longitude>},
    {"name": "<top supplier 2>", "relation": "supplier", "lat": ..., "lon": ...},
    {"name": "<top supplier 3>", "relation": "supplier", "lat": ..., "lon": ...},
    {"name": "<top customer 1>", "relation": "customer", "lat": ..., "lon": ...},
    {"name": "<top customer 2>", "relation": "customer", "lat": ..., "lon": ...},
    {"name": "<top customer 3>", "relation": "customer", "lat": ..., "lon": ...}
  ]
}`;

// ─── Hybrid persistence ───────────────────────────────────────────────────────

export class IntelStore {
  private mem = new Map<string, IntelReport>();
  private pg: any = null;
  private pgReady = false;

  constructor(private redis: any) {
    this.initPostgres();
  }

  // Postgres is optional: only wired up when DATABASE_URL is configured and
  // the `pg` driver is installed. Everything degrades to Redis/memory.
  private async initPostgres() {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    try {
      const { Pool } = await import('pg');
      this.pg = new Pool({ connectionString: url, max: 4 });
      await this.pg.query('SELECT 1');
      this.pgReady = true;
      console.log('[INGEST] PostgreSQL connected');
    } catch (err: any) {
      console.warn('[INGEST] PostgreSQL unavailable, using Redis/memory:', err?.message ?? err);
      this.pg = null;
    }
  }

  async save(report: IntelReport, raw?: unknown): Promise<void> {
    this.mem.set(report.ticker, report);
    try {
      await this.redis.set(INTEL_KEY(report.ticker), JSON.stringify(report));
    } catch { /* redis down — memory holds it */ }

    if (this.pgReady) {
      try {
        await this.pg.query(
          `INSERT INTO intelligence_reports
             (ticker, report_date, catalyst_summary, narrative_consensus_score,
              information_asymmetry_rating, supply_chain, source, raw_response)
           VALUES ($1, CURRENT_DATE, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
           ON CONFLICT (ticker, report_date) DO UPDATE SET
             catalyst_summary = EXCLUDED.catalyst_summary,
             narrative_consensus_score = EXCLUDED.narrative_consensus_score,
             information_asymmetry_rating = EXCLUDED.information_asymmetry_rating,
             supply_chain = EXCLUDED.supply_chain,
             source = EXCLUDED.source,
             raw_response = EXCLUDED.raw_response,
             generated_at = now()`,
          [
            report.ticker, report.catalystSummary, report.narrativeConsensus,
            report.informationAsymmetryScore, JSON.stringify(report.supplyChain),
            report.source, raw ? JSON.stringify(raw) : null,
          ]
        );
      } catch (err: any) {
        console.warn('[INGEST] PG write failed (Redis/mem still hold the report):', err?.message ?? err);
      }
    }
  }

  async get(ticker: string): Promise<IntelReport | null> {
    const hit = this.mem.get(ticker);
    if (hit) return hit;
    try {
      const raw = await this.redis.get(INTEL_KEY(ticker));
      if (raw) {
        const report = JSON.parse(raw) as IntelReport;
        this.mem.set(ticker, report);
        return report;
      }
    } catch { /* redis down */ }
    return null;
  }

  async saveSignal(signal: AsymmetricSignal, rawPayload: string): Promise<void> {
    try {
      await this.redis.lPush('signals:recent', JSON.stringify(signal));
      await this.redis.lTrim('signals:recent', 0, 199);
    } catch { /* redis down — PG/mem may still hold it */ }

    if (this.pgReady) {
      try {
        const raw = await this.pg.query(
          `INSERT INTO raw_signals (source_type, payload, processed_at)
             VALUES ($1, $2, now()) RETURNING id`,
          [signal.sourceType, rawPayload.slice(0, 100_000)]
        );
        await this.pg.query(
          `INSERT INTO asymmetric_signals
             (raw_signal_id, ticker, source_type, catalyst_core, sentiment_shift,
              information_asymmetry_score, supply_chain)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            raw.rows[0]?.id ?? null, signal.ticker, signal.sourceType,
            signal.catalystCore, signal.sentimentShift,
            signal.informationAsymmetryScore, JSON.stringify(signal.supplyChain),
          ]
        );
      } catch (err: any) {
        console.warn('[SIGNAL] PG write failed:', err?.message ?? err);
      }
    }
  }

  async savePriceSnapshot(m: MoverEntry): Promise<void> {
    if (!this.pgReady) return;
    try {
      await this.pg.query(
        `INSERT INTO assets (ticker, company_name) VALUES ($1, $2)
           ON CONFLICT (ticker) DO NOTHING`,
        [m.ticker, m.name]
      );
      await this.pg.query(
        `INSERT INTO price_snapshots (ticker, price, change_1d_pct, volume)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [m.ticker, m.price, m.change1d, m.volume]
      );
    } catch (err: any) {
      console.warn('[INGEST] PG snapshot write failed:', err?.message ?? err);
    }
  }
}

// ─── Provider calls ───────────────────────────────────────────────────────────

function parseStructured(text: string): Omit<IntelReport, 'ticker' | 'source' | 'generatedAt'> | null {
  try {
    // Tolerate markdown fences and leading prose around the JSON object
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    const score = Math.max(1, Math.min(10, Math.round(Number(obj.informationAsymmetryScore) || 5)));
    const chain: SupplyChainNode[] = Array.isArray(obj.supplyChain)
      ? obj.supplyChain
          .filter((n: any) => n && typeof n.name === 'string' && (n.relation === 'supplier' || n.relation === 'customer'))
          .slice(0, 6)
          .map((n: any) => ({
            name: String(n.name).slice(0, 120),
            relation: n.relation,
            lat: Number.isFinite(Number(n.lat)) ? Number(n.lat) : undefined,
            lon: Number.isFinite(Number(n.lon)) ? Number(n.lon) : undefined,
          }))
      : [];
    return {
      catalystSummary: String(obj.catalystSummary || '').slice(0, 2000),
      informationAsymmetryScore: score,
      narrativeConsensus: String(obj.narrativeConsensus || 'FAIRLY PRICED').slice(0, 80),
      supplyChain: chain,
    };
  } catch {
    return null;
  }
}

async function queryPerplexity(ticker: string, context: string): Promise<{ report: Omit<IntelReport, 'ticker' | 'source' | 'generatedAt'>; raw: unknown }> {
  if (!PERPLEXITY_API_KEY) throw Object.assign(new Error('PERPLEXITY_API_KEY not configured'), { permanent: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: PERPLEXITY_SYSTEM_PROMPT },
          { role: 'user', content: `Ticker: ${ticker}. ${context}` },
        ],
        temperature: 0.1,
      }),
    });

    if (res.status === 429) throw Object.assign(new Error('Perplexity rate limited (429)'), { retryable: true });
    if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}`);

    const raw = await res.json();
    const text = raw?.choices?.[0]?.message?.content ?? '';
    const parsed = parseStructured(text);
    if (!parsed) throw new Error('Perplexity returned unparseable payload');
    return { report: parsed, raw };
  } finally {
    clearTimeout(timer);
  }
}

// Raw RSS financial headlines for the fallback LLM's grounding context.
async function fetchRssHeadlines(ticker: string): Promise<string[]> {
  const feeds = [
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`,
  ];
  const headlines: string[] = [];
  for (const url of feeds) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const xml = await res.text();
      for (const m of xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)) {
        const t = m[1].trim();
        if (t && !/rss|yahoo/i.test(t)) headlines.push(t);
      }
    } catch { /* feed unreachable — try next */ }
  }
  return headlines.slice(0, 12);
}

async function queryFallbackLLM(ticker: string, context: string): Promise<{ report: Omit<IntelReport, 'ticker' | 'source' | 'generatedAt'>; raw: unknown }> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured for fallback');

  const headlines = await fetchRssHeadlines(ticker);
  const grounding = headlines.length
    ? `Latest RSS headlines:\n- ${headlines.join('\n- ')}`
    : 'No live headlines available; reason from fundamentals.';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${PERPLEXITY_SYSTEM_PROMPT}\n\nTicker: ${ticker}. ${context}\n${grounding}` }] }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini fallback HTTP ${res.status}`);

  const raw = await res.json();
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = parseStructured(text);
  if (!parsed) throw new Error('Fallback LLM returned unparseable payload');
  return { report: parsed, raw };
}

// ─── Multi-signal extraction (13F / social / transcripts / email) ─────────────

const SIGNAL_EXTRACTION_PROMPT = `You are a financial signal extraction engine. From the raw signal text below (a screener output, SEC/13F filing excerpt, tweet, Substack post, YouTube transcript, or investor-relations email), respond with ONLY a JSON object (no markdown fences) with exactly these keys:
{
  "ticker": "<primary stock ticker discussed, uppercase, or UNKNOWN>",
  "catalystCore": "<1-2 sentence core catalyst>",
  "sentimentShift": "<one of: bullish | bearish | neutral | mixed>",
  "informationAsymmetryScore": <integer 1-10, how under-covered this information is>,
  "supplyChain": [up to 3 {"name","relation":"supplier"|"customer","lat","lon"} entries if the text reveals dependencies, else []]
}`;

function parseSignal(text: string): Omit<AsymmetricSignal, 'id' | 'sourceType' | 'extractedAt'> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    const ticker = String(obj.ticker || 'UNKNOWN').toUpperCase().slice(0, 12);
    const shift = ['bullish', 'bearish', 'neutral', 'mixed'].includes(obj.sentimentShift) ? obj.sentimentShift : 'neutral';
    return {
      ticker,
      catalystCore: String(obj.catalystCore || '').slice(0, 1000),
      sentimentShift: shift,
      informationAsymmetryScore: Math.max(1, Math.min(10, Math.round(Number(obj.informationAsymmetryScore) || 5))),
      supplyChain: Array.isArray(obj.supplyChain)
        ? obj.supplyChain.slice(0, 3).filter((n: any) => n?.name).map((n: any) => ({
            name: String(n.name).slice(0, 120),
            relation: n.relation === 'customer' ? 'customer' : 'supplier',
            lat: Number.isFinite(Number(n.lat)) ? Number(n.lat) : undefined,
            lon: Number.isFinite(Number(n.lon)) ? Number(n.lon) : undefined,
          }))
        : [],
    };
  } catch {
    return null;
  }
}

async function extractSignal(payload: string): Promise<Omit<AsymmetricSignal, 'id' | 'sourceType' | 'extractedAt'>> {
  const clipped = payload.slice(0, 12_000); // keep filings within context budget

  if (PERPLEXITY_API_KEY) {
    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(PERPLEXITY_TIMEOUT_MS),
        headers: { 'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: 'system', content: SIGNAL_EXTRACTION_PROMPT },
            { role: 'user', content: clipped },
          ],
          temperature: 0.1,
        }),
      });
      if (res.status === 429) throw Object.assign(new Error('rate limited'), { retryable: true });
      if (res.ok) {
        const raw = await res.json();
        const parsed = parseSignal(raw?.choices?.[0]?.message?.content ?? '');
        if (parsed) return parsed;
      }
    } catch (err: any) {
      if (err?.retryable) throw err; // let the queue back off and retry
      console.warn('[SIGNAL] Perplexity extraction failed, trying fallback:', err?.message ?? err);
    }
  }

  if (GEMINI_API_KEY) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SIGNAL_EXTRACTION_PROMPT}\n\n${clipped}` }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );
    if (res.ok) {
      const raw = await res.json();
      const parsed = parseSignal(raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
      if (parsed) return parsed;
    }
    throw new Error('Fallback LLM extraction failed');
  }

  throw Object.assign(new Error('No extraction provider configured (PERPLEXITY_API_KEY / GEMINI_API_KEY)'), { permanent: true });
}

// ─── Movers isolation ─────────────────────────────────────────────────────────

export async function fetchDailyMovers(deps: IngestDeps): Promise<{ winners: MoverEntry[]; losers: MoverEntry[] }> {
  const { yahooFinance, universeTickers } = deps;

  // Preferred: Yahoo's screener endpoints for market-wide movers.
  try {
    const [gainers, losers] = await Promise.all([
      yahooFinance.screener({ scrIds: 'day_gainers', count: 10 }),
      yahooFinance.screener({ scrIds: 'day_losers', count: 10 }),
    ]);
    const map = (q: any, direction: 'winner' | 'loser'): MoverEntry => ({
      ticker: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: Number(q.regularMarketPrice) || 0,
      change1d: Number(q.regularMarketChangePercent) || 0,
      volume: Number(q.regularMarketVolume) || 0,
      direction,
    });
    return {
      winners: (gainers?.quotes ?? []).slice(0, 10).map((q: any) => map(q, 'winner')),
      losers: (losers?.quotes ?? []).slice(0, 10).map((q: any) => map(q, 'loser')),
    };
  } catch (err: any) {
    console.warn('[INGEST] Screener movers unavailable, ranking tracked universe instead:', err?.message ?? err);
  }

  // Fallback: rank the tracked universe by daily change.
  const tickers = universeTickers();
  const quotes: MoverEntry[] = [];
  for (const t of tickers) {
    try {
      const q = await yahooFinance.quote(t);
      quotes.push({
        ticker: t,
        name: q?.longName || q?.shortName || t,
        price: Number(q?.regularMarketPrice) || 0,
        change1d: Number(q?.regularMarketChangePercent) || 0,
        volume: Number(q?.regularMarketVolume) || 0,
        direction: 'winner',
      });
    } catch { /* symbol quote failed — skip */ }
  }
  quotes.sort((a, b) => b.change1d - a.change1d);
  const winners = quotes.slice(0, 10).map(m => ({ ...m, direction: 'winner' as const }));
  const losers = quotes.slice(-10).reverse().map(m => ({ ...m, direction: 'loser' as const }));
  return { winners, losers };
}

// ─── Queue + scheduler ────────────────────────────────────────────────────────

export function createIngestPipeline(deps: IngestDeps) {
  const store = new IntelStore(deps.redis);
  let lastMovers: { winners: MoverEntry[]; losers: MoverEntry[]; capturedAt: string } | null = null;
  let draining = false;

  // Redis-backed FIFO with in-memory fallback. One consumer, serialized, with
  // spacing between jobs — that alone avoids most provider rate limits.
  const memQueue: string[] = [];

  const enqueue = async (ticker: string) => {
    const job = JSON.stringify({ ticker, attempt: 1, enqueuedAt: Date.now() });
    try {
      await deps.redis.rPush(QUEUE_KEY, job);
    } catch {
      memQueue.push(job);
    }
    void drain();
  };

  const dequeue = async (): Promise<{ ticker: string; attempt: number } | null> => {
    try {
      const raw = await deps.redis.lPop(QUEUE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* redis down — use memory queue */ }
    const raw = memQueue.shift();
    return raw ? JSON.parse(raw) : null;
  };

  const requeue = async (ticker: string, attempt: number) => {
    const job = JSON.stringify({ ticker, attempt, enqueuedAt: Date.now() });
    try {
      await deps.redis.rPush(QUEUE_KEY, job);
    } catch {
      memQueue.push(job);
    }
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function processJob(ticker: string, attempt: number): Promise<void> {
    const mover = [...(lastMovers?.winners ?? []), ...(lastMovers?.losers ?? [])]
      .find(m => m.ticker === ticker);
    const context = mover
      ? `Today it moved ${mover.change1d.toFixed(2)}% to $${mover.price} on volume ${mover.volume}.`
      : 'Analyze the most recent trading session.';

    try {
      const { report, raw } = await queryPerplexity(ticker, context);
      const full: IntelReport = { ticker, ...report, source: 'perplexity', generatedAt: new Date().toISOString() };
      await store.save(full, raw);
      deps.broadcast({ type: 'INTEL_REPORT', payload: full });
      console.log(`[INGEST] ${ticker} intel saved (perplexity)`);
      return;
    } catch (err: any) {
      const retryable = err?.retryable || err?.name === 'AbortError';
      if (!err?.permanent && retryable && attempt < MAX_ATTEMPTS) {
        const backoff = BACKOFF_BASE_MS * 2 ** (attempt - 1);
        console.warn(`[INGEST] ${ticker} attempt ${attempt} failed (${err?.message}); retrying in ${backoff}ms`);
        await sleep(backoff);
        await requeue(ticker, attempt + 1);
        return;
      }
      console.warn(`[INGEST] ${ticker} Perplexity path exhausted (${err?.message}); trying fallback LLM`);
    }

    try {
      const { report, raw } = await queryFallbackLLM(ticker, context);
      const full: IntelReport = { ticker, ...report, source: 'fallback-llm', generatedAt: new Date().toISOString() };
      await store.save(full, raw);
      deps.broadcast({ type: 'INTEL_REPORT', payload: full });
      console.log(`[INGEST] ${ticker} intel saved (fallback-llm)`);
    } catch (err: any) {
      console.error(`[INGEST] ${ticker} all providers failed:`, err?.message ?? err);
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      for (;;) {
        const job = await dequeue();
        if (!job) break;
        await processJob(job.ticker, job.attempt);
        await sleep(1_500); // pace consecutive provider calls
      }
    } finally {
      draining = false;
    }
  }

  async function runDailyIngest(): Promise<{ winners: MoverEntry[]; losers: MoverEntry[] }> {
    console.log('[INGEST] Daily movers run starting');
    const movers = await fetchDailyMovers(deps);
    lastMovers = { ...movers, capturedAt: new Date().toISOString() };

    try {
      await deps.redis.set('ingest:movers:latest', JSON.stringify(lastMovers));
    } catch { /* redis down */ }

    for (const m of [...movers.winners, ...movers.losers]) {
      await store.savePriceSnapshot(m);
      await enqueue(m.ticker);
    }
    deps.broadcast({ type: 'MOVERS_UPDATE', payload: lastMovers });
    return movers;
  }

  async function getMovers() {
    if (lastMovers) return lastMovers;
    try {
      const raw = await deps.redis.get('ingest:movers:latest');
      if (raw) lastMovers = JSON.parse(raw);
    } catch { /* redis down */ }
    return lastMovers;
  }

  // Fire shortly after US market close (21:05 UTC ≈ 16:05 ET standard time),
  // checking every minute. setInterval-based so it needs no external cron.
  function startScheduler() {
    let lastRunDate = '';
    setInterval(() => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (now.getUTCHours() === 21 && now.getUTCMinutes() === 5 && lastRunDate !== today) {
        lastRunDate = today;
        runDailyIngest().catch(err => console.error('[INGEST] Daily run failed:', err?.message ?? err));
      }
    }, 60_000);
    console.log('[INGEST] Scheduler armed (daily @ 21:05 UTC, post-close)');
    // Resume any jobs left in the queue from a previous run
    void drain();
  }

  // ── Multi-signal intake queue ──
  // Raw 13F excerpts, tweets, Substack posts, transcripts and IR emails are
  // pushed here, extracted serially (same rate-limit pacing as intel jobs),
  // and fan out as SIGNAL events + asymmetric_signals rows.
  const memSignals: AsymmetricSignal[] = [];
  const memSignalQueue: string[] = [];
  let signalDraining = false;

  const enqueueSignal = async (sourceType: SignalSourceType, payload: string) => {
    const job = JSON.stringify({ sourceType, payload, attempt: 1 });
    try {
      await deps.redis.rPush('signals:queue', job);
    } catch {
      memSignalQueue.push(job);
    }
    void drainSignals();
  };

  const dequeueSignal = async (): Promise<{ sourceType: SignalSourceType; payload: string; attempt: number } | null> => {
    try {
      const raw = await deps.redis.lPop('signals:queue');
      if (raw) return JSON.parse(raw);
    } catch { /* redis down */ }
    const raw = memSignalQueue.shift();
    return raw ? JSON.parse(raw) : null;
  };

  async function drainSignals() {
    if (signalDraining) return;
    signalDraining = true;
    try {
      for (;;) {
        const job = await dequeueSignal();
        if (!job) break;
        try {
          const extracted = await extractSignal(job.payload);
          const signal: AsymmetricSignal = {
            id: crypto.randomUUID(),
            ...extracted,
            sourceType: job.sourceType,
            extractedAt: new Date().toISOString(),
          };
          memSignals.unshift(signal);
          if (memSignals.length > 200) memSignals.length = 200;
          await store.saveSignal(signal, job.payload);
          deps.broadcast({ type: 'SIGNAL', payload: signal });
          console.log(`[SIGNAL] Extracted ${signal.ticker} from ${job.sourceType} (asymmetry ${signal.informationAsymmetryScore}/10)`);
        } catch (err: any) {
          if (err?.retryable && job.attempt < MAX_ATTEMPTS) {
            await sleep(BACKOFF_BASE_MS * 2 ** (job.attempt - 1));
            const retry = JSON.stringify({ ...job, attempt: job.attempt + 1 });
            try { await deps.redis.rPush('signals:queue', retry); } catch { memSignalQueue.push(retry); }
          } else {
            console.error(`[SIGNAL] Dropping ${job.sourceType} payload:`, err?.message ?? err);
          }
        }
        await sleep(1_500);
      }
    } finally {
      signalDraining = false;
    }
  }

  async function getSignals(limit = 50): Promise<AsymmetricSignal[]> {
    if (memSignals.length) return memSignals.slice(0, limit);
    try {
      const raw = await deps.redis.lRange('signals:recent', 0, limit - 1);
      return raw.map((r: string) => JSON.parse(r));
    } catch {
      return [];
    }
  }

  return { store, runDailyIngest, getMovers, startScheduler, enqueueTicker: enqueue, enqueueSignal, getSignals };
}
