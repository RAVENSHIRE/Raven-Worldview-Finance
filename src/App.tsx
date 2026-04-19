import { useState, useMemo, useEffect } from 'react';
import { MOCK_STOCKS, StockNode, FinanceEvent } from './types';
import PreMoverScorecard from './components/PreMoverScorecard';
import GlobeViewport from './components/GlobeViewport';
import FlatViewport from './components/FlatViewport';
import EquityMonitor from './components/EquityMonitor';
import DeepDive from './components/DeepDive';
import LiveFeedSidebar from './components/LiveFeedSidebar';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Cpu, 
  Coins, 
  Wind, 
  ShieldCheck, 
  Globe, 
  Map as MapIcon, 
  Zap, 
  Activity,
  Bell,
  Box,
  LayoutGrid,
  Layers
} from 'lucide-react';

export default function App() {
  const [selectedStock, setSelectedStock] = useState<StockNode | null>(null);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<'change' | 'trump_beta'>('change');
  const [viewMode, setViewMode] = useState<'globe' | 'flat'>('globe');
  const [searchQuery, setSearchQuery] = useState('');
  const [events, setEvents] = useState<FinanceEvent[]>([]);

  // WebSocket Integration for Real-Time Finance Pulse
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as FinanceEvent;
        setEvents(prev => [event, ...prev].slice(0, 50));
      } catch (e) {
        console.error("Pulse Sync Error", e);
      }
    };

    return () => ws.close();
  }, []);

  // 1. Quant Scoring / Computed Fields (Verifiable logic)
  const processedStocks = useMemo(() => {
    return MOCK_STOCKS.map(s => {
      const volumeSurge = s.volume / s.avg30dVolume;
      const momentumScore = s.change5d * 0.35 + s.change1d * 0.15 + Math.max(s.revenueCagr5y ?? 0, 0) * 0.25;
      const riskAdjustedMomentum = momentumScore / Math.max(s.riskScore ?? 5, 1);
      const themeScore = (s.trumpBeta ?? 0) * 0.5 + riskAdjustedMomentum * 0.5;
      
      return {
        ...s,
        volumeSurge,
        momentumScore,
        riskAdjustedMomentum,
        themeScore
      };
    });
  }, []);

  // 2. Filtering
  const filteredStocks = useMemo(() => {
    return processedStocks.filter(stock => {
      const matchesTheme = !activeTheme || stock.themes.includes(activeTheme);
      const matchesSearch = stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTheme && matchesSearch;
    });
  }, [processedStocks, activeTheme, searchQuery]);

  const themes = [
    { name: "Crypto Infra", icon: Coins, count: MOCK_STOCKS.filter(s => s.themes.includes("Crypto Infra")).length },
    { name: "Aerospace & Defense", icon: ShieldCheck, count: MOCK_STOCKS.filter(s => s.themes.includes("Aerospace & Defense")).length },
    { name: "Enterprise AI", icon: Cpu, count: MOCK_STOCKS.filter(s => s.themes.includes("Enterprise AI")).length },
    { name: "Energy", icon: Wind, count: MOCK_STOCKS.filter(s => s.themes.includes("Energy")).length },
  ];

  return (
    <div className="grid grid-rows-[48px_1fr_180px] grid-cols-[220px_1fr_300px] h-screen w-screen overflow-hidden bg-terminal-bg font-mono">
      {/* Header */}
      <header className="col-span-3 border-b border-terminal-line bg-terminal-panel flex items-center justify-between px-5 z-50 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="p-1 bg-terminal-cyan/10 rounded-sm">
              <Activity className="text-terminal-cyan animate-pulse" size={16} />
            </div>
            <span className="font-black tracking-widest text-[12px] text-white uppercase group-hover:text-terminal-cyan transition-colors">
              FINANCE-<span className="text-terminal-cyan">WORLDVIEW</span> <span className="text-[9px] opacity-30 font-normal">X-STREAM v1.0</span>
            </span>
          </div>
          
          <div className="h-4 w-px bg-terminal-line mx-2" />
          
          <div className="flex gap-1 p-0.5 bg-black/40 border border-terminal-line rounded-sm">
            <button 
              onClick={() => setViewMode('globe')}
              className={cn("p-1 transition-all rounded-[1px]", viewMode === 'globe' ? "bg-terminal-cyan text-black" : "text-zinc-600 hover:text-white")}
              title="3D View"
            >
              <Globe size={13} />
            </button>
            <button 
              onClick={() => setViewMode('flat')}
              className={cn("p-1 transition-all rounded-[1px]", viewMode === 'flat' ? "bg-terminal-cyan text-black" : "text-zinc-600 hover:text-white")}
              title="Flat Map"
            >
              <MapIcon size={13} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 bg-black/40 rounded-sm p-0.5 border border-terminal-line">
            <button 
              onClick={() => setColorMode('change')}
              className={cn("px-2 py-0.5 text-[9px] rounded-sm transition-colors uppercase font-bold", colorMode === 'change' ? "bg-zinc-800 text-white" : "text-terminal-text-secondary hover:text-white")}
            >1D PERFORMANCE</button>
            <button 
              onClick={() => setColorMode('trump_beta')}
              className={cn("px-2 py-0.5 text-[9px] rounded-sm transition-colors uppercase font-bold", colorMode === 'trump_beta' ? "bg-zinc-800 text-white" : "text-terminal-text-secondary hover:text-white")}
            >MACRO_BETA</button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-terminal-text-secondary" size={12} />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH_GEO_TICKER..."
              className="terminal-input pl-8 w-44 placeholder:text-zinc-800"
            />
          </div>

          <div className="flex gap-4 items-center">
            <Bell size={14} className="text-zinc-600 hover:text-terminal-gold cursor-pointer transition-colors" />
            <Box size={14} className="text-zinc-600 hover:text-terminal-cyan cursor-pointer transition-colors" />
          </div>
        </div>
      </header>

      {/* Left Rail: Thematic Heat & Context */}
      <aside className="border-r border-terminal-line bg-terminal-panel flex flex-col p-4 z-10 overflow-hidden select-none">
        <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="flex items-center gap-2 mb-4">
                  <LayoutGrid size={12} className="text-terminal-cyan" />
                  <span className="section-label !mb-0">Thematic Heatmap</span>
                </div>
                
                <div className="space-y-1">
                  {themes.map(t => (
                    <button
                      key={t.name}
                      onClick={() => setActiveTheme(activeTheme === t.name ? null : t.name)}
                      className={cn(
                        "w-full flex items-center justify-between p-2.5 rounded-sm border transition-all text-left group mb-1",
                        activeTheme === t.name 
                          ? "bg-terminal-cyan/10 border-terminal-cyan text-terminal-cyan" 
                          : "bg-black/20 border-terminal-line text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <t.icon size={14} className={cn(activeTheme === t.name ? "text-terminal-cyan" : "text-zinc-700 group-hover:text-terminal-cyan")} />
                        <span className="text-[10px] uppercase font-bold tracking-tight">{t.name}</span>
                      </div>
                      <span className="text-[9px] font-mono opacity-30">{t.count}</span>
                    </button>
                  ))}
                </div>
            </div>

            <div className="flex-[1.5] overflow-hidden">
                <PreMoverScorecard stocks={processedStocks} />
            </div>
        </div>

        <div className="mt-auto space-y-4">
           <div>
              <div className="flex items-center gap-2 mb-2">
                <Layers size={11} className="text-zinc-500" />
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Active Layers</span>
              </div>
              <div className="space-y-2">
                 {['AIS Corridors', 'Aerospace Tracker', 'Crypto Nodes'].map(layer => (
                   <div key={layer} className="flex items-center justify-between text-[10px] text-zinc-600">
                      <span>{layer}</span>
                      <div className="w-6 h-3 bg-terminal-cyan/20 border border-terminal-cyan/40 rounded-full relative">
                        <div className="absolute right-0.5 top-0.5 w-2 h-2 bg-terminal-cyan rounded-full shadow-[0_0_8px_#00E0FF]" />
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <div className="pt-4 border-t border-terminal-line/50">
            <div className="flex items-center justify-between text-[9px] text-zinc-600 mb-2 font-bold tracking-tighter">
              <span>SYNC_PULSE_EST</span>
              <span className="text-terminal-green flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" /> 0ms</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Primary Data Portal */}
      <main className="relative bg-[#020202] overflow-hidden group">
        <AnimatePresence mode="wait">
          <motion.div 
            key={viewMode}
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full"
          >
            {viewMode === 'globe' ? (
              <GlobeViewport 
                stocks={filteredStocks} 
                events={events}
                onSelectStock={setSelectedStock} 
                selectedStock={selectedStock}
                colorMode={colorMode}
              />
            ) : (
                <FlatViewport 
                  stocks={filteredStocks}
                  events={events}
                  onSelectStock={setSelectedStock} 
                  selectedStock={selectedStock}
                  colorMode={colorMode}
                />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Global HUD Overlays */}
        <div className="absolute top-6 left-6 pointer-events-none select-none">
           <div className="stat-card bg-black/60 border-terminal-line/80 backdrop-blur-xl mb-0 py-2.5 px-4 shadow-2xl">
              <span className="text-[8px] text-terminal-text-secondary uppercase tracking-[0.2em] mb-1.5 block font-bold">Situational Engine</span>
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-terminal-cyan shadow-[0_0_12px_#00E0FF] animate-pulse" />
                <span className="text-[12px] font-black text-white uppercase tracking-widest">{activeTheme || 'Global_Mode'}</span>
              </div>
           </div>
        </div>
      </main>

      {/* Right Rail: Intelligence Pulse & Details */}
      <aside className="border-l border-terminal-line bg-terminal-panel flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.6)] z-20 overflow-hidden">
        <div className="flex-1 overflow-y-auto no-scrollbar border-b border-terminal-line">
           <LiveFeedSidebar events={events} />
        </div>
        <div className="h-[240px] flex flex-col bg-black/40 overflow-hidden">
           <DeepDive stock={selectedStock} onClose={() => setSelectedStock(null)} />
        </div>
      </aside>

      {/* Bottom Grid / Terminal */}
      <footer className="col-span-3 grid grid-cols-[220px_1fr_300px] border-t-2 border-terminal-line bg-terminal-bg overflow-hidden shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="border-r border-terminal-line p-4 flex flex-col justify-center bg-black/10">
            <span className="text-[9px] text-terminal-text-secondary uppercase mb-2 font-black tracking-widest opacity-60">Macro_Regime</span>
            <div className="flex items-center justify-between group cursor-default">
              <span className="text-[11px] text-zinc-300 font-bold group-hover:text-terminal-cyan transition-colors italic">DEREG_INDEX_X1</span>
              <div className="flex flex-col items-end">
                <span className="text-[13px] text-terminal-green font-black">HIGH_VOL</span>
                <span className="text-[8px] text-terminal-green/50 font-mono tracking-widest uppercase">Accumulation Phase</span>
              </div>
            </div>
        </div>
        <div className="flex flex-col bg-black/20 relative group">
          <EquityMonitor 
            stocks={filteredStocks.sort((a, b) => b.change1d - a.change1d)} 
            onSelectStock={setSelectedStock} 
            selectedStock={selectedStock}
          />
        </div>
        <div className="border-l border-terminal-line p-4 flex flex-col gap-2 bg-terminal-panel/50">
           <span className="section-label !mb-0 text-terminal-text-secondary flex items-center gap-2"><div className="w-1 h-1 bg-terminal-cyan rounded-full animate-ping" /> Alert_Log</span>
           <div className="flex-1 bg-black/60 border border-terminal-line/40 rounded-sm p-3 overflow-hidden text-[9px] font-mono leading-relaxed text-terminal-cyan/70 select-none">
              {events.slice(0, 3).map((e, i) => (
                <div key={i} className="mb-1">
                   <span className="text-zinc-600">[{new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}]</span> {e.label}
                </div>
              ))}
              {events.length === 0 && <div className="opacity-40 italic">Waiting for situational data...</div>}
           </div>
        </div>
      </footer>
    </div>
  );
}
