import { useState, useMemo } from 'react';
import { MOCK_STOCKS, StockNode } from './types';
import GlobeViewport from './components/GlobeViewport';
import FlatViewport from './components/FlatViewport';
import EquityMonitor from './components/EquityMonitor';
import DeepDive from './components/DeepDive';
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
  Activity
} from 'lucide-react';

export default function App() {
  const [selectedStock, setSelectedStock] = useState<StockNode | null>(null);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<'change' | 'trump_beta'>('change');
  const [viewMode, setViewMode] = useState<'globe' | 'flat'>('globe');
  const [searchQuery, setSearchQuery] = useState('');

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
    <div className="grid grid-rows-[48px_1fr_180px] grid-cols-[220px_1fr_240px] h-screen w-screen overflow-hidden bg-terminal-bg font-mono">
      {/* Header (Simplified Bloomberg Style) */}
      <header className="col-span-3 border-b border-terminal-line bg-terminal-panel flex items-center justify-between px-5 z-50 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="text-terminal-cyan animate-pulse" size={18} />
            <span className="font-black tracking-widest text-[13px] text-white uppercase">
              FINANCE-<span className="text-terminal-cyan text-[14px]">WORLDVIEW</span> <span className="text-[10px] opacity-40">v1.0_BETA</span>
            </span>
          </div>
          <div className="h-4 w-px bg-terminal-line" />
          <div className="flex gap-1 p-0.5 bg-black border border-terminal-line rounded-sm">
            <button 
              onClick={() => setViewMode('globe')}
              className={cn("p-1 transition-all rounded-[1px]", viewMode === 'globe' ? "bg-terminal-cyan text-black" : "text-zinc-600 hover:text-white")}
              title="Globe Mode"
            >
              <Globe size={14} />
            </button>
            <button 
              onClick={() => setViewMode('flat')}
              className={cn("p-1 transition-all rounded-[1px]", viewMode === 'flat' ? "bg-terminal-cyan text-black" : "text-zinc-600 hover:text-white")}
              title="Flat Mode"
            >
              <MapIcon size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 bg-black rounded-sm p-0.5 border border-terminal-line">
            <button 
              onClick={() => setColorMode('change')}
              className={cn("px-2 py-0.5 text-[9px] rounded-sm transition-colors uppercase font-bold", colorMode === 'change' ? "bg-zinc-800 text-white" : "text-terminal-text-secondary hover:text-white")}
            >1D Delta</button>
            <button 
              onClick={() => setColorMode('trump_beta')}
              className={cn("px-2 py-0.5 text-[9px] rounded-sm transition-colors uppercase font-bold", colorMode === 'trump_beta' ? "bg-zinc-800 text-white" : "text-terminal-text-secondary hover:text-white")}
            >Trump Beta</button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-terminal-text-secondary" size={12} />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="GEO_TICKER_X..."
              className="terminal-input pl-8 w-44 placeholder:text-zinc-700"
            />
          </div>
        </div>
      </header>

      {/* Left Rail: Filters, Themes, Exchanges */}
      <aside className="border-r border-terminal-line bg-terminal-panel flex flex-col p-4 shadow-2xl z-10 overflow-y-auto no-scrollbar">
        <span className="section-label">Thematic Heatmap</span>
        <div className="space-y-2 mb-8">
          {themes.map(t => (
            <button
              key={t.name}
              onClick={() => setActiveTheme(activeTheme === t.name ? null : t.name)}
              className={cn(
                "w-full flex items-center justify-between p-2.5 rounded-sm border transition-all text-left group",
                activeTheme === t.name 
                  ? "bg-terminal-cyan/10 border-terminal-cyan text-terminal-cyan" 
                  : "bg-black/20 border-terminal-line text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
              )}
            >
              <div className="flex items-center gap-2.5">
                <t.icon size={15} className={cn(activeTheme === t.name ? "text-terminal-cyan" : "text-zinc-600 group-hover:text-terminal-cyan")} />
                <span className="text-[10px] uppercase font-bold tracking-tight">{t.name}</span>
              </div>
              <span className="text-[9px] font-mono opacity-40">{t.count}</span>
            </button>
          ))}
        </div>

        <span className="section-label">Global Tier-1 Exchanges</span>
        <div className="space-y-1 flex-1">
          {['NASDAQ-GS', 'NYSE-ARCA', 'EURONEXT-AMS', 'HKEX-MAIN', 'LSE-OFF'].map(ex => (
            <div key={ex} className="flex items-center justify-between py-1.5 border-b border-terminal-line/40 text-[9px] text-zinc-600 hover:text-terminal-cyan transition-all cursor-pointer group">
              <span className="tracking-tighter">{ex}</span>
              <div className="w-1 h-1 rounded-full bg-zinc-800 group-hover:bg-terminal-cyan shadow-[0_0_5px_rgba(0,224,255,0.3)]" />
            </div>
          ))}
        </div>

        <div className="mt-8 pt-4 border-t border-terminal-line/50">
          <div className="flex items-center justify-between text-[9px] text-zinc-500 mb-2 font-bold">
            <span>GEO_FEED_STATUS</span>
            <span className="text-terminal-green flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" /> SYNCED</span>
          </div>
          <div className="w-full h-1 bg-black border border-terminal-line rounded-full overflow-hidden">
            <motion.div 
              animate={{ x: [-100, 200] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-1/4 h-full bg-terminal-cyan opacity-60 shadow-[0_0_10px_#00E0FF]" 
            />
          </div>
        </div>
      </aside>

      {/* Main Map Viewport (Dual-Engine: Globe/Flat) */}
      <main className="relative bg-black overflow-hidden select-none">
        <AnimatePresence mode="wait">
          {viewMode === 'globe' ? (
            <motion.div 
              key="globe"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full"
            >
              <GlobeViewport 
                stocks={filteredStocks} 
                onSelectStock={setSelectedStock} 
                selectedStock={selectedStock}
                colorMode={colorMode}
              />
            </motion.div>
          ) : (
            <motion.div 
              key="flat"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full"
            >
              <FlatViewport 
                stocks={filteredStocks} 
                onSelectStock={setSelectedStock} 
                selectedStock={selectedStock}
                colorMode={colorMode}
              />
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Floating Indicator */}
        <div className="absolute top-6 left-6 pointer-events-none">
           <div className="stat-card bg-black/60 border-terminal-line/80 backdrop-blur-md mb-0 py-2 px-3">
              <span className="section-label !mb-1">Active Engine</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-terminal-cyan shadow-[0_0_10px_#00E0FF] animate-pulse" />
                <span className="text-[11px] font-bold text-white uppercase tracking-widest">{viewMode}_LAYER</span>
              </div>
           </div>
        </div>

        {/* View Mode Context Menu */}
        <div className="absolute top-6 right-6 flex flex-col gap-2">
          <div className="bg-black/70 border border-terminal-line p-2 rounded-sm backdrop-blur-md">
            <div className="text-[8px] text-zinc-500 font-bold mb-1 uppercase tracking-tighter">Situational Awareness</div>
            <div className="flex items-center gap-2">
              <Zap size={10} className="text-terminal-cyan" />
              <span className="text-[9px] text-zinc-100 font-mono">DEREGULATION_ALPHA: ACTIVE</span>
            </div>
          </div>
        </div>
      </main>

      {/* Right Detail Rail (Insight Drawer) */}
      <aside className="border-l border-terminal-line bg-terminal-panel flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10 overflow-hidden">
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <DeepDive stock={selectedStock} onClose={() => setSelectedStock(null)} />
        </div>
      </aside>

      {/* Bottom Data Grid (Equity Monitor / Ticker Tape) */}
      <footer className="col-span-3 grid grid-cols-[220px_1fr_240px] border-t-2 border-terminal-line bg-terminal-bg overflow-hidden shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
        <div className="border-r border-terminal-line p-4 flex flex-col justify-center bg-black/20">
            <span className="section-label !mb-1 text-terminal-text-secondary">MACRO_INDEX</span>
            <div className="flex items-center justify-between group cursor-help">
              <span className="text-[11px] text-white font-bold group-hover:text-terminal-cyan">C-BETA INDEX</span>
              <div className="flex flex-col items-end">
                <span className="text-[12px] text-terminal-green font-black">9.24</span>
                <span className="text-[9px] text-terminal-green/60 font-mono tracking-tighter uppercase">Extreme Bullish</span>
              </div>
            </div>
        </div>
        <div className="flex flex-col bg-black/40 relative overflow-hidden group">
          <EquityMonitor 
            stocks={filteredStocks.sort((a, b) => b.change1d - a.change1d)} 
            onSelectStock={setSelectedStock} 
            selectedStock={selectedStock}
          />
        </div>
        <div className="border-l border-terminal-line p-4 flex flex-col gap-2 bg-terminal-panel/50">
           <span className="section-label !mb-0 text-terminal-text-secondary flex items-center gap-2"><div className="w-1 h-1 bg-terminal-cyan rounded-full" /> INTEL_LOG</span>
           <div className="flex-1 bg-black/40 border border-terminal-line/50 rounded-sm p-3 overflow-hidden text-[10px] font-mono leading-snug text-terminal-cyan/80 select-none cursor-default max-h-[100px]">
              <div className="flex gap-2 mb-1"><span className="text-zinc-600">[08:24]</span> <span className="text-terminal-green">SIGNAL</span> PLTR volume breakout confirmed.</div>
              <div className="flex gap-2 mb-1"><span className="text-zinc-600">[08:22]</span> <span className="text-terminal-gold">THEME</span> Crypto Infra heat increasing (+4.2%).</div>
              <div className="flex gap-2"><span className="text-zinc-600">[08:15]</span> <span className="text-terminal-cyan">GEO</span> Syncing HKEX listing nodes...</div>
           </div>
        </div>
      </footer>
    </div>
  );
}
