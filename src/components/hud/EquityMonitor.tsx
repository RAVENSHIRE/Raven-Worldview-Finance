import { StockNode } from '../../types';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { AlertCircle, Zap } from 'lucide-react';

interface MonitorProps {
  stocks: StockNode[];
  onSelectStock: (stock: StockNode) => void;
  selectedStock?: StockNode | null;
  showSignals?: boolean;
}

export default function EquityMonitor({ stocks, onSelectStock, selectedStock, showSignals = true }: MonitorProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-[11px]">
          <thead className="sticky top-0 bg-terminal-bg z-10">
            <tr className="border-b border-terminal-line">
              <th className="px-4 py-3 text-[9px] text-terminal-text-secondary uppercase tracking-widest font-medium">Ticker</th>
              <th className="px-4 py-3 text-[9px] text-terminal-text-secondary uppercase tracking-widest font-medium">Sector</th>
              <th className="px-4 py-3 text-[9px] text-terminal-text-secondary uppercase tracking-widest font-medium text-right">Price</th>
              <th className="px-4 py-3 text-[9px] text-terminal-text-secondary uppercase tracking-widest font-medium text-right">CHG</th>
              <th className="px-4 py-3 text-[9px] text-terminal-text-secondary uppercase tracking-widest font-medium text-center">SYNC</th>
              <th className="px-4 py-3 text-[9px] text-terminal-text-secondary uppercase tracking-widest font-medium">IPO_Stat</th>
              <th className="px-4 py-3 text-[9px] text-terminal-text-secondary uppercase tracking-widest font-medium text-center">AI_Str</th>
              {showSignals && <th className="px-4 py-3 text-[9px] text-terminal-text-secondary uppercase tracking-widest font-medium">Signal</th>}
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => {
              const isSelected = selectedStock?.ticker === stock.ticker;
              const isGain1d = stock.change1d >= 0;
              const surge = stock.avg30dVolume > 0 ? (stock.volume / stock.avg30dVolume).toFixed(1) : '0.0';
              const isBreakout = parseFloat(surge) > 2.0;

              return (
                <motion.tr
                  key={stock.ticker}
                  onClick={() => onSelectStock(stock)}
                  className={cn(
                    "cursor-pointer border-b border-terminal-line transition-colors",
                    isSelected ? "bg-white/10" : "hover:bg-white/[0.04]",
                    stock.trumpBeta && stock.trumpBeta >= 9 && !isSelected && "bg-terminal-gold/5"
                  )}
                >
                  <td className={cn("px-4 py-2 text-white font-bold", isSelected && "text-terminal-cyan")}>
                    {stock.ticker}
                  </td>
                  <td className="px-4 py-2 text-terminal-text-secondary italic">
                    {stock.sector}
                  </td>
                  <td className="px-4 py-2 text-right text-terminal-cyan">
                    {stock.price.toFixed(2)}
                  </td>
                  <td className={cn(
                    "px-4 py-2 text-right font-bold",
                    isGain1d ? "text-terminal-green" : "text-terminal-red"
                  )}>
                    {isGain1d ? '+' : ''}{stock.change1d.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2 text-center">
                    {stock.isStale ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-terminal-red/10 text-terminal-red border border-terminal-red/20 rounded-[1px] text-[8px] animate-pulse font-black">
                        <AlertCircle size={8} /> STALE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-terminal-green/5 text-terminal-green/60 border border-terminal-green/20 rounded-[1px] text-[8px]">
                        <Zap size={8} className="fill-terminal-green" /> LIVE
                      </span>
                    )}
                  </td>
                  <td className={cn(
                    "px-4 py-2 uppercase font-black tracking-tighter text-[10px]",
                    stock.ipoStatus === 'pre' ? "text-terminal-gold" : "text-white"
                  )}>
                    {stock.ipoStatus || 'PUBLIC'}
                  </td>
                  <td className="px-4 py-2 text-center text-terminal-cyan font-bold">
                    {stock.aiStrength !== undefined ? stock.aiStrength : '---'}
                  </td>
                  {showSignals && (
                    <td className="px-4 py-2">
                      {isBreakout ? (
                        <span className="text-terminal-cyan font-bold tracking-tighter">BREAKOUT</span>
                      ) : stock.change5d > 10 ? (
                        <span className="text-terminal-cyan font-bold tracking-tighter">MOMENTUM</span>
                      ) : (
                        <span className="text-terminal-text-secondary opacity-60 uppercase">Consolidating</span>
                      )}
                    </td>
                  )}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
