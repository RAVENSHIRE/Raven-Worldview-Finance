import { useMemo } from 'react';
import { StockNode } from '../../types';
import { useInteractionState } from '../../store/useInteractionState';
import { exchangeCoords, syntheticSparkline } from '../../lib/geo';
import Sparkline from '../Sparkline';

interface NodeTooltipProps {
  stocks: StockNode[];
}

// Glassmorphic hover card anchored next to the hovered globe node.
// Pure overlay: it renders from global interaction state only, so the globe
// canvas never re-renders because of it.
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

  const ex = exchangeCoords(stock.exchange);
  const report = intel[stock.ticker];
  const up = stock.change1d >= 0;

  // Flip the card to the left/top when near the viewport edge
  const flipX = pos.x > window.innerWidth - 300;
  const flipY = pos.y > window.innerHeight - 280;

  return (
    <div
      className="fixed z-50 pointer-events-none font-mono"
      style={{
        left: flipX ? pos.x - 292 : pos.x + 18,
        top: flipY ? pos.y - 260 : pos.y + 12,
      }}
    >
      <div className="w-[274px] rounded-sm border border-terminal-cyan/40 bg-[#0c0f14]/80 backdrop-blur-md shadow-[0_0_24px_rgba(0,240,255,0.15)] p-3">
        <div className="flex items-baseline justify-between border-b border-terminal-line pb-1.5 mb-2">
          <span className="text-[11px] font-black tracking-widest text-white">[{stock.ticker}] NODE DETAILS</span>
          <span className={up ? 'text-terminal-green text-[10px] font-black' : 'text-terminal-red text-[10px] font-black'}>
            {up ? '+' : ''}{Number(stock.change1d).toFixed(2)}%
          </span>
        </div>

        <div className="space-y-0.5 text-[9px] leading-relaxed">
          <div><span className="text-zinc-600">1. Country:</span> <span className="text-zinc-200">{stock.country || '—'}</span></div>
          <div><span className="text-zinc-600">2. Exchange:</span> <span className="text-zinc-200">{ex?.label || stock.exchange || '—'}</span></div>
          <div><span className="text-zinc-600">3. Company:</span> <span className="text-zinc-200">{stock.name} ({stock.ticker})</span></div>
        </div>

        <div className="mt-2 mb-1">
          <div className="text-[8px] uppercase tracking-widest text-zinc-600 mb-1">Price Chart (Last 30D)</div>
          <Sparkline data={spark} stroke={up ? '#00ff66' : '#ff3844'} width={246} height={36} />
        </div>

        <div className="text-[9px] border-t border-terminal-line pt-1.5 space-y-0.5">
          <div className="text-zinc-500">
            ${Number(stock.price).toFixed(2)} · CAP ${(stock.marketCap / 1e9).toFixed(1)}B · VOL {(stock.volume / 1e6).toFixed(1)}M
          </div>
          {report && (
            <>
              <div>
                <span className="text-zinc-600">Asymmetry:</span>{' '}
                <span className="text-terminal-gold font-black">{report.informationAsymmetryScore}/10</span>
              </div>
              <div>
                <span className="text-zinc-600">Narrative:</span>{' '}
                <span className="text-terminal-cyan font-black uppercase">{report.narrativeConsensus}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
