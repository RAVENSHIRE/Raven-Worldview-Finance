import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Loader2, Globe2, Crosshair } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WatchlistNode } from '../../types';
import { useWatchlistState } from '../../store/useWatchlistState';

interface WatchlistPanelProps {
  onSelect?: (node: WatchlistNode) => void;
}

export default function WatchlistPanel({ onSelect }: WatchlistPanelProps) {
  const { nodes, addNode, removeNode } = useWatchlistState();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const ticker = input.trim().toUpperCase();
    if (!ticker || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(new URL('/api/watchlist', window.location.origin).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === 'SYMBOL_NOT_FOUND' ? `UNKNOWN_SYMBOL: ${ticker}`
               : data.error === 'ALREADY_WATCHED' ? `${ticker} ALREADY ON GLOBE`
               : data.error || 'ADD_FAILED');
      } else {
        addNode(data);            // optimistic; WS echo is deduped by ticker
        setInput('');
      }
    } catch (e: any) {
      setError('NETWORK_ERROR');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ticker: string) => {
    removeNode(ticker);           // optimistic
    try {
      await fetch(new URL(`/api/watchlist/${ticker}`, window.location.origin).toString(), { method: 'DELETE' });
    } catch { /* best effort; WS will reconcile */ }
  };

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Globe2 size={12} className="text-terminal-cyan" />
        <span className="text-[10px] font-black uppercase tracking-widest text-white">Watchlist</span>
        <span className="text-[8px] text-zinc-600 ml-auto uppercase tracking-widest">{nodes.length} NODES</span>
      </div>

      {/* Add ticker */}
      <div className="flex gap-1.5 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="ADD_TICKER (e.g. ASML)"
          className="flex-1 bg-black/40 border border-terminal-line rounded-sm py-1.5 px-2 text-[10px] uppercase tracking-widest focus:outline-none focus:border-terminal-cyan transition-all placeholder:text-zinc-700 font-mono"
        />
        <button
          onClick={add}
          disabled={busy || !input.trim()}
          className="px-2 bg-terminal-cyan/10 border border-terminal-cyan/40 text-terminal-cyan hover:bg-terminal-cyan hover:text-black transition-all rounded-sm disabled:opacity-30 flex items-center justify-center"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        </button>
      </div>

      {error && (
        <div className="text-[8px] text-terminal-red uppercase font-bold tracking-widest mb-2 px-1">{error}</div>
      )}

      {/* Node list */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1">
        {nodes.length === 0 ? (
          <div className="text-[8px] text-zinc-700 uppercase tracking-widest italic px-1 py-2">
            No companies tracked. Add a ticker to plot it on the globe.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {nodes.map((n) => (
              <motion.div
                key={n.ticker}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 bg-black/20 border border-terminal-line rounded-sm px-2 py-1.5 group hover:border-terminal-cyan/40 transition-colors"
              >
                <button onClick={() => onSelect?.(n)} className="flex-1 flex flex-col items-start min-w-0" title="Locate on globe">
                  <div className="flex items-center gap-1.5 w-full">
                    <Crosshair size={9} className="text-zinc-600 group-hover:text-terminal-cyan shrink-0" />
                    <span className="text-[10px] font-black text-white truncate">{n.ticker}</span>
                    <span className={cn("text-[9px] font-mono font-black ml-auto shrink-0", n.change1d >= 0 ? "text-terminal-green" : "text-terminal-red")}>
                      {n.change1d >= 0 ? '+' : ''}{Number(n.change1d).toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-[7px] text-zinc-600 uppercase tracking-tight truncate w-full text-left">
                    ${Number(n.price).toFixed(2)} · {n.exchange}
                  </span>
                </button>
                <button onClick={() => remove(n.ticker)} className="p-1 opacity-30 hover:opacity-100 hover:text-terminal-red transition-all shrink-0" title="Remove">
                  <X size={10} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
