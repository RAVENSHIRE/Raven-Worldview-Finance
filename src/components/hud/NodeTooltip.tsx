import { useMemo } from 'react';
import { StockNode } from '../../types';
import { useInteractionState } from '../../store/useInteractionState';
import { syntheticSparkline } from '../../lib/geo';
import Sparkline from '../Sparkline';
import { cn } from '../../lib/utils';

interface NodeTooltipProps {
  stocks: StockNode[];
}

// Lightweight "hopping" hover card. Heavy fundamentals (P/E, Debt/Equity,
// cap/volume rows) are deliberately stripped for lightning-fast spatial
// rendering — the card carries only price action, a sentiment tag, the top
// Perplexity catalyst headline, and a 30-day neon sparkline. Pure overlay
// driven from global interaction state; the globe canvas never re-renders
// because of it.
export default function NodeTooltip({ stocks }: NodeTooltipProps) {
  const hoveredTicker = useInteractionState(s => s.hoveredTicker);
  const pos = useInteractionState(s => s.hoverScreenPos);
  const intel = useInteractionState(s => s.intel);

  const stock = useMemo(
    () => stocks.find(s => s.ticker === hoveredTicker) || null,
    [stocks, hoveredTicker]
  );

  const spark = useMemo(
    () => (stock ? syntheticSparkline(stock.ticker, stock.change1d) : []),
    [stock]
  );

  if (!stock || !pos) return null;

  const report = intel[stock.ticker];
  const up = stock.change1d >= 0;
  const sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    stock.change1d > 1.5 ? 'BULLISH' : stock.change1d < -1.5 ? 'BEARISH' : 'NEUTRAL';

  // Top event: first sentence of the Perplexity catalyst when covered.
  const topEvent = report?.catalystSummary
    ? report.catalystSummary.split(/(?<=[.!?])\s/)[0].slice(0, 140)
    : null;

  // Flip near viewport edges so the card always hops inside the screen.
  const flipX = pos.x > window.innerWidth - 300;
  const flipY = pos.y > window.innerHeight - 200;

  return (
    <div
      className="fixed z-50 pointer-events-none font-mono"
      style={{
        left: flipX ? pos.x - 290 : pos.x + 18,
        top: flipY ? pos.y - 180 : pos.y + 12,
      }}
    >
      <div className="w-[272px] rounded-sm border border-terminal-cyan/40 bg-[#0c0f14]/80 backdrop-blur-md shadow-[0_0_24px_rgba(0,240,255,0.15)] p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-black tracking-widest text-white">[{stock.ticker}]</span>
          <span className="text-[11px] font-black text-white">
            ${Number(stock.price).toFixed(2)}{' '}
            <span className={up ? 'text-terminal-green' : 'text-terminal-red'}>
              ({up ? '+' : ''}{Number(stock.change1d).toFixed(2)}%)
            </span>
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-[8px] uppercase tracking-widest">
          <span className="text-zinc-600">Sentiment:</span>
          <span className={cn(
            "px-1.5 py-0.5 rounded-sm border font-black",
            sentiment === 'BULLISH' && "text-terminal-green border-terminal-green/50 bg-terminal-green/10 shadow-[0_0_8px_rgba(0,255,102,0.3)]",
            sentiment === 'BEARISH' && "text-terminal-red border-terminal-red/50 bg-terminal-red/10 shadow-[0_0_8px_rgba(255,56,68,0.3)]",
            sentiment === 'NEUTRAL' && "text-terminal-cyan border-terminal-cyan/40 bg-terminal-cyan/5",
          )}>
            {sentiment}
          </span>
        </div>

        {topEvent && (
          <div className="mt-1.5 text-[9px] leading-snug text-zinc-300 border-l-2 border-terminal-gold/60 pl-2">
            <span className="text-zinc-600 uppercase tracking-widest text-[7px] block">Top Event</span>
            {topEvent}
          </div>
        )}

        <div className="mt-2">
          <div className="text-[7px] uppercase tracking-widest text-zinc-600 mb-0.5">Progression · 30D</div>
          <Sparkline data={spark} stroke={up ? '#00ff66' : '#ff3844'} width={244} height={30} />
        </div>
      </div>
    </div>
  );
}
