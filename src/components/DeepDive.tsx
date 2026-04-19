import { StockNode } from '../types';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { 
  Building2, 
  MapPin, 
  ShieldAlert, 
  BarChart3, 
  ExternalLink,
  Target,
  FlaskConical,
  Zap
} from 'lucide-react';

interface DeepDiveProps {
  stock: StockNode | null;
  onClose: () => void;
}

export default function DeepDive({ stock, onClose }: DeepDiveProps) {
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
    <div className="h-full flex flex-col bg-terminal-panel overflow-hidden">
      <div className="p-4 border-b border-terminal-line bg-black/20">
        <span className="section-label">Single Stock Deep Dive</span>
        
        <div className="stat-card">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-black font-sans text-white tracking-tighter leading-none">{stock.ticker}</h2>
              <p className="text-[10px] text-terminal-text-secondary font-mono mt-1">{stock.name}</p>
            </div>
            <span className="regime-badge" style={{ borderColor: '#D4AF37', color: '#D4AF37' }}>
              BETA: {stock.trumpBeta || 0}
            </span>
          </div>

          <div className="mt-6 flex items-end justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-terminal-text-secondary uppercase">Price_USD</span>
              <span className="text-2xl font-black font-mono text-terminal-cyan">${stock.price.toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-mono text-terminal-text-secondary uppercase">1D_Delta</span>
              <span className={cn(
                "text-sm font-black font-mono",
                stock.change1d >= 0 ? "text-terminal-green" : "text-terminal-red"
              )}>
                {stock.change1d >= 0 ? '+' : ''}{stock.change1d}%
              </span>
            </div>
          </div>

          {/* Sparkline Mock */}
          <div className="flex items-end gap-1 h-10 mt-4 overflow-hidden opacity-80">
            {[20, 45, 30, 65, 55, 80, 95, 75, 90, 85].map((h, i) => (
              <div 
                key={i} 
                className="flex-1 rounded-t-sm transition-all" 
                style={{ 
                  height: `${h}%`,
                  backgroundColor: stock.change1d >= 0 ? '#00FF41' : '#FF3131',
                  opacity: 0.3 + (i / 20)
                }} 
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card mb-0">
            <span className="section-label !mb-1 !text-[8px]">Risk Score</span>
            <div className="text-xl font-bold font-mono text-terminal-red">
              {stock.riskScore}<span className="text-[10px] text-terminal-text-secondary font-normal"> / 10</span>
            </div>
          </div>
          <div className="stat-card mb-0">
            <span className="section-label !mb-1 !text-[8px]">Revenue CAGR</span>
            <div className="text-xl font-bold font-mono text-terminal-cyan">
              {stock.revenueCagr5y}%
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-terminal-cyan/5 border border-terminal-cyan/20 p-3 rounded-sm">
          <h4 className="text-[9px] font-mono font-bold text-terminal-cyan uppercase tracking-widest mb-2 flex items-center gap-2">
            <FlaskConical size={10} /> FEED_ALPHA_LOG
          </h4>
          <p className="text-[10px] leading-relaxed text-zinc-400 font-mono italic">
            {isEarlyMover ? 
              `SIGNAL: ${stock.ticker} accumulation exceeds threshold. Momentum verified at ${stock.change5d}% (5D). Trade volume surge detected at ${volumeSurge}x.` : 
              `NEUTRAL: ${stock.ticker} maintaining core support levels. Volume profile remains within 30-day norms. No clear breakout signal detected.`}
          </p>
        </div>

        <div className="p-3 border border-terminal-line rounded-sm">
          <h4 className="text-[9px] font-mono font-bold text-terminal-text-secondary uppercase tracking-widest mb-3 flex items-center gap-2">
            <MapPin size={10} /> EXCHANGE_LOCATION
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-mono">
              <Building2 size={12} className="text-zinc-600" />
              <span>HQ: {stock.country} / Exchange: {stock.exchange}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {stock.themes.map((t, i) => (
                <span key={i} className="px-2 py-0.5 bg-terminal-line text-[8px] uppercase text-zinc-500 rounded-sm">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button className="w-full py-2 bg-black hover:bg-zinc-900 text-terminal-text-secondary hover:text-white font-mono text-[9px] uppercase tracking-tighter rounded border border-terminal-line flex items-center justify-center gap-2 transition-all">
          X-REF FEED <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
}
