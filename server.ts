import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });
  const PORT = 3000;

  // Mock Data Stream Logic (Enhanced for Pre-Mover Persona)
  const financeEvents = [
    { type: 'AIS_ALERT', label: 'Tanker "SUEZ_ALPHA" entering Red Sea', lat: 21.0, lon: 38.0, severity: 'warn', source: 'GEO_INT' },
    { type: 'AERO_ALERT', label: 'Rocket Lab Electron Launch Prep (MAHIA)', lat: -39.26, lon: 177.86, severity: 'info', source: 'BLOOMBERG' },
    { type: 'CRYPTO_NODE', label: 'Circle Treasury Settlement Node Active (NY)', lat: 40.71, lon: -74.00, severity: 'success', source: 'GEO_INT' },
    { type: 'MARKET_CATALYST', label: 'Unusual Volume Spike: PLTR (+150% vs 30D avg)', symbol: 'PLTR', severity: 'danger', source: 'BLOOMBERG' },
    { type: 'MACRO_PULSE', label: 'IMF Update: Swiss inflation expectation adjusted to 1.2%', severity: 'info', source: 'IMF' },
    { type: 'GEOPOLITICAL', label: 'US Leadership Schedule: Trade delegation arriving in Taipei', lat: 25.03, lon: 121.56, severity: 'warn', source: 'GEO_INT' },
    { type: 'MACRO_PULSE', label: 'Bloomberg: Klarna IPO listing date finalized for Q3', severity: 'success', source: 'BLOOMBERG' }
  ];

  wss.on("connection", (ws) => {
    console.log("Client connected to Finance-Worldview Pulse");
    
    // Send initial welcome
    ws.send(JSON.stringify({ type: 'SYSTEM', message: 'CONNECTION_ESTABLISHED: GEO_FEED_SYNCED' }));

    // Stream random events every 5-10 seconds
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const event = financeEvents[Math.floor(Math.random() * financeEvents.length)];
        ws.send(JSON.stringify({
          ...event,
          timestamp: new Date().toISOString()
        }));
      }
    }, 7000);

    ws.on("close", () => clearInterval(interval));
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", engine: "Finance-Worldview-Alpha" });
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
