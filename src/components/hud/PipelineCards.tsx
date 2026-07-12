import { useMemo } from 'react';
import { StockNode } from '../../types';
import { cn } from '../../lib/utils';
import { syntheticSparkline } from '../../lib/geo';
import Sparkline from '../Sparkline';
import { useInteractionState } from '../../store/useInteractionState';

interface PipelineCardsProps {
  stocks: StockNode[];
  watchlistTickers: Set<string>;
  onSelect: (stock: StockNode) => void;
}

type Stage = 'SCREENED' | 'DUE DILIGENCE' | 'ANALYSIS';

// Stage assignment: user watchlist assets are SCREENED; strong daily movers
// are in DUE DILIGENCE; the remainder sit in ANALYSIS.
function stageOf(s: StockNode, watchlist: Set<string>): Stage {
  if (watchlist.has(s.ticker)) return 'SCREENED';
  if (Math.abs(s.change1d) >= 2) return 'DUE DILIGENCE';
  return 'ANALYSIS';
}

function AssetCard({ stock, active, onSelect }: { stock: StockNode; active: boolean; onSelect: () => void }) {
  const up = stock.change1d >= 0;
  const spark = useMemo(() => syntheticSparkline(stock.ticker, stock.change1d, 24), [stock.ticker, stock.change1d]);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-sm border p-2.5 transition-all bg-black/30",
        active
          ? "border-terminal-gold shadow-[0_0_12px_rgba(255,170,0,0.25)]"
          : up ? "border-terminal-line hover:border-terminal-green/50" : "border-terminal-line hover:border-terminal-red/50"
      )}
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[11px] font-black text-white tracking-wide">{stock.ticker}</div>
          <div className="text-[7px] uppercase tracking-widest text-zinc-600">{stock.sector || '—'}</div>
        </div>
        <span className="text-zinc-700 text-[10px]">⋮</span>
      </div>

      <div className="text-[7px] uppercase tracking-widest text-zinc-600 mb-1.5 leading-relaxed">
        Expanded scoring<br />AI-driven sentiment · Narrative consensus
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="shrink-0">
          <div className={cn("text-[11px] font-black", up ? "text-terminal-green" : "text-terminal-red")}>
            {stock.price > 0 ? `$${Number(stock.price).toFixed(2)}` : '—'}
          </div>
          <div className={cn("text-[9px] font-black", up ? "text-terminal-green" : "text-terminal-red")}>
            {up ? '+' : ''}{Number(stock.change1d).toFixed(1)}%
          </div>
        </div>
        <Sparkline data={spark} stroke={up ? '#00ff66' : '#ff3844'} width={96} height={26} />
      </div>

      <div className="flex gap-1 mt-2">
        <span className="px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest border border-terminal-red/40 text-terminal-red/80 rounded-[1px]">
          RISK {stock.riskScore ?? '—'}
        </span>
        {stock.themes?.[0] && (
          <span className="px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest border border-terminal-gold/40 text-terminal-gold/80 rounded-[1px]">
            {stock.themes[0]}
          </span>
        )}
      </div>
    </button>
  );
}

// High-density vertical pipeline: assets tracked from initial screen through
// analysis, one column per stage, micro-cards with sparklines.
export default function PipelineCards({ stocks, watchlistTickers, onSelect }: PipelineCardsProps) {
  const focusedTicker = useInteractionState(s => s.focusedTicker);

  const groups = useMemo(() => {
    const g: Record<Stage, StockNode[]> = { 'SCREENED': [], 'DUE DILIGENCE': [], 'ANALYSIS': [] };
    for (const s of stocks) g[stageOf(s, watchlistTickers)].push(s);
    return g;
  }, [stocks, watchlistTickers]);

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-3 space-y-4">
      {(Object.keys(groups) as Stage[]).map(stage => (
        <div key={stage}>
          <div className="flex items-center gap-2 mb-2 sticky top-0 bg-terminal-panel py-1 z-10">
            <span className="text-[9px] font-black uppercase tracking-widest text-white">{stage}</span>
            <span className="text-[8px] text-zinc-600 font-black">({groups[stage].length})</span>
            {stage === 'SCREENED' && (
              <span className="text-[7px] uppercase tracking-widest text-terminal-green ml-auto">WATCHLISTED</span>
            )}
          </div>
          <div className="space-y-2">
            {groups[stage].length === 0 ? (
              <div className="text-[8px] text-zinc-700 uppercase tracking-widest italic px-1">Empty stage</div>
            ) : groups[stage].slice(0, 8).map(s => (
              <AssetCard
                key={s.ticker}
                stock={s}
                active={focusedTicker === s.ticker}
                onSelect={() => onSelect(s)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
