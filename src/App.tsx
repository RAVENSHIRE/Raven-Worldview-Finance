import { useMemo, useEffect, useCallback, useState } from 'react';
import { MOCK_STOCKS, StockNode, WatchlistNode } from './types';
import PreMoverScorecard from './components/hud/PreMoverScorecard';
import GlobeView from './canvas/GlobeView';
import FlatView from './canvas/FlatView';
import EquityMonitor from './components/hud/EquityMonitor';
import AIChat from './components/hud/AIChat';
import DeepDive from './components/hud/DeepDive';
import WatchlistPanel from './components/hud/WatchlistPanel';
import NodeTooltip from './components/hud/NodeTooltip';
import PipelineCards from './components/hud/PipelineCards';
import ValuationModel from './components/hud/ValuationModel';
import RiskExposurePanel from './components/hud/RiskExposurePanel';
import WatchlistMatrix from './components/hud/WatchlistMatrix';
import ResearchHub from './components/hud/ResearchHub';
import ReportsTerminal from './components/hud/ReportsTerminal';
import ModularPanes from './components/hud/ModularPanes';
import ErrorBoundary from './components/ErrorBoundary';
import { cn } from './lib/utils';
import {
  Globe,
  Map as MapIcon,
  Activity,
  Terminal,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  CandlestickChart,
  Youtube,
  PanelRightClose,
} from 'lucide-react';
import { useMarketState } from './store/useMarketState';
import { useSpatialState } from './store/useSpatialState';
import { useScreenState } from './store/useScreenState';
import { useWatchlistState } from './store/useWatchlistState';
import { useInteractionState, LayerToggles } from './store/useInteractionState';

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

type Page = 'pipeline' | 'analyst' | 'watchlist' | 'research' | 'reports';

const PAGES: { id: Page; label: string }[] = [
  { id: 'pipeline', label: 'PIPELINE' },
  { id: 'analyst', label: 'ANALYST' },
  { id: 'watchlist', label: 'WATCHLIST' },
  { id: 'research', label: 'RESEARCH' },
  { id: 'reports', label: 'REPORTS' },
];

const LAYER_DEFS: { key: keyof LayerToggles; label: string }[] = [
  { key: 'livePortfolio', label: 'LIVE PORTFOLIO' },
  { key: 'topMovers', label: 'DAILY TOP MOVERS' },
  { key: 'supplyChain', label: 'SUPPLY CHAIN CORRIDORS' },
];

export default function App() {
  const {
    liveQuotes, setLiveQuotes,
    selectedStock, setSelectedStock,
    events, addEvent,
    swarmMessages, addSwarmMessage,
    isRefreshing, setIsRefreshing,
    syncError, setSyncError
  } = useMarketState();

  const { viewMode, setViewMode, colorMode, setColorMode } = useSpatialState();
  const { addReport, setReports, setActiveReport } = useScreenState();
  const { nodes: watchlistNodes, setNodes: setWatchlistNodes, addNode: addWatchlistNode, removeNode: removeWatchlistNode } = useWatchlistState();

  const layers = useInteractionState(s => s.layers);
  const toggleLayerKey = useInteractionState(s => s.toggleLayerKey);
  const focusedTicker = useInteractionState(s => s.focusedTicker);
  const focusTicker = useInteractionState(s => s.focusTicker);
  const setIntel = useInteractionState(s => s.setIntel);
  const macro = useInteractionState(s => s.macro);
  const setMacro = useInteractionState(s => s.setMacro);

  const [page, setPage] = useState<Page>('pipeline');
  const [command, setCommand] = useState('');
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  // Pipeline modularity: foldable rail + monitor. Collapsing the rail
  // expands the 3D globe container to a full-bleed viewport.
  const [railOpen, setRailOpen] = useState(true);
  const [monitorOpen, setMonitorOpen] = useState(true);
  const addPane = useInteractionState(s => s.addPane);

  const watchlistTickers = useMemo(
    () => new Set(watchlistNodes.map(n => n.ticker)),
    [watchlistNodes]
  );

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

    try {
      const apiUrl = new URL('/api/market/batch', window.location.origin);
      apiUrl.searchParams.set('symbols', symbolList.join(','));

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
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${protocol}//${window.location.host}`);
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
        } else if (event.type === 'INTEL_REPORT') {
          setIntel(event.payload);
        } else if (event.type === 'MACRO_UPDATE') {
          setMacro(event.payload);
        } else {
          addEvent(event);
        }
      } catch (e) {
        console.error("Pulse Sync Error", e);
      }
    };

    return () => ws.close();
  }, [addEvent, addSwarmMessage, addReport, addWatchlistNode, removeWatchlistNode, setIntel, setMacro]);

  // Initial hydration of screening reports + watchlist.
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

        const macroRes = await fetch(new URL('/api/macro', window.location.origin).toString());
        if (macroRes.ok && !cancelled) setMacro(await macroRes.json());
      } catch (e) {
        console.error('HYDRATION_ERROR', e);
      }
    })();
    return () => { cancelled = true; };
  }, [setReports, setActiveReport, setWatchlistNodes, setMacro]);

  // Pull the intelligence report for the focused asset (supply-chain web +
  // tooltip narrative). 404 just means the worker hasn't covered it yet.
  useEffect(() => {
    if (!focusedTicker) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(new URL(`/api/intel/${focusedTicker}`, window.location.origin).toString());
        if (res.ok && !cancelled) setIntel(await res.json());
      } catch { /* intel is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [focusedTicker, setIntel]);

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

  const selectAndFocus = useCallback((s: StockNode) => {
    setSelectedStock(s);
    focusTicker(s.ticker);
  }, [setSelectedStock, focusTicker]);

  // "> LOAD PLTR" command: focus an existing node, or add it to the
  // watchlist first so it lands on the globe and then gets focused.
  const runCommand = useCallback(async () => {
    const raw = command.trim();
    if (!raw) return;
    const ticker = raw.replace(/^load\s+/i, '').trim().toUpperCase();
    setCommand('');
    setCommandStatus(null);

    const existing = processedStocks.find(s => s.ticker === ticker);
    if (existing) {
      selectAndFocus(existing);
      setPage('pipeline');
      return;
    }

    setCommandStatus(`RESOLVING ${ticker}…`);
    try {
      const res = await fetch(new URL('/api/watchlist', window.location.origin).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (res.ok) {
        addWatchlistNode(data);
        selectAndFocus(watchlistAsStock(data));
        setPage('pipeline');
        setCommandStatus(null);
      } else {
        setCommandStatus(data.error === 'SYMBOL_NOT_FOUND' ? `UNKNOWN_SYMBOL: ${ticker}` : (data.error || 'LOAD_FAILED'));
      }
    } catch {
      setCommandStatus('NETWORK_ERROR');
    }
  }, [command, processedStocks, selectAndFocus, addWatchlistNode]);

  const riskOff = macro?.environment === 'risk-off';

  return (
    <div className={cn(
      "flex flex-col h-screen w-screen overflow-hidden bg-terminal-bg font-mono selection:bg-terminal-cyan/30 text-white",
      riskOff && "risk-off"
    )}>

      {/* ── Command Bar ── */}
      <header className="h-10 shrink-0 border-b border-terminal-line bg-terminal-panel flex items-center px-4 gap-4 z-50">
        <div className="flex items-center gap-2 shrink-0">
          <Activity className="text-terminal-cyan" size={13} />
          <span className="font-black tracking-widest text-[10px] uppercase hidden lg:inline">
            PRE-MOVER <span className="text-terminal-cyan">SYSTEMS</span>
          </span>
        </div>

        <nav className="flex items-center shrink-0">
          {PAGES.map((p, i) => (
            <span key={p.id} className="flex items-center">
              {i > 0 && <span className="text-zinc-800 text-[9px] px-1">|</span>}
              <button
                onClick={() => setPage(p.id)}
                className={cn(
                  "px-2 py-1 text-[9px] font-black tracking-widest transition-all",
                  page === p.id ? "text-terminal-cyan" : "text-zinc-600 hover:text-white"
                )}
              >
                {p.label}{page === p.id && <span className="text-terminal-cyan/60"> (Active)</span>}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-2 flex-1 max-w-sm bg-black/40 border border-terminal-line rounded-sm px-2.5 py-1 focus-within:border-terminal-cyan/60 transition-colors">
          <Terminal size={11} className="text-terminal-cyan shrink-0" />
          <span className="text-terminal-cyan text-[10px] font-black">&gt;</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runCommand()}
            placeholder="LOAD PLTR"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[10px] uppercase tracking-widest placeholder:text-zinc-700"
          />
          {commandStatus && (
            <span className="text-[8px] text-terminal-gold uppercase tracking-widest shrink-0">{commandStatus}</span>
          )}
        </div>

        <div className="flex items-center gap-4 ml-auto shrink-0">
          {page === 'pipeline' && (
            <div className="flex gap-0.5 p-0.5 bg-black/40 border border-terminal-line rounded-sm">
              <button
                onClick={() => setViewMode('globe')}
                className={cn("p-1 rounded-[1px]", viewMode === 'globe' ? "bg-terminal-cyan text-black" : "text-zinc-600 hover:text-white")}
              ><Globe size={11} /></button>
              <button
                onClick={() => setViewMode('flat')}
                className={cn("p-1 rounded-[1px]", viewMode === 'flat' ? "bg-terminal-cyan text-black" : "text-zinc-600 hover:text-white")}
              ><MapIcon size={11} /></button>
            </div>
          )}
          <button
            onClick={() => setColorMode(colorMode === 'change' ? 'trump_beta' : 'change')}
            className="text-[8px] font-black uppercase tracking-widest text-zinc-500 hover:text-terminal-cyan transition-colors hidden md:inline"
          >
            {colorMode === 'change' ? 'REAL_TIME_1D' : 'MACRO_REVAL_β'}
          </button>
          {macro && macro.environment !== 'neutral' && (
            <span
              title={macro.summary}
              className={cn(
                "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm border",
                riskOff
                  ? "text-terminal-gold border-terminal-gold/50 bg-terminal-gold/10 animate-pulse"
                  : "text-terminal-green border-terminal-green/40 bg-terminal-green/5"
              )}
            >
              MACRO: {macro.environment.toUpperCase()}
            </span>
          )}
          <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-widest text-zinc-600">
            <span>SYNC</span>
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isRefreshing ? "bg-terminal-gold" : syncError ? "bg-terminal-red" : "bg-terminal-green")} />
          </div>
          <span className="text-[8px] text-zinc-700 font-black tracking-widest">
            UTC {new Date().toISOString().slice(11, 16)}
          </span>
        </div>
      </header>

      {/* ── Pages ── */}
      <div className="flex-1 min-h-0 relative">

        {/* PIPELINE — cinematic globe + monitor + watchlist pipeline rail.
            Kept mounted (hidden) so the WebGL canvas survives page switches.
            Rail fold collapses the right column → full-bleed globe viewport. */}
        <div
          className={cn("absolute inset-0 grid transition-[grid-template-columns] duration-300", page !== 'pipeline' && "hidden")}
          style={{ gridTemplateColumns: railOpen ? '1fr 340px' : '1fr 0px' }}
        >
          <div className="flex flex-col min-w-0 min-h-0 overflow-hidden border-r border-terminal-line">
            {/* Globe canvas */}
            <div className="relative flex-1 min-h-0">
              <ErrorBoundary label="SPATIAL_CANVAS">
                {viewMode === 'globe' ? (
                  <GlobeView
                    stocks={processedStocks}
                    events={events}
                    activeLayers={[]}
                    onSelectStock={selectAndFocus}
                    selectedStock={selectedStock}
                    colorMode={colorMode}
                    portfolioTickers={watchlistTickers}
                  />
                ) : (
                  <FlatView
                    stocks={processedStocks}
                    events={events}
                    activeLayers={[]}
                    onSelectStock={selectAndFocus}
                    selectedStock={selectedStock}
                    colorMode={colorMode}
                  />
                )}
              </ErrorBoundary>

              <NodeTooltip stocks={processedStocks} />

              {/* Modularity grid: floating split-screen workspace panes */}
              <ModularPanes />

              {/* Spin-out launcher for the focused asset (inline chart / video) */}
              {selectedStock && (
                <div className="absolute top-12 left-3 flex items-center gap-1.5 rounded-sm border border-terminal-line bg-terminal-panel/70 backdrop-blur-md px-2 py-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white">{selectedStock.ticker} ::</span>
                  <button
                    onClick={() => addPane('chart', selectedStock.ticker)}
                    className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-terminal-cyan hover:text-white transition-colors"
                  >
                    <CandlestickChart size={10} /> CHART+
                  </button>
                  <span className="text-zinc-800">|</span>
                  <button
                    onClick={() => addPane('video', selectedStock.ticker)}
                    className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-terminal-red hover:text-white transition-colors"
                  >
                    <Youtube size={10} /> VIDEO+
                  </button>
                </div>
              )}

              {/* Neon rail fold toggle — low-profile, docked to the seam */}
              <button
                onClick={() => setRailOpen(o => !o)}
                title={railOpen ? 'Collapse pipeline rail (full-bleed globe)' : 'Expand pipeline rail'}
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 right-0 z-40 h-14 w-4 flex items-center justify-center",
                  "rounded-l-sm border border-r-0 transition-all",
                  railOpen
                    ? "border-terminal-line text-zinc-600 hover:text-terminal-cyan hover:border-terminal-cyan/60 bg-terminal-panel/80"
                    : "border-terminal-cyan/60 text-terminal-cyan bg-terminal-cyan/10 shadow-[0_0_12px_rgba(0,240,255,0.35)]"
                )}
              >
                {railOpen ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
              </button>

              {/* Grid status chip */}
              <div className="absolute top-3 left-3 flex items-center gap-2 border-l-2 border-terminal-cyan bg-black/50 backdrop-blur-sm px-3 py-1.5 pointer-events-none select-none">
                <div className="w-2 h-2 rounded-full bg-terminal-cyan shadow-[0_0_10px_#00f0ff] animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest">
                  GRID_ACTIVE: {Object.values(layers).filter(Boolean).length} LAYERS
                </span>
              </div>

              {/* Layer micro-toggles accordion */}
              <div className="absolute top-3 right-3 w-52 rounded-sm border border-terminal-line bg-terminal-panel/70 backdrop-blur-md select-none">
                <button
                  onClick={() => setLayersOpen(o => !o)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-terminal-cyan"
                >
                  {layersOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                  SPATIAL LAYERS
                </button>
                {layersOpen && (
                  <div className="px-3 pb-2 space-y-1">
                    {LAYER_DEFS.map(l => (
                      <label key={l.key} className="flex items-center gap-2 cursor-pointer group text-[8px]">
                        <input
                          type="checkbox"
                          checked={layers[l.key]}
                          onChange={() => toggleLayerKey(l.key)}
                          className="w-2.5 h-2.5 accent-[#00f0ff] cursor-pointer"
                        />
                        <span className="text-zinc-400 group-hover:text-white transition-colors">{l.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Risk & Exposure spatial overlay */}
              <div className="absolute bottom-3 left-3">
                <ErrorBoundary label="RISK_EXPOSURE">
                  <RiskExposurePanel stocks={processedStocks} portfolioTickers={watchlistTickers} />
                </ErrorBoundary>
              </div>

              {/* Legend */}
              <div className="absolute bottom-3 right-3 rounded-sm border border-terminal-line bg-black/50 backdrop-blur-sm px-3 py-2 pointer-events-none select-none">
                <div className="text-[8px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">LEGEND</div>
                <div className="space-y-1 text-[8px] uppercase tracking-widest text-zinc-500">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-terminal-red shadow-[0_0_6px_#ff3844]" /> LOSERS</div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-terminal-green shadow-[0_0_6px_#00ff66]" /> WINNERS</div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full border border-terminal-cyan shadow-[0_0_6px_#00f0ff]" /> PORTFOLIO</div>
                </div>
                {syncError && (
                  <div className="mt-1.5 pt-1.5 border-t border-terminal-red/30 text-[8px] text-terminal-red uppercase tracking-widest">
                    {syncError.code}
                  </div>
                )}
              </div>
            </div>

            {/* Monitor table under the globe — raised 24px (h-52 → 232px) for
                prominence, foldable down to its header strip. */}
            <div className={cn(
              "shrink-0 border-t border-terminal-line bg-terminal-panel/60 flex flex-col transition-[height] duration-300",
              monitorOpen ? "h-[232px]" : "h-8"
            )}>
              <button
                onClick={() => setMonitorOpen(o => !o)}
                className="flex items-center gap-3 px-3 py-1.5 border-b border-terminal-line w-full text-left group"
              >
                {monitorOpen
                  ? <ChevronDown size={10} className="text-terminal-cyan" />
                  : <ChevronRight size={10} className="text-terminal-cyan" />}
                <Activity size={10} className="text-terminal-cyan" />
                <span className="text-[8px] font-black uppercase tracking-widest text-terminal-cyan">MONITOR_NODE_ACTIVE</span>
                <PanelRightClose size={10} className="ml-auto text-zinc-700 group-hover:text-terminal-cyan rotate-90 transition-colors" />
              </button>
              {monitorOpen && (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ErrorBoundary label="EQUITY_MONITOR">
                    <EquityMonitor
                      stocks={processedStocks}
                      onSelectStock={selectAndFocus}
                      selectedStock={selectedStock}
                      showSignals
                    />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>

          {/* Watchlist pipeline rail */}
          <aside className="bg-terminal-panel overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-terminal-line flex items-center gap-2 shrink-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-white">WATCHLIST_PIPELINE</span>
              <span className="text-[7px] uppercase tracking-widest text-terminal-green ml-auto flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-terminal-green animate-pulse" /> LIVE
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <ErrorBoundary label="PIPELINE_CARDS">
                <PipelineCards
                  stocks={processedStocks}
                  watchlistTickers={watchlistTickers}
                  onSelect={selectAndFocus}
                />
              </ErrorBoundary>
            </div>
          </aside>
        </div>

        {/* ANALYST — deep dive + reverse-DCF valuation + AI chat */}
        {page === 'analyst' && (
          <div className="absolute inset-0 grid grid-cols-[1fr_420px] bg-terminal-bg">
            <main className="overflow-hidden border-r border-terminal-line">
              <ErrorBoundary label="DEEP_DIVE">
                {selectedStock ? (
                  <div className="h-full flex flex-col overflow-y-auto">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-line bg-terminal-panel sticky top-0 z-10">
                      <span className="text-[9px] font-black uppercase tracking-widest text-terminal-cyan">DEEP_DIVE: {selectedStock.ticker}</span>
                      <button onClick={() => setSelectedStock(null)} className="text-zinc-600 hover:text-white"><X size={12} /></button>
                    </div>
                    <div className="h-[420px] shrink-0">
                      <DeepDive stock={selectedStock} onClose={() => setSelectedStock(null)} />
                    </div>
                    <div className="p-3">
                      <ErrorBoundary label="VALUATION_MODEL">
                        <ValuationModel stock={selectedStock} />
                      </ErrorBoundary>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-[9px] uppercase tracking-widest text-zinc-700">
                    Select an asset or type &gt; LOAD TICKER to open a deep dive
                  </div>
                )}
              </ErrorBoundary>
            </main>
            <aside className="overflow-hidden bg-terminal-panel">
              <ErrorBoundary label="AI_CHAT">
                <AIChat selectedStock={selectedStock} swarmMessages={swarmMessages} />
              </ErrorBoundary>
            </aside>
          </div>
        )}

        {/* WATCHLIST — unified workspace: dense multi-signal matrix (left +
            center panes) with the PRE-MOVER WATCHLIST SCORING grid anchored
            on the right-hand panel. Legacy broadcast feeds stripped. */}
        {page === 'watchlist' && (
          <div className="absolute inset-0 grid grid-cols-[1fr_380px] bg-terminal-bg">
            <main className="overflow-hidden border-r border-terminal-line flex flex-col">
              <div className="flex-1 min-h-0">
                <ErrorBoundary label="WATCHLIST_MATRIX">
                  <WatchlistMatrix
                    stocks={processedStocks}
                    watchlistTickers={watchlistTickers}
                    onSelect={selectAndFocus}
                    selected={selectedStock}
                  />
                </ErrorBoundary>
              </div>
              <div className="h-44 shrink-0 border-t border-terminal-line bg-terminal-panel/50 overflow-hidden">
                <ErrorBoundary label="WATCHLIST_MGMT">
                  <WatchlistPanel onSelect={(n) => {
                    selectAndFocus(watchlistAsStock(n));
                    setPage('pipeline');
                  }} />
                </ErrorBoundary>
              </div>
            </main>
            <aside className="overflow-y-auto bg-terminal-panel p-3">
              <ErrorBoundary label="SCORECARD">
                <PreMoverScorecard stocks={processedStocks} />
              </ErrorBoundary>
            </aside>
          </div>
        )}

        {/* RESEARCH — creator uplink + extraction feed + backcheck console */}
        {page === 'research' && (
          <div className="absolute inset-0 bg-terminal-bg">
            <ErrorBoundary label="RESEARCH_HUB">
              <ResearchHub />
            </ErrorBoundary>
          </div>
        )}

        {/* REPORTS — compressed text-based screening terminal */}
        {page === 'reports' && (
          <div className="absolute inset-0 bg-terminal-bg">
            <ErrorBoundary label="REPORTS_TERMINAL">
              <ReportsTerminal />
            </ErrorBoundary>
          </div>
        )}
      </div>
    </div>
  );
}
