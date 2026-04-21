import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import yf from "yahoo-finance2";
import { UNIVERSE_STOCKS } from "./src/data/universe";
import { FinanceEvent, MarketQuote, SwarmMessage } from "./src/types";

let yahooFinance: any = yf;

if (typeof yf === "function") {
  try {
    yahooFinance = new (yf as any)();
  } catch {
    yahooFinance = yf;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const MARKET_CACHE_TTL_MS = 30_000;
const HISTORY_CACHE_TTL_MS = 15 * 60_000;
const INGESTION_TOKEN = process.env.INGESTION_TOKEN ?? "raven-dev-ingest";

const publicUniverse = UNIVERSE_STOCKS.filter(
  (stock) => stock.exchange && !stock.exchange.includes("PRIVATE"),
);
const publicSymbols = publicUniverse.map((stock) => stock.ticker);

const uiClients = new Set<WebSocket>();
const quoteCache = new Map<string, { data: MarketQuote; fetchedAt: number }>();
const historyCache = new Map<string, { data: Array<Record<string, unknown>>; fetchedAt: number }>();

const agents = [
  { name: "MACRO_SCOUT", persona: "Global Policy Tracker" },
  { name: "IPO_HUNTER", persona: "S-1 Filing Analyst" },
  { name: "REUTERS_ALPHA", persona: "Reuters LiveSentiment" },
  { name: "PERPLEXITY_FI", persona: "Quantum Reasoning Engine" },
  { name: "GEO_INTEL", persona: "Satellite Intelligence" },
];

const agentMessages = [
  "Detected S-1 metadata for Databricks. Imminent pulse detected.",
  "IMF liquidity signal correlates with Swiss SMI rebound.",
  "Reuters Flash: Klarna finalizing NY listing with 18% premium.",
  "Perplexity Analysis: Aerospace nodes showing 4x momentum divergence.",
  "Geopolitical Alert: Malacca Strait bottleneck increasing shipping risk premiums.",
  "Crypto-Infra nodes accumulating across GCC satellite hubs.",
];

function processQuote(result: any): MarketQuote {
  return {
    price: result?.regularMarketPrice ?? null,
    change1d: result?.regularMarketChangePercent ?? null,
    volume: result?.regularMarketVolume ?? null,
    marketCap: result?.marketCap ?? null,
    lastUpdated: new Date().toISOString(),
  };
}

function isCacheFresh(fetchedAt: number, ttlMs: number) {
  return Date.now() - fetchedAt < ttlMs;
}

function broadcast(payload: FinanceEvent | SwarmMessage) {
  const message = JSON.stringify(payload);
  for (const client of uiClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function isValidSeverity(value: unknown): value is FinanceEvent["severity"] {
  return value === "info" || value === "success" || value === "warn" || value === "danger";
}

function isFinanceEvent(payload: any): payload is FinanceEvent {
  return (
    payload &&
    typeof payload.type === "string" &&
    payload.type !== "AGENT_TALK" &&
    typeof payload.label === "string" &&
    isValidSeverity(payload.severity)
  );
}

function isSwarmMessage(payload: any): payload is SwarmMessage {
  return (
    payload &&
    payload.type === "AGENT_TALK" &&
    typeof payload.agentName === "string" &&
    typeof payload.content === "string" &&
    isValidSeverity(payload.severity)
  );
}

function normalizeInboundPayload(payload: any): FinanceEvent | SwarmMessage | null {
  if (isFinanceEvent(payload)) {
    return {
      ...payload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    };
  }

  if (isSwarmMessage(payload)) {
    return {
      ...payload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    };
  }

  return null;
}

async function fetchAndCacheQuotes(symbols: string[]) {
  if (!symbols.length) return;

  const results = await yahooFinance.quote(symbols.slice(0, 20));
  const quotes = Array.isArray(results) ? results : [results];

  for (const quote of quotes) {
    if (!quote?.symbol) continue;
    quoteCache.set(quote.symbol, {
      data: processQuote(quote),
      fetchedAt: Date.now(),
    });
  }
}

async function ensureQuotes(symbols: string[]) {
  const normalizedSymbols = [...new Set(symbols.filter(Boolean))];
  const missing = normalizedSymbols.filter((symbol) => {
    const cached = quoteCache.get(symbol);
    return !cached || !isCacheFresh(cached.fetchedAt, MARKET_CACHE_TTL_MS);
  });

  for (let i = 0; i < missing.length; i += 20) {
    await fetchAndCacheQuotes(missing.slice(i, i + 20));
  }
}

async function warmMarketCache() {
  try {
    await ensureQuotes(publicSymbols);
  } catch (error) {
    console.error("Market cache warm failed:", error);
  }
}

function getCachedQuotes(symbols: string[]) {
  const response: Record<string, MarketQuote> = {};

  for (const symbol of symbols) {
    const cached = quoteCache.get(symbol);
    if (cached) {
      response[symbol] = cached.data;
    }
  }

  return response;
}

function mapHistory(quotes: any[]) {
  return quotes
    .map((quote: any) => ({
      date: new Date(quote.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      fullDate: quote.date,
      price: quote.close,
    }))
    .filter((quote: any) => quote.price !== null);
}

function handleYahooError(error: any, defaultMessage: string) {
  let errorStatus = 500;
  let errorMessage = defaultMessage;

  if (error?.name === "YahooFinanceError") {
    if (
      error.message?.includes("Too Many Requests") ||
      error.code === "TooManyRequestsError" ||
      error.statusCode === 429
    ) {
      errorStatus = 429;
      errorMessage = "API_RATE_LIMITED";
    } else if (error.message?.includes("Not Found") || error.statusCode === 404) {
      errorStatus = 404;
      errorMessage = "INVALID_SYMBOL";
    }
  } else if (
    error?.message?.includes("No data found") ||
    error?.message?.includes("Not Found") ||
    error?.statusCode === 404
  ) {
    errorStatus = 404;
    errorMessage = "INVALID_OR_DELISTED_SYMBOL";
  }

  return {
    errorStatus,
    body: { error: errorMessage, details: error?.message ?? "Unknown upstream failure" },
  };
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  app.use(express.json());

  wss.on("connection", (ws, req) => {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const role = requestUrl.searchParams.get("role") ?? "ui";
    const token = requestUrl.searchParams.get("token");

    if (role === "ingest") {
      if (token !== INGESTION_TOKEN) {
        ws.send(JSON.stringify({ type: "SYSTEM", label: "INGESTION_UNAUTHORIZED", severity: "danger", timestamp: new Date().toISOString() }));
        ws.close(1008, "Unauthorized");
        return;
      }

      ws.send(JSON.stringify({ type: "SYSTEM", label: "INGESTION_CHANNEL_READY", severity: "success", timestamp: new Date().toISOString() }));

      ws.on("message", (rawMessage) => {
        try {
          const payload = normalizeInboundPayload(JSON.parse(rawMessage.toString()));
          if (!payload) {
            ws.send(JSON.stringify({ type: "SYSTEM", label: "INGESTION_PAYLOAD_REJECTED", severity: "warn", timestamp: new Date().toISOString() }));
            return;
          }

          broadcast(payload);
        } catch (error) {
          ws.send(JSON.stringify({ type: "SYSTEM", label: "INGESTION_PAYLOAD_INVALID_JSON", severity: "warn", timestamp: new Date().toISOString() }));
          console.error("Invalid ingestion payload:", error);
        }
      });

      return;
    }

    uiClients.add(ws);
    console.log(`UI client connected. Active clients: ${uiClients.size}`);
    ws.send(JSON.stringify({ type: "SYSTEM", label: "CONNECTION_ESTABLISHED: GEO_FEED_SYNCED", severity: "success", timestamp: new Date().toISOString() }));

    ws.on("close", () => {
      uiClients.delete(ws);
    });
  });

  setInterval(() => {
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const content = agentMessages[Math.floor(Math.random() * agentMessages.length)];
    const severity: SwarmMessage["severity"] = content.includes("Geopolitical") ? "danger" : "info";

    broadcast({
      type: "AGENT_TALK",
      agentName: agent.name,
      content,
      severity,
      timestamp: new Date().toISOString(),
    });
  }, 8000);

  await warmMarketCache();
  setInterval(warmMarketCache, MARKET_CACHE_TTL_MS);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      engine: "Finance-Worldview-Alpha",
      cache: {
        trackedSymbols: publicSymbols.length,
        uiClients: uiClients.size,
      },
    });
  });

  app.get("/api/universe", (_req, res) => {
    res.json({
      updatedAt: new Date().toISOString(),
      assets: UNIVERSE_STOCKS,
    });
  });

  app.get("/api/market/batch", async (req, res) => {
    const symbols = String(req.query.symbols ?? "")
      .split(",")
      .map((symbol) => decodeURIComponent(symbol).trim())
      .filter(Boolean)
      .slice(0, 50);

    if (!symbols.length) {
      res.json({});
      return;
    }

    try {
      await ensureQuotes(symbols);
      res.json(getCachedQuotes(symbols));
    } catch (error: any) {
      console.error("Batch Market API Error:", error);
      const mapped = handleYahooError(error, "UNABLE_TO_FETCH_BATCH_DATA");
      res.status(mapped.errorStatus).json(mapped.body);
    }
  });

  app.get("/api/market/:symbol", async (req, res) => {
    const symbol = req.params.symbol;

    try {
      await ensureQuotes([symbol]);
      const cached = quoteCache.get(symbol);

      if (!cached) {
        res.status(404).json({ error: "INVALID_SYMBOL", details: `${symbol} is not available.` });
        return;
      }

      res.json({ symbol, ...cached.data });
    } catch (error: any) {
      console.error("Market API Error:", error);
      const mapped = handleYahooError(error, "UNABLE_TO_FETCH_REAL_TIME_DATA");
      res.status(mapped.errorStatus).json(mapped.body);
    }
  });

  app.get("/api/market/history/:symbol", async (req, res) => {
    const symbol = req.params.symbol;
    const cached = historyCache.get(symbol);

    if (cached && isCacheFresh(cached.fetchedAt, HISTORY_CACHE_TTL_MS)) {
      res.json(cached.data);
      return;
    }

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);

      const result = await yahooFinance.chart(symbol, {
        period1: startDate,
        interval: "1d",
      });

      const chartData = result?.quotes?.length ? mapHistory(result.quotes) : [];
      historyCache.set(symbol, { data: chartData, fetchedAt: Date.now() });
      res.json(chartData);
    } catch (error: any) {
      console.error("History API Error:", error);
      const mapped = handleYahooError(error, "UNABLE_TO_FETCH_HISTORY");
      res.status(mapped.errorStatus).json(mapped.body);
    }
  });

  app.get("/api/backtest/:symbol", (req, res) => {
    const symbol = req.params.symbol;
    res.json({
      symbol,
      period: "12M",
      return: (Math.random() * 40 + 10).toFixed(2),
      maxDrawdown: (Math.random() * 15 + 5).toFixed(2),
      sharpeRatio: (Math.random() * 1.5 + 0.5).toFixed(2),
      trades: Math.floor(Math.random() * 50 + 10),
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Finance-Worldview System Active on http://localhost:${PORT}`);
    console.log(`Ingestion clients must connect with ?role=ingest&token=${INGESTION_TOKEN}`);
  });
}

startServer();
