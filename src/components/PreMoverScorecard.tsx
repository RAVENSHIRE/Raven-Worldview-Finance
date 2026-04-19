import { StockNode } from '../types';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Target, Zap, Globe, Rocket, ShieldAlert } from 'lucide-react';

interface ScorecardProps {
  stocks: StockNode[];
}

export default function PreMoverScorecard({ stocks }: ScorecardProps) {
  // Filter for Pre-Mover targets (IPOs or high AI/Macro beta)
  const targets = stocks.filter(s => s.ipoStatus === 'pre' || s.ipoStatus === 'imminent' || (s.aiStrength ?? 0) > 8);

  return (
    <div className="flex flex-col h-full bg-black/40 border border-terminal-line rounded-sm overflow-hidden font-mono">
      <div className="p-3 border-b border-terminal-line bg-terminal-panel/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="text-terminal-gold" size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest text-terminal-gold">Pre-Mover Watchlist Scoring</span>
        </div>
        <span className="text-[8px] opacity-40 uppercase">v1.2_SCORER</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {targets.length === 0 ? (
          <div className="p-10 text-center opacity-20 text-[10px] italic">No active pre-mover signals detected...</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-terminal-line/50">
                <th className="p-2 text-[9px] text-zinc-500 uppercase font-bold">Asset</th>
                <th className="p-2 text-[9px] text-zinc-500 uppercase font-bold text-center">AI_Str</th>
                <th className="p-2 text-[9px] text-zinc-500 uppercase font-bold text-center">Macro_β</th>
                <th className="p-2 text-[9px] text-zinc-500 uppercase font-bold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {targets.map(stock => (
                <tr key={stock.ticker} className="border-b border-terminal-line/20 hover:bg-white/5 transition-colors group">
                  <td className="p-2">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black group-hover:text-terminal-gold transition-colors">{stock.ticker}</span>
                      <span className="text-[8px] opacity-40 uppercase">{stock.sector}</span>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Zap size={8} className="text-terminal-cyan" />
                      <span className="text-[10px] font-bold text-zinc-300">{stock.aiStrength || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Globe size={8} className="text-terminal-cyan" />
                      <span className="text-[10px] font-bold text-zinc-300">{stock.macroBeta || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="p-2 text-right">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-[1px] text-[8px] font-bold uppercase tracking-tighter",
                      stock.ipoStatus === 'pre' ? "bg-terminal-gold/20 text-terminal-gold border border-terminal-gold/30" :
                      stock.ipoStatus === 'imminent' ? "bg-terminal-red/20 text-terminal-red border border-terminal-red/30 animate-pulse" :
                      "bg-terminal-green/20 text-terminal-green border border-terminal-green/30"
                    )}>
                      {stock.ipoStatus || 'ACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="p-2 bg-terminal-gold/5 border-t border-terminal-gold/20">
        <div className="flex items-center gap-2">
            <ShieldAlert size={10} className="text-terminal-gold" />
            <span className="text-[8px] text-terminal-gold/80 leading-tight uppercase font-medium">
              Information Asymmetry Alert: Positioning before narrative consensus.
            </span>
        </div>
      </div>
    </div>
  );
}
