import React, { useEffect, useState } from 'react';
import { StockNode } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { 
  Building2, 
  MapPin, 
  ShieldAlert, 
  BarChart3, 
  ExternalLink,
  Target,
  FlaskConical,
  Zap,
  Globe,
  Loader2,
  TrendingUp,
  History
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

interface DeepDiveProps {
  stock: StockNode | null;
  onClose: () => void;
}

export default function DeepDive({ stock, onClose }: DeepDiveProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stock) return;

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/market/history/${stock.ticker}`);
        if (!res.ok) throw new Error('History Fetch Failed');
        const data = await res.json();
        setHistory(data);
      } catch (e) {
        console.error(e);
        setError('UNABLE_TO_SYNC_HISTORICAL_DATA');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [stock]);

  if (!stock) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-terminal-panel">
        <div className="w-12 h-12 rounded-full border border-dashed border-terminal-line flex items-center justify-center mb-4">
          <Target size={20} className="text-terminal-text-secondary" />
        </div>
        <p className="section-label">Select a ticker to initialize deep dive engine</p>
      </div>
    );
  }

  const volumeSurge = (stock.volume / stock.avg30dVolume).toFixed(1);
  const isEarlyMover = parseFloat(volumeSurge) > 1.5 && stock.change5d > 10;

  return (
    <div className="h-full flex flex-col bg-terminal-panel overflow-hidden border-l border-terminal-line shadow-[inset_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="p-4 border-b border-terminal-line bg-black/20">
        <div className="flex items-center justify-between mb-2">
            <span className="section-label">Alpha_Terminal_Deep_Dive</span>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
                <Zap size={10} className="text-zinc-600" />
            </button>
        </div>
        
        <div className="stat-card border-l-[3px] border-l-terminal-cyan bg-terminal-cyan/5 backdrop-blur-md">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-black font-sans text-white tracking-tighter leading-none">{stock.ticker}</h2>
              <p className="text-[10px] text-terminal-text-secondary font-mono mt-1">{stock.name}</p>
            </div>
            <span className="regime-badge" style={{ borderColor: '#D4AF37', color: '#D4AF37' }}>
              REVAL_β: {stock.trumpBeta || 0}
            </span>
          </div>

          <div className="mt-6 flex items-end justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-terminal-text-secondary uppercase">Market_valuation_USD</span>
              <span className="text-2xl font-black font-mono text-terminal-cyan">${stock.price.toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-mono text-terminal-text-secondary uppercase">Velocity_1D</span>
              <span className={cn(
                "text-sm font-black font-mono",
                stock.change1d >= 0 ? "text-terminal-green" : "text-terminal-red"
              )}>
                {stock.change1d >= 0 ? '+' : ''}{stock.change1d}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Historical Time-Series Visualization */}
        <div className="bg-black/40 border border-terminal-line rounded-sm p-4 relative min-h-[220px]">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[9px] font-mono font-bold text-terminal-text-secondary uppercase tracking-widest flex items-center gap-2">
              <History size={10} className="text-terminal-gold" /> Historical_Price_Topography (12M)
            </h4>
            <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-terminal-cyan animate-pulse" />
                <span className="text-[8px] text-zinc-500 uppercase">Live_Render</span>
            </div>
          </div>

          <div className="h-[140px] w-full">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full w-full flex flex-col items-center justify-center gap-2"
                >
                    <Loader2 size={16} className="text-terminal-cyan animate-spin" />
                    <span className="text-[8px] text-terminal-cyan/40 uppercase tracking-widest">Reconstructing_Price_History...</span>
                </motion.div>
              ) : error ? (
                <motion.div className="h-full w-full flex items-center justify-center text-terminal-red text-[10px] font-mono">
                    {error}
                </motion.div>
              ) : (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="h-full w-full"
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history}>
                            <defs>
                                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#00E0FF" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#00E0FF" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                            <XAxis 
                                dataKey="date" 
                                hide={true}
                            />
                            <YAxis 
                                domain={['auto', 'auto']} 
                                orientation="right"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 8, fill: '#666' }}
                            />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: '#020202', 
                                    border: '1px solid #1A1A1A', 
                                    fontSize: '10px',
                                    fontFamily: 'Inter, sans-serif'
                                }}
                                itemStyle={{ color: '#00E0FF' }}
                                labelStyle={{ color: '#666', marginBottom: '4px' }}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="price" 
                                stroke="#00E0FF" 
                                fillOpacity={1} 
                                fill="url(#colorPrice)" 
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="absolute top-1/2 left-0 right-0 h-px bg-terminal-cyan/10 pointer-events-none" />
        </div>

        <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/30 p-2.5 border border-terminal-line rounded-sm">
                <div className="flex items-center gap-1.5 mb-1">
                   <Target size={11} className="text-terminal-gold" />
                   <span className="text-[8px] text-zinc-500 uppercase font-bold">IPO_Status</span>
                </div>
                <span className={cn(
                    "text-[10px] font-black uppercase tracking-tight",
                    stock.ipoStatus === 'pre' ? "text-terminal-gold" : "text-white"
                )}>{stock.ipoStatus?.replace('_', ' ') || 'MARKET_NODE'}</span>
            </div>
            <div className="bg-black/30 p-2.5 border border-terminal-line rounded-sm">
                <div className="flex items-center gap-1.5 mb-1">
                   <Zap size={11} className="text-terminal-cyan" />
                   <span className="text-[8px] text-zinc-500 uppercase font-bold">Resonance_Scan</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-[12px] font-black text-terminal-cyan">{stock.aiStrength || '0'}</span>
                    <span className="text-[8px] opacity-40">/ 10</span>
                </div>
            </div>
        </div>

        <div className="bg-terminal-cyan/5 border border-terminal-cyan/10 p-4 rounded-sm backdrop-blur-xl">
          <h4 className="text-[9px] font-mono font-bold text-terminal-cyan uppercase tracking-widest mb-3 flex items-center gap-2">
            <FlaskConical size={10} /> Spatial_Intel_Analysis
          </h4>
          <p className="text-[10px] leading-relaxed text-zinc-400 font-mono italic">
            {isEarlyMover ? 
              `Visual topography confirms a ${stock.change5d}% velocity surge. Convergence nodes accumulating across ${stock.sector} clusters. Recommend tactical entry at primary support levels.` : 
              `Equilibrium maintained. ${stock.ticker} shows 3D depth resilience at current levels. No emergent spatial anomalies detected in the 12M historical trajectory.`}
          </p>
        </div>

        <div className="p-4 border border-terminal-line rounded-sm space-y-3">
          <h4 className="text-[9px] font-mono font-bold text-terminal-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-terminal-line pb-2">
            <MapPin size={10} /> Jurisdictional_Mapping
          </h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-mono">
              <Building2 size={12} className="text-zinc-600" />
              <span className="text-white/80 uppercase">Origin: {stock.country} / Exchange: {stock.exchange}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {stock.themes.map((t, i) => (
                <span key={i} className="px-2 py-0.5 bg-zinc-900 border border-terminal-line text-[8px] uppercase text-terminal-gold rounded-sm font-black">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button className="w-full py-2.5 bg-terminal-cyan hover:bg-terminal-cyan/80 text-black font-black font-mono text-[10px] uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,224,255,0.2)] hover:shadow-[0_0_25px_rgba(0,224,255,0.4)]">
          BROADCAST_ALPHA_FEED <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
}
