import { useState, useMemo, useEffect, useCallback } from 'react';
import { MOCK_STOCKS, StockNode, FinanceEvent } from './types';
import PreMoverScorecard from './components/PreMoverScorecard';
import GlobeViewport from './components/GlobeViewport';
import FlatViewport from './components/FlatViewport';
import EquityMonitor from './components/EquityMonitor';
import LiveFeedSidebar from './components/LiveFeedSidebar';
import GalaxyCluster from './components/GalaxyCluster';
import AIChat from './components/AIChat';
import Mirofish from './components/Mirofish';
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
  RefreshCw
} from 'lucide-react';

export default function App() {
  const [selectedStock, setSelectedStock] = useState<StockNode | null>(null);
  const [colorMode, setColorMode] = useState<'change' | 'trump_beta'>('change');
  const [viewMode, setViewMode] = useState<'globe' | 'flat'>('globe');
  const [searchQuery, setSearchQuery] = useState('');
  const [events, setEvents] = useState<FinanceEvent[]>([]);
  const [activeLayers, setActiveLayers] = useState<string[]>(['AIS Corridors', 'Aerospace Tracker', 'Crypto Nodes']);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<'monitor' | 'galaxy'>('monitor');
  const [showSignals, setShowSignals] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBatch = useCallback(async () => {
    setIsRefreshing(true);
    const symbols = MOCK_STOCKS.filter(s => s.exchange !== 'PRIVATE').map(s => s.ticker).join(',');
    try {
      const res = await fetch(`/api/market/batch?symbols=${symbols}`);
      const data = await res.json();
      setLiveQuotes(prev => ({ ...prev, ...data }));
    } catch (e) {
      console.error("Real-Market Sync Failure", e);
    } finally {
      // Small timeout to show the animation bit longer for better UX feedback
      setTimeout(() => setIsRefreshing(false), 800);
    }
  }, []);

  // WebSocket Integration for Real-Time Finance Pulse & Agent Swarm
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event.type === 'AGENT_TALK') {
            setSwarmMessages(prev => [event, ...prev].slice(0, 10));
        } else {
            setEvents(prev => [event, ...prev].slice(0, 50));
        }
      } catch (e) {
        console.error("Pulse Sync Error", e);
      }
    };

    return () => ws.close();
  }, []);

  const [swarmMessages, setSwarmMessages] = useState<any[]>([]);

  // Periodic Batch Price Sync
  useEffect(() => {
      fetchBatch();
      const interval = setInterval(fetchBatch, 30000); // Sync every 30s
      return () => clearInterval(interval);
  }, [fetchBatch]);

  const processedStocks = useMemo(() => {
    return MOCK_STOCKS.map(s => {
      const volumeSurge = s.volume / s.avg30dVolume;
      const quote = liveQuotes[s.ticker];
      
      // Strict fallback to ensure display never fails even if sync returns null-like data
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
  }, [liveQuotes]);

  const filteredStocks = useMemo(() => {
    return processedStocks.filter(stock => {
      const matchesSearch = stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [processedStocks, searchQuery]);

  const toggleLayer = (layer: string) => {
      setActiveLayers(prev => prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer]);
  };

  return (
    <div className="grid grid-rows-[48px_1fr_200px] grid-cols-[260px_1fr_320px] h-screen w-screen overflow-hidden bg-terminal-bg font-mono selection:bg-terminal-cyan/30 text-white">
      {/* Header */}
      <header className="col-span-3 border-b border-terminal-line bg-terminal-panel flex items-center justify-between px-5 z-50 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="p-1 bg-terminal-cyan/10 rounded-sm">
              <Activity className="text-terminal-cyan animate-pulse" size={16} />
            </div>
            <span className="font-black tracking-widest text-[12px] text-white uppercase group-hover:text-terminal-cyan transition-colors">
              PRE-MOVER <span className="text-terminal-cyan underline decoration-terminal-cyan/30">SYSTEMS</span> <span className="text-[9px] opacity-30 font-normal ml-3">CORE_PROTO v4.8</span>
            </span>
          </div>
          
          <div className="h-4 w-px bg-terminal-line mx-2" />
          
          <div className="flex gap-1 p-0.5 bg-black/40 border border-terminal-line rounded-sm">
            <button 
              onClick={() => setViewMode('globe')}
              className={cn("p-1.5 transition-all rounded-[1px]", viewMode === 'globe' ? "bg-terminal-cyan text-black" : "text-zinc-600 hover:text-white")}
              title="3D Situational Mode"
            >
              <Globe size={13} />
            </button>
            <button 
              onClick={() => setViewMode('flat')}
              className={cn("p-1.5 transition-all rounded-[1px]", viewMode === 'flat' ? "bg-terminal-cyan text-black" : "text-zinc-600 hover:text-white")}
              title="Tactical Map Mode"
            >
              <MapIcon size={13} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 bg-black/40 rounded-sm p-1 border border-terminal-line">
            <button 
              onClick={() => setColorMode('change')}
              className={cn("px-3 py-1 text-[9px] rounded-sm transition-colors uppercase font-black", colorMode === 'change' ? "bg-zinc-800 text-terminal-cyan border border-terminal-cyan/20" : "text-terminal-text-secondary hover:text-white")}
            >REAL_TIME_1D</button>
            <button 
              onClick={() => setColorMode('trump_beta')}
              className={cn("px-3 py-1 text-[9px] rounded-sm transition-colors uppercase font-black", colorMode === 'trump_beta' ? "bg-zinc-800 text-terminal-gold border border-terminal-gold/20" : "text-terminal-text-secondary hover:text-white")}
            >MACRO_REVAL_β</button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-terminal-text-secondary" size={12} />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH_SIGNAL_NODE..."
              className="terminal-input pl-8 w-52 placeholder:text-zinc-800 tracking-widest text-[10px]"
            />
          </div>

          <div className="flex gap-4 items-center">
            <button 
              onClick={fetchBatch}
              className={cn(
                "flex items-center gap-2 px-3 py-1 text-[9px] font-black uppercase tracking-widest border transition-all rounded-sm",
                isRefreshing ? "bg-terminal-cyan text-black border-terminal-cyan" : "bg-black/40 text-terminal-text-secondary border-terminal-line hover:border-terminal-cyan hover:text-white"
              )}
              disabled={isRefreshing}
            >
              <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
              <span>{isRefreshing ? 'SYNCING...' : 'REFRESH_DATA'}</span>
            </button>
            <Terminal size={14} className="text-zinc-600 hover:text-terminal-cyan cursor-pointer transition-colors" />
          </div>
        </div>
      </header>

      {/* Left Rail: Optimized for Pre-Mover IQ */}
      <aside className="border-r border-terminal-line bg-terminal-panel flex flex-col p-4 z-10 overflow-hidden select-none gap-4">
        <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex-[0.6] min-h-[220px]">
                <PreMoverScorecard stocks={processedStocks} />
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <Layers size={12} className="text-terminal-cyan" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Active Operational Layers</span>
              </div>
              <div className="space-y-3 bg-black/20 p-4 border border-terminal-line rounded-sm">
                 {['AIS Corridors', 'Aerospace Tracker', 'Crypto Nodes', 'Signal Heatmap'].map(layer => (
                   <div 
                    key={layer} 
                    onClick={() => toggleLayer(layer)}
                    className={cn(
                        "flex items-center justify-between text-[10px] cursor-pointer group transition-all",
                        activeLayers.includes(layer) ? "text-zinc-300" : "text-zinc-700 hover:text-zinc-500"
                    )}
                   >
                      <span className="flex items-center gap-2">
                        <ChevronRight size={10} className={cn("transition-transform", activeLayers.includes(layer) ? "rotate-90 text-terminal-cyan" : "")} />
                        {layer}
                      </span>
                      <div className={cn(
                        "w-6 h-3 rounded-full relative transition-colors",
                        activeLayers.includes(layer) ? "bg-terminal-cyan/20 border border-terminal-cyan/40" : "bg-zinc-900 border border-zinc-800"
                      )}>
                        <div className={cn(
                            "absolute top-0.5 w-2 h-2 rounded-full transition-all duration-300",
                            activeLayers.includes(layer) ? "right-0.5 bg-terminal-cyan shadow-[0_0_8px_#00E0FF]" : "right-3.5 bg-zinc-700"
                        )} />
                      </div>
                   </div>
                 ))}
              </div>
            </div>
        </div>

        <div className="mt-auto pt-4 border-t border-terminal-line/50">
            <div className="mb-4 bg-terminal-gold/5 border border-terminal-gold/20 p-2.5 rounded-sm">
                <div className="flex items-center gap-2 mb-1.5">
                    <ShieldAlert size={12} className="text-terminal-gold" />
                    <span className="text-[9px] font-black text-terminal-gold uppercase">System_Alert</span>
                </div>
                <p className="text-[8px] leading-tight text-white/60 italic uppercase tracking-tighter">
                   Information asymmetry localized. <br/> Cross-asset correlation active.
                </p>
            </div>
            <div className="flex items-center justify-between text-[9px] text-zinc-700 font-bold tracking-widest">
              <span>SYNC_LATENCY</span>
              <span className="text-terminal-green flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" /> +42ms
              </span>
            </div>
        </div>
      </aside>

      {/* Main Tactical Viewport */}
      <main className="relative bg-[#020202] overflow-hidden group">
        <AnimatePresence mode="wait">
          <motion.div 
            key={viewMode}
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full pb-[35%]"
          >
            {viewMode === 'globe' ? (
              <GlobeViewport 
                stocks={filteredStocks} 
                events={events}
                activeLayers={activeLayers}
                onSelectStock={setSelectedStock} 
                selectedStock={selectedStock}
                colorMode={colorMode}
              />
            ) : (
                <FlatViewport 
                  stocks={filteredStocks}
                  events={events}
                  activeLayers={activeLayers}
                  onSelectStock={setSelectedStock} 
                  selectedStock={selectedStock}
                  colorMode={colorMode}
                />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Dynamic Context Workspace: Dual View (Monitor / Galaxy) */}
        <div className="absolute bottom-0 left-0 right-0 h-[35%] bg-terminal-bg/95 backdrop-blur-md border-t border-terminal-line z-20 flex flex-col pointer-events-auto">
            <div className="flex items-center gap-4 px-4 py-2 border-b border-terminal-line bg-terminal-panel/30">
                <button 
                  onClick={() => setActiveTab('monitor')}
                  className={cn(
                    "px-3 py-1 text-[9px] font-black uppercase tracking-widest border transition-all",
                    activeTab === 'monitor' ? "bg-terminal-cyan text-black border-terminal-cyan" : "text-terminal-text-secondary border-terminal-line hover:border-terminal-cyan"
                  )}
                >
                  Monitor_Node
                </button>
                <button 
                  onClick={() => setActiveTab('galaxy')}
                  className={cn(
                    "px-3 py-1 text-[9px] font-black uppercase tracking-widest border transition-all",
                    activeTab === 'galaxy' ? "bg-terminal-gold text-black border-terminal-gold" : "text-terminal-text-secondary border-terminal-line hover:border-terminal-gold"
                  )}
                >
                  Galaxy_Cluster
                </button>
                <div className="h-4 w-px bg-terminal-line" />
                <div className="flex items-center gap-2">
                    <span className="text-[8px] text-terminal-text-secondary uppercase">Signals:</span>
                    <button 
                      onClick={() => setShowSignals(!showSignals)}
                      className={cn(
                        "w-7 h-3.5 rounded-full border border-terminal-line relative transition-all",
                        showSignals ? "bg-terminal-cyan/20 border-terminal-cyan" : "bg-transparent"
                      )}
                    >
                      <motion.div 
                        layout 
                        className={cn("absolute top-0.5 w-2 h-2 rounded-full", showSignals ? "bg-terminal-cyan right-0.5" : "bg-zinc-600 left-0.5")}
                      />
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden p-2">
              <AnimatePresence mode="wait">
                {activeTab === 'monitor' ? (
                  <motion.div 
                    key="monitor-tab"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="h-full"
                  >
                    <EquityMonitor 
                      stocks={filteredStocks} 
                      onSelectStock={setSelectedStock} 
                      selectedStock={selectedStock}
                      showSignals={showSignals}
                    />
                  </motion.div>
                ) : (
                  <motion.div 
                    key="galaxy-tab"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="h-full"
                  >
                    <GalaxyCluster 
                      stocks={filteredStocks} 
                      onSelectStock={setSelectedStock} 
                      selectedStock={selectedStock}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
        </div>

        {/* Global HUD Overlay */}
        <div className="absolute top-6 left-6 pointer-events-none select-none">
           <div className="stat-card bg-black/60 border-terminal-line/80 backdrop-blur-xl mb-0 py-2.5 px-4 shadow-2xl border-l-[3px] border-l-terminal-cyan">
              <span className="text-[8px] text-terminal-text-secondary uppercase tracking-[0.2em] mb-1.5 block font-bold">Spatial_Intel_Engine</span>
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-terminal-cyan shadow-[0_0_12px_#00E0FF] animate-pulse" />
                <span className="text-[12px] font-black text-white uppercase tracking-widest">GRID_ACTIVE: {activeLayers.length} LAYERS</span>
              </div>
           </div>
        </div>
      </main>

      {/* Right Rail: Intelligence Convergence */}
      <aside className="border-l border-terminal-line bg-terminal-panel flex flex-col p-0 z-20">
         <div className="flex-1 overflow-hidden border-b border-terminal-line h-1/2">
             <AIChat selectedStock={selectedStock} swarmMessages={swarmMessages} />
         </div>
         <div className="flex-1 overflow-hidden h-1/2">
             <Mirofish selectedStock={selectedStock} />
         </div>
      </aside>

      {/* Footer: Data Convergence Hub */}
      <footer className="col-span-3 border-t border-terminal-line bg-terminal-panel grid grid-cols-[1fr_320px] overflow-hidden">
        <div className="border-r border-terminal-line overflow-hidden p-0">
          <EquityMonitor 
            stocks={filteredStocks} 
            onSelectStock={setSelectedStock} 
            selectedStock={selectedStock} 
          />
        </div>
        <div className="overflow-hidden bg-black/20">
           <LiveFeedSidebar events={events} />
        </div>
      </footer>
    </div>
  );
}
