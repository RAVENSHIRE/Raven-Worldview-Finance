import { useState, useEffect } from 'react';
import { StockNode, BacktestResult } from '../types';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { LineChart, History, Newspaper, Share2, Play, AlertTriangle } from 'lucide-react';

interface MirofishProps {
  selectedStock?: StockNode | null;
}

export default function Mirofish({ selectedStock }: MirofishProps) {
  const [activeTab, setActiveTab] = useState<'news' | 'backtest'>('news');
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runBacktest = async () => {
    if (!selectedStock) return;
    setIsLoading(true);
    try {
        const res = await fetch(`/api/backtest/${selectedStock.ticker}`);
        const data = await res.json();
        setBacktest(data);
    } catch (e) {
        console.error("BACKTEST_ERROR", e);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStock && activeTab === 'backtest') {
        runBacktest();
    }
  }, [selectedStock, activeTab]);

  const mockNews = [
    { title: "Secondary Market Liquidity Surges for Top AI Pre-IPOs", source: "Bloomberg", time: "2h ago" },
    { title: "IMF Flags Swiss Franc Volatility Amid Macro Regime Shift", source: "IMF News", time: "5h ago" },
    { title: "Satellite Data Confirms Unusual Activity at High-Growth Data Centers", source: "GEO_INT", time: "8h ago" }
  ];

  return (
    <div className="flex flex-col h-full bg-terminal-panel/30 border border-terminal-line rounded-sm overflow-hidden font-mono">
      <div className="flex border-b border-terminal-line bg-black/20">
        <button 
          onClick={() => setActiveTab('news')}
          className={cn(
            "flex-1 p-2.5 text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
            activeTab === 'news' ? "bg-terminal-cyan/10 text-terminal-cyan border-b border-terminal-cyan" : "text-zinc-600 hover:text-zinc-400"
          )}
        >
          <Newspaper size={12} /> News_Feed
        </button>
        <button 
          onClick={() => setActiveTab('backtest')}
          className={cn(
            "flex-1 p-2.5 text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
            activeTab === 'backtest' ? "bg-terminal-cyan/10 text-terminal-cyan border-b border-terminal-cyan" : "text-zinc-600 hover:text-zinc-400"
          )}
        >
          <History size={12} /> Backtest_Engine
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar relative p-4">
        {activeTab === 'news' ? (
          <div className="space-y-4">
            {mockNews.map((n, i) => (
              <div key={i} className="border-l-2 border-terminal-cyan/30 pl-3 py-1 group hover:border-terminal-cyan cursor-pointer transition-all">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[7px] text-terminal-cyan font-black uppercase">{n.source}</span>
                  <span className="text-[7px] text-zinc-600">{n.time}</span>
                </div>
                <h4 className="text-[10px] text-white/90 leading-snug group-hover:text-white">{n.title}</h4>
              </div>
            ))}
            <div className="mt-8 pt-4 border-t border-terminal-line/30 italic text-center">
                <span className="text-[8px] opacity-20">Monitoring 450+ quantitative and spatial signal points...</span>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {!selectedStock ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 px-6">
                    <LineChart size={24} className="mb-3" />
                    <p className="text-[9px] uppercase font-bold tracking-tight">Select an asset from the worldview to initiate Mirofish Backtesting protocols.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[12px] font-black text-terminal-gold uppercase tracking-tighter">{selectedStock.ticker}</span>
                            <span className="text-[7px] text-zinc-500 uppercase tracking-widest">Protocol: Mirofish_v4.2</span>
                        </div>
                        <button 
                            onClick={runBacktest}
                            disabled={isLoading}
                            className="bg-terminal-cyan text-black px-3 py-1 text-[9px] font-black uppercase flex items-center gap-2 hover:bg-white transition-all disabled:opacity-50"
                        >
                            <Play size={10} /> {isLoading ? 'PROCESSING...' : 'RUN_TEST'}
                        </button>
                    </div>

                    {backtest && (
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            {[
                                { label: 'TOTAL_RETURN', val: `${backtest.return}%`, color: 'text-terminal-green' },
                                { label: 'MAX_DRAWDOWN', val: `${backtest.maxDrawdown}%`, color: 'text-terminal-red' },
                                { label: 'SHARPE_RATIO', val: backtest.sharpeRatio, color: 'text-terminal-cyan' },
                                { label: 'TRADE_COUNT', val: backtest.trades, color: 'text-white' }
                            ].map(s => (
                                <div key={s.label} className="bg-black/40 border border-terminal-line p-2 rounded-sm">
                                    <span className="text-[7px] text-zinc-600 block mb-1">{s.label}</span>
                                    <span className={cn("text-[14px] font-black font-mono", s.color)}>{s.val}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-6 p-3 bg-terminal-cyan/5 border border-terminal-cyan/20 rounded-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle size={12} className="text-terminal-cyan" />
                            <span className="text-[8px] text-terminal-cyan font-black uppercase">Alpha Insight</span>
                        </div>
                        <p className="text-[9px] leading-relaxed text-zinc-400 italic">
                            Correlation analysis suggests institutional "Pre-Mover" behavior precedes 78% of breakout events in the {selectedStock.sector} sector within this macro regime.
                        </p>
                    </div>
                </div>
            )}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-terminal-line flex justify-between items-center bg-black/20">
         <span className="text-[7px] text-zinc-600 uppercase tracking-widest flex items-center gap-1">
            <Share2 size={8} /> Internal_Share_Active
         </span>
         <span className="text-[7px] text-zinc-700">Powered by Mirofish™ Signal-Net</span>
      </div>
    </div>
  );
}
