import { useMemo, useEffect, useCallback } from 'react';
import { MOCK_STOCKS, StockNode, WatchlistNode } from './types';
import PreMoverScorecard from './components/hud/PreMoverScorecard';
import GlobeView from './canvas/GlobeView';
import FlatView from './canvas/FlatView';
import EquityMonitor from './components/hud/EquityMonitor';
import LiveFeedSidebar from './components/hud/LiveFeedSidebar';
import AIChat from './components/hud/AIChat';
import Mirofish from './components/hud/Mirofish';
import DeepDive from './components/hud/DeepDive';
import WatchlistPanel from './components/hud/WatchlistPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Globe, 
  Map as MapIcon, 
  Activity,
  Layers,
  ChevronRight,
  ShieldAlert,
  Terminal,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useMarketState } from './store/useMarketState';
import { useSpatialState } from './store/useSpatialState';
import { useScreenState } from './store/useScreenState';
import { useWatchlistState } from './store/useWatchlistState';

// Watchlist nodes carry fewer fields than a full StockNode; fill spatial-render
// defaults so they can flow through the same globe/monitor pipeline.
const watchlistAsStock = (n: WatchlistNode): StockNode => ({
  ticker: n.ticker,
  name: n.name,
  country: '',
  iso_code: '',
  lat: n.lat,
  lon: n.lon,
  exchange: n.exchange,
  sector: n.sector,
  themes: [],
  marketCap: n.marketCap,
  price: n.price,
  change1d: n.change1d,
  change5d: 0,
  volume: 0,
  avg30dVolume: 1,
  lastUpdated: n.lastUpdated,
});

export default function App() {
  // Decentralized State via Zustand
  const { 
    liveQuotes, setLiveQuotes, 
    selectedStock, setSelectedStock,
    events, addEvent,
    swarmMessages, addSwarmMessage,
    isRefreshing, setIsRefreshing,
    syncError, setSyncError
  } = useMarketState();

  const {
    viewMode, setViewMode,
    activeLayers, toggleLayer,
    colorMode, setColorMode,
    searchQuery, setSearchQuery,
    showSignals, setShowSignals
  } = useSpatialState();

  const { addReport, setReports, setActiveReport } = useScreenState();
  const { nodes: watchlistNodes, setNodes: setWatchlistNodes, addNode: addWatchlistNode, removeNode: removeWatchlistNode } = useWatchlistState();

  // Base universe = mock universe + user watchlist companies (deduped).
  const baseNodes = useMemo(() => {
    const extra = watchlistNodes
      .filter(w => !MOCK_STOCKS.some(m => m.ticker === w.ticker))
      .map(watchlistAsStock);
    return [...MOCK_STOCKS, ...extra];
  }, [watchlistNodes]);

  const fetchBatch = useCallback(async () => {
    setIsRefreshing(true);
    setSyncError(null);
    
    const symbolList = baseNodes
      .filter(s => s.exchange && !s.exchange.includes('PRIVATE'))
      .map(s => encodeURIComponent(s.ticker));

    if (symbolList.length === 0) {
        setIsRefreshing(false);
        return;
    }

    const symbols = symbolList.join(',');

    try {
      const apiUrl = new URL('/api/market/batch', window.location.origin);
      apiUrl.searchParams.set('symbols', symbols);
      
      const res = await fetch(apiUrl.toString());
      const data = await res.json();
      
      if (!res.ok) {
        setSyncError({ code: data.error, message: data.details || 'Sync Failed' });
      } else {
        setLiveQuotes(data);
      }
    } catch (e: any) {
      console.error("Real-Market Sync Failure", e);
      setSyncError({ code: 'NETWORK_ERROR', message: e.message || 'Unable to reach sync bridge.' });
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  }, [baseNodes, setIsRefreshing, setSyncError, setLiveQuotes]);

  // WebSocket Ingest
  useEffect(() => {
    if (!window.location.host) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    let ws: WebSocket;
    try {
        ws = new WebSocket(wsUrl);
    } catch (e) {
        console.error("WebSocket Initialization Failed", e);
        return;
    }

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event.type === 'AGENT_TALK') {
            addSwarmMessage(event);
        } else if (event.type === 'SCREEN_REPORT') {
            addReport(event.payload);
        } else if (event.type === 'WATCHLIST_ADD') {
            addWatchlistNode(event.payload);
        } else if (event.type === 'WATCHLIST_REMOVE') {
            removeWatchlistNode(event.payload.ticker);
        } else {
            addEvent(event);
        }
      } catch (e) {
        console.error("Pulse Sync Error", e);
      }
    };

    return () => ws.close();
  }, [addEvent, addSwarmMessage, addReport, addWatchlistNode, removeWatchlistNode]);

  // Initial hydration of screening reports (index + latest full blob).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch(new URL('/api/screen/reports?limit=20', window.location.origin).toString());
        if (listRes.ok && !cancelled) setReports(await listRes.json());

        const latestRes = await fetch(new URL('/api/screen/report/latest', window.location.origin).toString());
        if (latestRes.ok && !cancelled) setActiveReport(await latestRes.json());

        const wlRes = await fetch(new URL('/api/watchlist', window.location.origin).toString());
        if (wlRes.ok && !cancelled) setWatchlistNodes(await wlRes.json());
      } catch (e) {
        console.error('HYDRATION_ERROR', e);
      }
    })();
    return () => { cancelled = true; };
  }, [setReports, setActiveReport, setWatchlistNodes]);

  // Periodic Sync
  useEffect(() => {
      fetchBatch();
      const interval = setInterval(fetchBatch, 30000);
      return () => clearInterval(interval);
  }, [fetchBatch]);

  const processedStocks = useMemo(() => {
    return baseNodes.map(s => {
      const volumeSurge = s.volume / s.avg30dVolume;
      const quote = liveQuotes[s.ticker];
      
      const currentPrice = (quote && quote.price !== undefined && quote.price !== null) ? Number(quote.price) : s.price;
      const currentChange = (quote && quote.change1d !== undefined && quote.change1d !== null) ? Number(quote.change1d) : s.change1d;

      return {
        ...s,
        price: currentPrice,
        change1d: currentChange,
        volume: (quote && quote.volume) ? Number(quote.volume) : s.volume,
        marketCap: (quote && quote.marketCap) ? Number(quote.marketCap) : s.marketCap,
        lastUpdated: quote?.lastUpdated,
        isStale: quote ? (new Date().getTime() - new Date(quote.lastUpdated).getTime() > 45000) : true,
        volumeSurge: quote ? Number(quote.volume) / s.avg30dVolume : volumeSurge,
      };
    });
  }, [liveQuotes, baseNodes]);

  const filteredStocks = useMemo(() => {
    return processedStocks.filter(stock => {
      const matchesSearch = stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [processedStocks, searchQuery]);

  return (
    <div className="grid grid-rows-[36px_1fr] grid-cols-[15%_55%_30%] h-screen w-screen overflow-hidden bg-[#05070a] font-mono selection:bg-terminal-cyan/30 text-white">
      {/* Command Line Header */}
      <header className="col-span-3 border-b border-[#1c2330] bg-[#0c0f14] flex items-center px-5 z-50 shadow-lg">
        <div className="flex items-center gap-3 flex-1">
          <Terminal size={13} className="text-terminal-cyan" />
          <span className="text-[10px] text-terminal-cyan font-black tracking-widest">&gt;</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="LOAD_SIGNAL_NODE..."
            className="bg-transparent border-none outline-none text-[10px] text-white placeholder:text-zinc-700 tracking-widest flex-1 max-w-xs"
          />
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-widest text-zinc-600">
            <span>MARKET_SYNC:</span>
            <div className={cn("w-1.5 h-1.5 rounded-full", isRefreshing ? "bg-terminal-gold animate-pulse" : "bg-terminal-green animate-pulse")} />
            <span>{isRefreshing ? 'SYNCING' : 'LIVE'}</span>
          </div>
          <div className="w-px h-4 bg-[#1c2330]" />
          <span className="text-[8px] text-zinc-700 font-black">UTC {new Date().toLocaleTimeString('en-US', { hour12: false }).slice(0, 5)}</span>
        </div>
      </header>

      {/* Left Column: Operational Layers (15%) */}
      <aside className="border-r border-[#1c2330] bg-[#0c0f14] flex flex-col p-3 z-10 overflow-y-auto select-none gap-3">
        <div>
          <div className="text-[8px] font-black uppercase tracking-widest text-terminal-cyan mb-2">▼ MARKET REGIONS</div>
          <div className="space-y-1.5">
            {['NORTH AMERICA', 'EUROPEAN BLOC', 'ASIA-PACIFIC'].map((region, idx) => (
              <label key={region} className="flex items-center gap-2 cursor-pointer group text-[9px] hover:text-terminal-cyan transition-colors">
                <input
                  type="checkbox"
                  defaultChecked={idx < 2}
                  className="w-3 h-3 cursor-pointer"
                  onChange={() => toggleLayer(region)}
                />
                <span className="text-zinc-400 group-hover:text-white">{region}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-[#1c2330] pt-3">
          <div className="text-[8px] font-black uppercase tracking-widest text-terminal-cyan mb-2">▼ SPATIAL OVERLAYS</div>
          <div className="space-y-1.5">
            {['CORE EXCHANGES', 'ARBITRAGE CORRIDORS', 'SUPPLY CHAINS'].map((overlay, idx) => (
              <label key={overlay} className="flex items-center gap-2 cursor-pointer group text-[9px] hover:text-terminal-cyan transition-colors">
                <input
                  type="checkbox"
                  defaultChecked={idx < 2}
                  className="w-3 h-3 cursor-pointer"
                  onChange={() => toggleLayer(overlay)}
                />
                <span className="text-zinc-400 group-hover:text-white">{overlay}</span>
              </label>
            ))}
          </div>
        </div>

        {syncError && (
          <div className="mt-auto text-[8px] text-terminal-red uppercase tracking-widest border border-terminal-red/40 bg-terminal-red/5 p-2 rounded-sm">
            <div className="font-black mb-1">{syncError.code}</div>
            <div className="text-white/50">{syncError.message}</div>
          </div>
        )}
      </aside>

      {/* Center Column: Cinematic Global View (55%) */}
      <main className="relative bg-[#02020a] overflow-hidden group border-r border-[#1c2330]">
        <ErrorBoundary label="SPATIAL_CANVAS">
          {viewMode === 'globe' ? (
            <GlobeView
              stocks={filteredStocks}
              events={events}
              activeLayers={activeLayers}
              onSelectStock={setSelectedStock}
              selectedStock={selectedStock}
              colorMode={colorMode}
            />
          ) : (
            <FlatView
              stocks={filteredStocks}
              events={events}
              activeLayers={activeLayers}
              onSelectStock={setSelectedStock}
              selectedStock={selectedStock}
              colorMode={colorMode}
            />
          )}
        </ErrorBoundary>

        {/* Aurora Borealis Effect Overlay */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#1a4d3e]/20 via-[#00ff8044] to-transparent pointer-events-none" />

        {/* Ticker Tape Bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0c0f14] to-transparent border-t border-[#1c2330] px-4 py-2 flex items-center gap-6 overflow-x-auto no-scrollbar text-[8px] text-zinc-600 font-mono">
          {filteredStocks.slice(0, 8).map(s => (
            <span key={s.ticker} className="shrink-0 hover:text-terminal-cyan cursor-pointer transition-colors">
              {s.ticker} <span className={s.change1d >= 0 ? 'text-terminal-green' : 'text-terminal-red'}>{s.change1d >= 0 ? '+' : ''}{Number(s.change1d).toFixed(2)}%</span>
            </span>
          ))}
        </div>
      </main>

      {/* Right Column: Watchlist Pipeline (30%) */}
      <aside className="border-l border-[#1c2330] bg-[#0c0f14] flex flex-col p-3 z-20 overflow-y-auto">
        <div className="mb-4">
          <div className="text-[8px] font-black uppercase tracking-widest text-terminal-cyan mb-2">▼ SCREENED ({watchlistNodes.filter(n => n.sector === 'screened').length})</div>
          <div className="space-y-1.5">
            {watchlistNodes.filter(n => n.sector === 'screened').slice(0, 3).map(node => (
              <div
                key={node.ticker}
                onClick={() => setSelectedStock(watchlistAsStock(node))}
                className="bg-[#1a1f2e] border border-[#1c2330] hover:border-terminal-cyan/40 p-2 rounded-sm cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-black text-white">{node.ticker}</span>
                  <span className={cn("text-[8px] font-bold", node.change1d >= 0 ? 'text-terminal-green' : 'text-terminal-red')}>
                    {node.change1d >= 0 ? '+' : ''}{Number(node.change1d).toFixed(1)}%
                  </span>
                </div>
                <div className="text-[7px] text-zinc-600">
                  ${Number(node.price).toFixed(2)} · {node.exchange}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#1c2330] pt-3 mb-4">
          <div className="text-[8px] font-black uppercase tracking-widest text-terminal-cyan mb-2">▼ DUE DILIGENCE (1)</div>
          <div className="bg-[#1a1f2e] border border-[#1c2330] p-2 rounded-sm text-[8px] text-zinc-600">
            <span className="text-white font-black">Monitor for signals…</span>
          </div>
        </div>

        <div className="border-t border-[#1c2330] pt-3">
          <div className="text-[8px] font-black uppercase tracking-widest text-terminal-cyan mb-2">▼ ANALYSIS (2)</div>
          <div className="space-y-1.5">
            {watchlistNodes.slice(0, 2).map(node => (
              <div
                key={node.ticker}
                onClick={() => setSelectedStock(watchlistAsStock(node))}
                className="bg-[#1a1f2e] border border-[#1c2330] hover:border-terminal-cyan/40 p-2 rounded-sm cursor-pointer transition-all"
              >
                <div className="text-[8px] text-white font-bold">{node.ticker}</div>
                <div className="text-[7px] text-zinc-600">${Number(node.price).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
    </div>
  );
}
