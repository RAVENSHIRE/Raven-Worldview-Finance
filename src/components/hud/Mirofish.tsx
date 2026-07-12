import { useState, useEffect } from 'react';
import { StockNode, BacktestResult } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import {
    LineChart,
    History,
    Newspaper,
    Share2,
    Play,
    AlertTriangle,
    Zap,
    Target,
    ShieldCheck,
    Cpu,
    ArrowRight,
    ClipboardList
} from 'lucide-react';
import { useScreenState } from '../../store/useScreenState';

interface MirofishProps {
  selectedStock?: StockNode | null;
}

type MirofishTab = 'screen' | 'news' | 'strategy';

export default function Mirofish({ selectedStock }: MirofishProps) {
  const { reports, activeReport, setActiveReport } = useScreenState();
  // Default to the screening report reader when idle; when a stock is
  // selected the operator is more likely looking at news/strategy.
  const [activeTab, setActiveTab] = useState<MirofishTab>('screen');
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const runBacktest = async () => {
    if (!selectedStock) return;
    setIsLoading(true);
    try {
        const backtestUrl = new URL(`/api/backtest/${selectedStock.ticker}`, window.location.origin);
        const res = await fetch(backtestUrl.toString());
        const data = await res.json();
        setBacktest(data);
    } catch (e) {
        console.error("BACKTEST_ERROR", e);
    } finally {
        setIsLoading(false);
    }
  };

  const handleExecute = () => {
    setIsExecuting(true);
    setTimeout(() => setIsExecuting(false), 2000);
  };

  const loadReport = async (id: string) => {
    if (activeReport?.id === id) return;
    try {
      const url = new URL(`/api/screen/report/${id}`, window.location.origin);
      const res = await fetch(url.toString());
      if (res.ok) setActiveReport(await res.json());
    } catch (e) {
      console.error('SCREEN_REPORT_FETCH_ERROR', e);
    }
  };

  useEffect(() => {
    if (selectedStock && activeTab === 'strategy') {
        runBacktest();
    }
  }, [selectedStock, activeTab]);

  const mockNews = [
    { title: "Secondary Market Liquidity Surges for Top AI Pre-IPOs", source: "Bloomberg", time: "2h ago" },
    { title: "IMF Flags Swiss Franc Volatility Amid Macro Regime Shift", source: "IMF News", time: "5h ago" },
    { title: "Satellite Data Confirms Unusual Activity at High-Growth Data Centers", source: "GEO_INT", time: "8h ago" }
  ];

  return (
    <div className="flex flex-col h-full bg-terminal-panel/30 border border-terminal-line rounded-sm overflow-hidden font-mono shadow-[0_0_50px_rgba(0,0,0,0.5)]">
      <div className="flex border-b border-terminal-line bg-black/40 backdrop-blur-md">
        <button
          onClick={() => setActiveTab('screen')}
          className={cn(
            "flex-1 p-2.5 text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative overflow-hidden",
            activeTab === 'screen' ? "text-terminal-green" : "text-zinc-600 hover:text-zinc-400"
          )}
        >
          {activeTab === 'screen' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-terminal-green" />}
          <ClipboardList size={12} /> Screen_Report
        </button>
        <button
          onClick={() => setActiveTab('news')}
          className={cn(
            "flex-1 p-2.5 text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative overflow-hidden",
            activeTab === 'news' ? "text-terminal-cyan" : "text-zinc-600 hover:text-zinc-400"
          )}
        >
          {activeTab === 'news' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-terminal-cyan" />}
          <Newspaper size={12} /> News_Intelligence
        </button>
        <button 
          onClick={() => setActiveTab('strategy')}
          className={cn(
            "flex-1 p-2.5 text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative overflow-hidden",
            activeTab === 'strategy' ? "text-terminal-gold" : "text-zinc-600 hover:text-zinc-400"
          )}
        >
          {activeTab === 'strategy' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-terminal-gold" />}
          <Cpu size={12} /> Strategy_Render
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 bg-gradient-to-b from-transparent to-black/20">
        <AnimatePresence mode="wait">
          {activeTab === 'screen' ? (
            <motion.div
              key="screen"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.2em]">Screening_Report_Feed</h3>
                <span className="text-[7px] text-zinc-600 uppercase tracking-widest">{reports.length} RUN{reports.length === 1 ? '' : 'S'}</span>
              </div>

              {reports.length > 0 && (
                <div className="flex flex-col gap-1 max-h-24 overflow-y-auto no-scrollbar border border-terminal-line/50 rounded-sm p-1 bg-black/30">
                  {reports.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => loadReport(r.id)}
                      className={cn(
                        "text-left px-2 py-1 rounded-sm transition-colors group",
                        activeReport?.id === r.id ? "bg-terminal-green/10 border border-terminal-green/30" : "hover:bg-white/[0.03] border border-transparent"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[8px] font-black uppercase truncate text-white/80 group-hover:text-white">
                          {r.source || 'EXTERNAL_WORKFLOW'}
                        </span>
                        <span className="text-[7px] text-zinc-600 shrink-0">
                          {new Date(r.capturedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[8px] text-zinc-500 truncate group-hover:text-zinc-400">{r.preview}</p>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar border border-terminal-line rounded-sm bg-black/40">
                {activeReport ? (
                  <pre className="text-[9px] leading-relaxed text-terminal-green/90 whitespace-pre-wrap break-words p-3 font-mono">
                    {activeReport.text}
                  </pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30 px-6 space-y-3 py-8">
                    <div className="p-4 rounded-full border border-dashed border-terminal-line">
                      <ClipboardList size={22} className="text-zinc-600" />
                    </div>
                    <p className="text-[9px] uppercase font-black tracking-widest leading-relaxed">
                      No screening report ingested. <br/> Awaiting external workflow blob...
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : activeTab === 'news' ? (
            <motion.div
              key="news"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <h3 className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.2em] mb-4">Sentiment_Convergence_Feed</h3>
              {mockNews.map((n, i) => (
                <div key={i} className="border-l-2 border-terminal-cyan/30 pl-3 py-1 group hover:border-terminal-cyan cursor-pointer transition-all bg-white/0 hover:bg-white/[0.02]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[7px] text-terminal-cyan font-black uppercase">{n.source}</span>
                    <span className="text-[7px] text-zinc-600">{n.time}</span>
                  </div>
                  <h4 className="text-[10px] text-white/90 leading-snug group-hover:text-white">{n.title}</h4>
                </div>
              ))}
              <div className="mt-8 pt-4 border-t border-terminal-line/30 flex flex-col items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-terminal-cyan animate-ping" />
                  <span className="text-[7px] opacity-20 uppercase tracking-widest">Awaiting Alpha Catalysts...</span>
              </div>
            </motion.div>
          ) : (
            <motion.div 
                key="strategy"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="h-full flex flex-col"
            >
              {!selectedStock ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 px-6 space-y-4">
                      <div className="p-4 rounded-full border border-dashed border-terminal-line">
                        <Target size={24} className="text-zinc-600" />
                      </div>
                      <p className="text-[9px] uppercase font-black tracking-widest leading-relaxed">
                        No focal point detected. <br/> Initialize spatial selection to render MiroFish intelligence.
                      </p>
                  </div>
              ) : (
                  <div className="space-y-5">
                      <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                              <h3 className="text-sm font-black text-terminal-gold uppercase flex items-center gap-2 tracking-tighter">
                                <Zap size={14} /> {selectedStock.ticker} Render
                              </h3>
                              <span className="text-[7px] text-zinc-500 uppercase tracking-widest">Protocol: Mirofish_Swarm_v4.8</span>
                          </div>
                          <button 
                              onClick={runBacktest}
                              disabled={isLoading}
                              className="bg-terminal-gold/10 text-terminal-gold border border-terminal-gold/30 px-3 py-1 text-[9px] font-black uppercase flex items-center gap-2 hover:bg-terminal-gold hover:text-black transition-all disabled:opacity-50"
                          >
                              <Play size={10} /> {isLoading ? 'SIMULATING...' : 'INIT_SWARM'}
                          </button>
                      </div>

                      {/* Swarm Progress / Backtest Results */}
                      <AnimatePresence mode="wait">
                        {isLoading ? (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="p-4 border border-terminal-line bg-black/40 rounded-sm flex flex-col items-center justify-center gap-3 h-[120px]"
                            >
                                <div className="flex gap-1.5">
                                    {[0,1,2,3].map(i => (
                                        <motion.div 
                                            key={i}
                                            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                                            transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                                            className="w-1 h-1 bg-terminal-gold rounded-full"
                                        />
                                    ))}
                                </div>
                                <span className="text-[8px] text-terminal-gold/60 uppercase tracking-widest animate-pulse">Syncing 5k+ MiroFish Memories...</span>
                            </motion.div>
                        ) : backtest && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="grid grid-cols-2 gap-2"
                            >
                                {[
                                    { label: 'ALPHA_VELOCITY', val: `${backtest.return}%`, color: 'text-terminal-green' },
                                    { label: 'RISK_VOLUMETRIC', val: `${backtest.maxDrawdown}%`, color: 'text-terminal-red' },
                                    { label: 'SWARM_CONVICTION', val: backtest.sharpeRatio, color: 'text-terminal-cyan' },
                                    { label: 'TACTICAL_NODES', val: backtest.trades, color: 'text-white' }
                                ].map(s => (
                                    <div key={s.label} className="bg-white/[0.03] border border-terminal-line p-2.5 rounded-sm hover:border-terminal-gold/30 transition-colors">
                                        <span className="text-[7px] text-zinc-600 block mb-1 uppercase font-bold tracking-widest">{s.label}</span>
                                        <span className={cn("text-base font-black font-mono", s.color)}>{s.val}</span>
                                    </div>
                                ))}

                                <div className="col-span-2 mt-4 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-px bg-terminal-line" />
                                        <span className="text-[8px] text-zinc-700 uppercase font-bold">Execution_Authorize</span>
                                        <div className="flex-1 h-px bg-terminal-line" />
                                    </div>

                                    <button 
                                        onClick={handleExecute}
                                        className={cn(
                                            "w-full py-3 rounded border font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-3 group relative overflow-hidden",
                                            isExecuting 
                                                ? "bg-terminal-green text-black border-terminal-green scale-[0.98]" 
                                                : "bg-black border-terminal-line text-terminal-text-secondary hover:border-terminal-green hover:text-terminal-green"
                                        )}
                                    >
                                        <AnimatePresence mode="wait">
                                            {isExecuting ? (
                                                <motion.div key="exec-ok" initial={{ x: -10 }} animate={{ x: 0 }} className="flex items-center gap-2">
                                                    <ShieldCheck size={14} /> ORDER_DEPLOYED
                                                </motion.div>
                                            ) : (
                                                <motion.div key="exec-idle" exit={{ x: 10 }} className="flex items-center gap-2">
                                                    APPROVE_HIGH_CONVICTION_TRADE <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                        
                                        {isExecuting && (
                                            <motion.div 
                                                layoutId="chime-glow"
                                                className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none"
                                            />
                                        )}
                                    </button>
                                </div>
                            </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="mt-4 p-3 bg-terminal-gold/5 border border-terminal-gold/10 rounded-sm backdrop-blur-sm">
                          <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle size={12} className="text-terminal-gold" />
                              <span className="text-[8px] text-terminal-gold font-black uppercase tracking-widest">Spatial_Integrity_Report</span>
                          </div>
                          <p className="text-[9px] leading-relaxed text-zinc-400 italic">
                             Swarm convergence detected at primary resistance levels for {selectedStock.exchange}. Boids-behavior analysis validates a "High-Conviction" entry path using the MiroFish v4.8 neural bridge.
                          </p>
                      </div>
                  </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-3 border-t border-terminal-line flex justify-between items-center bg-black/40 backdrop-blur-md">
         <span className="text-[7px] text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-terminal-cyan" /> Secure_Protocol_Active
         </span>
         <span className="text-[7px] text-zinc-800 font-bold uppercase">Immersive_Alpha v4.8</span>
      </div>
    </div>
  );
}
