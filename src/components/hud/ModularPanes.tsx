import { useInteractionState } from '../../store/useInteractionState';
import TradingViewChartWidget from '../TradingViewChartWidget';
import { cn } from '../../lib/utils';
import { X, CandlestickChart, Youtube } from 'lucide-react';

// Modularity grid — floating split-screen workspace panes over the spatial
// canvas. Spun out per asset from the pipeline rail or a globe node: inline
// TradingView charting or YouTube analysis, closable per pane. The grid
// splits 1→2→4 as panes accumulate.
export default function ModularPanes() {
  const panes = useInteractionState(s => s.panes);
  const removePane = useInteractionState(s => s.removePane);

  if (panes.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute inset-6 z-40 grid gap-2 pointer-events-none",
        panes.length === 1 ? "grid-cols-1 grid-rows-1 inset-x-[18%] inset-y-12" :
        panes.length === 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2"
      )}
    >
      {panes.map(pane => (
        <div
          key={pane.id}
          className="pointer-events-auto flex flex-col rounded-sm border border-terminal-cyan/40 bg-[#0c0f14]/85 backdrop-blur-md shadow-[0_0_30px_rgba(0,240,255,0.12)] overflow-hidden"
        >
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-terminal-line bg-black/50 shrink-0">
            {pane.kind === 'chart'
              ? <CandlestickChart size={11} className="text-terminal-cyan" />
              : <Youtube size={11} className="text-terminal-red" />}
            <span className="text-[8px] font-black uppercase tracking-widest text-white">
              {pane.kind === 'chart' ? 'TV_ADVANCED_CHART' : 'VIDEO_ANALYSIS'} :: {pane.ticker}
            </span>
            <button
              onClick={() => removePane(pane.id)}
              className="ml-auto text-zinc-600 hover:text-terminal-red transition-colors"
            >
              <X size={11} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {pane.kind === 'chart' ? (
              <TradingViewChartWidget ticker={pane.ticker} />
            ) : (
              <iframe
                title={`Video analysis ${pane.ticker}`}
                src={`https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(`${pane.ticker} stock analysis`)}`}
                className="w-full h-full border-0 bg-black"
                allow="accelerometer; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
