import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import yf from 'yahoo-finance2';

// yahoo-finance2 v3 resolution for ESM/TSX
// In many ESM builds, the default export is the pre-initialized instance
let yahooFinance: any = yf;

// Error recovery for environments where it defaults to class
if (typeof yf === 'function') {
    try {
        yahooFinance = new (yf as any)();
    } catch (e) {
        yahooFinance = yf;
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });
  const PORT = 3000;

  // Real-Time Agent Swarm Simulated Brain
  const agents = [
    { name: 'MACRO_SCOUT', persona: 'Global Policy Tracker' },
    { name: 'IPO_HUNTER', persona: 'S-1 Filing Analyst' },
    { name: 'REUTERS_ALPHA', persona: 'Reuters LiveSentiment' },
    { name: 'PERPLEXITY_FI', persona: 'Quantum Reasoning Engine' },
    { name: 'GEO_INTEL', persona: 'Satellite Intelligence' }
  ];

  const agentMessages = [
    "Detected S-1 metadata for Databricks. Imminent pulse detected.",
    "IMF liquidity signal correlates with Swiss SMI rebound.",
    "Reuters Flash: Klarna finalizing NY listing with 18% premium.",
    "Perplexity Analysis: Aerospace nodes showing 4x momentum divergence.",
    "Geopolitical Alert: Malacca Strait bottleneck increasing shipping risk premiums.",
    "Crypto-Infra nodes accumulating across GCC satellite hubs."
  ];

  // Enhanced Finance Events (Geo Alpha Pulse)
  const financeEvents = [
    { type: 'MACRO_PULSE', label: 'Reuters: SNB Rate Projection Adjusted', severity: 'info', source: 'REUTERS' },
    { type: 'GEOPOLITICAL', label: 'Perplexity: Middle East Shipping Route Escalation', severity: 'danger', source: 'PERPLEXITY' },
    { type: 'MARKET_CATALYST', label: 'Market Pulse: RKLB (+12%) Aerospace Breakout', symbol: 'RKLB', severity: 'success', source: 'BLOOMBERG' },
    { type: 'AIS_ALERT', label: 'Energy Tanker "NEPTUNE" Diverting from Suez', lat: 29.9, lon: 32.5, severity: 'warn', source: 'GEO_INTEL' }
  ];

  wss.on("connection", (ws) => {
    console.log("Client connected to Finance-Worldview Pulse");
    
    ws.send(JSON.stringify({ type: 'SYSTEM', label: 'CONNECTION_ESTABLISHED: GEO_FEED_SYNCED' }));

    // Stream Geo Events
    const geoInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const event = financeEvents[Math.floor(Math.random() * financeEvents.length)];
        ws.send(JSON.stringify({
          ...event,
          timestamp: new Date().toISOString()
        }));
      }
    }, 7000);

    // Stream Agent Swarm Messages (Higher Density for Persona Focus)
    const swarmInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            const agent = agents[Math.floor(Math.random() * agents.length)];
            const msg = agentMessages[Math.floor(Math.random() * agentMessages.length)];
            ws.send(JSON.stringify({
                type: 'AGENT_TALK',
                agentName: agent.name,
                content: msg,
                timestamp: new Date().toISOString(),
                severity: msg.includes('critical') || msg.includes('Geopolitical') ? 'danger' : 'info'
            }));
        }
    }, 8000);

    ws.on("close", () => {
        clearInterval(geoInterval);
        clearInterval(swarmInterval);
    });
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", engine: "Finance-Worldview-Alpha" });
  });

  // Real Market Data Proxy (Comprehensive Batch)
  app.get("/api/market/batch", async (req, res) => {
    const symbols = (req.query.symbols as string || "").split(",");
    if (!symbols.length || symbols[0] === "") return res.json({});
    try {
        const results = await yahooFinance.quote(symbols.slice(0, 20)); 
        const map: any = {};
        const processQuote = (r: any) => ({
            price: r.regularMarketPrice,
            change1d: r.regularMarketChangePercent,
            volume: r.regularMarketVolume,
            marketCap: r.marketCap,
            lastUpdated: new Date().toISOString()
        });

        if (Array.isArray(results)) {
            (results as any[]).forEach(r => { map[r.symbol] = processQuote(r); });
        } else if (results) {
            map[(results as any).symbol] = processQuote(results);
        }
        res.json(map);
    } catch (e: any) {
        console.error("Batch Market API Error:", e);
        
        let errorStatus = 500;
        let errorMessage = "UNABLE_TO_FETCH_BATCH_DATA";

        if (e.name === 'YahooFinanceError') {
            if (e.message.includes('Too Many Requests') || e.code === 'TooManyRequestsError' || e.statusCode === 429) {
                errorStatus = 429;
                errorMessage = "API_RATE_LIMITED";
            } else if (e.message.includes('Not Found') || e.statusCode === 404) {
                errorStatus = 404;
                errorMessage = "INVALID_SYMBOL_IN_BATCH";
            }
        }

        res.status(errorStatus).json({ error: errorMessage, details: e.message });
    }
  });

  app.get("/api/market/:symbol", async (req, res) => {
    try {
        const result = await yahooFinance.quote(req.params.symbol);
        res.json(result);
    } catch (e: any) {
        console.error("Market API Error:", e);
        
        let errorStatus = 500;
        let errorMessage = "UNABLE_TO_FETCH_REAL_TIME_DATA";

        if (e.name === 'YahooFinanceError') {
            if (e.message.includes('Too Many Requests') || e.code === 'TooManyRequestsError' || e.statusCode === 429) {
                errorStatus = 429;
                errorMessage = "API_RATE_LIMITED";
            } else if (e.message.includes('Not Found') || e.statusCode === 404) {
                errorStatus = 404;
                errorMessage = "INVALID_SYMBOL";
            }
        }

        res.status(errorStatus).json({ error: errorMessage, details: e.message });
    }
  });

  app.get("/api/market/history/:symbol", async (req, res) => {
    try {
        const symbol = req.params.symbol;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(endDate.getFullYear() - 1);

        const result = await yahooFinance.chart(symbol, {
            period1: startDate,
            interval: '1d'
        });
        
        if (!result || !result.quotes || result.quotes.length === 0) {
            return res.json([]);
        }

        // Return simplified series for Recharts
        const chartData = result.quotes.map((q: any) => ({
            date: new Date(q.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            fullDate: q.date,
            price: q.close
        })).filter((q: any) => q.price !== null);

        res.json(chartData);
    } catch (e: any) {
        console.error("History API Error:", e);
        
        let errorStatus = 500;
        let errorMessage = "UNABLE_TO_FETCH_HISTORY";

        if (e.message?.includes('No data found') || e.message?.includes('Not Found') || e.statusCode === 404) {
            errorStatus = 404;
            errorMessage = "INVALID_OR_DELISTED_SYMBOL";
        }

        res.status(errorStatus).json({ error: errorMessage, details: e.message });
    }
  });

  // Mirofish Backtesting Mock
  app.get("/api/backtest/:symbol", (req, res) => {
      const symbol = req.params.symbol;
      res.json({
          symbol,
          period: '12M',
          return: (Math.random() * 40 + 10).toFixed(2),
          maxDrawdown: (Math.random() * 15 + 5).toFixed(2),
          sharpeRatio: (Math.random() * 1.5 + 0.5).toFixed(2),
          trades: Math.floor(Math.random() * 50 + 10)
      });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Finance-Worldview System Active on http://localhost:${PORT}`);
  });
}

startServer();
