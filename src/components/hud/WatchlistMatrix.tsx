import { useEffect, useMemo, useState } from 'react';
import { StockNode } from '../../types';
import { cn } from '../../lib/utils';
import { ChevronDown, ChevronRight, Sigma, Zap } from 'lucide-react';

// Dense multi-signal watchlist table with the institutional quant edge:
// market cap, volume vs ADV, 50/200-DMA and 52-week positioning modeled after
// the Chris Portfolio Management Dashboard layout. The quant column group is
// foldable so the deep matrix only surfaces when analyzing an asset/sector.
// Quantitative columns stream from the backend /api/quant feed (Google-Finance
// style automated series) — zero manual data entry.

interface QuantRow {
  dma50: number;
  dma200: number;
  pctFrom52wHigh: number;
  pctFrom52wLow: number;
}

interface WatchlistMatrixProps {
  stocks: StockNode[];
  watchlistTickers: Set<string>;
  onSelect: (stock: StockNode) => void;
  selected?: StockNode | null;
}

type SortKey = 'ticker' | 'price' | 'change1d' | 'marketCap' | 'volSurge' | 'dma50' | 'dma200' | 'fromHigh' | 'fromLow';

export default function WatchlistMatrix({ stocks, watchlistTickers, onSelect, selected }: WatchlistMatrixProps) {
  const [quant, setQuant] = useState<Record<string, QuantRow>>({});
  const [quantOpen, setQuantOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('change1d');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  // Watchlist assets first, then the monitored universe.
  const rows = useMemo(() => {
    const ranked = [...stocks].sort((a, b) => {
      const aw = watchlistTickers.has(a.ticker) ? 0 : 1;
      const bw = watchlistTickers.has(b.ticker) ? 0 : 1;
      return aw - bw;
    });
    const val = (s: StockNode): number | string => {
      const q = quant[s.ticker];
      switch (sortKey) {
        case 'ticker': return s.ticker;
        case 'price': return s.price;
        case 'change1d': return s.change1d;
        case 'marketCap': return s.marketCap;
        case 'volSurge': return s.avg30dVolume > 0 ? s.volume / s.avg30dVolume : 0;
        case 'dma50': return q?.dma50 ?? -Infinity;
        case 'dma200': return q?.dma200 ?? -Infinity;
        case 'fromHigh': return q?.pctFrom52wHigh ?? -Infinity;
        case 'fromLow': return q?.pctFrom52wLow ?? -Infinity;
      }
    };
    return ranked.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * sortDir;
      }
      return (av - bv) * sortDir;
    });
  }, [stocks, watchlistTickers, quant, sortKey, sortDir]);

  // Quant feed only for watchlist tickers (the deep matrix is per-portfolio).
  useEffect(() => {
    const tickers = [...watchlistTickers];
    if (!quantOpen || tickers.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const url = new URL('/api/quant', window.location.origin);
        url.searchParams.set('symbols', tickers.join(','));
        const res = await fetch(url.toString());
        if (res.ok && !cancelled) setQuant(await res.json());
      } catch { /* quant is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [quantOpen, watchlistTickers]);

  const header = (label: string, key: SortKey, align: 'left' | 'right' = 'right') => (
    <th
      onClick={() => {
        if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
        else { setSortKey(key); setSortDir(-1); }
      }}
      className={cn(
        "px-3 py-2 text-[8px] uppercase tracking-widest font-medium cursor-pointer select-none whitespace-nowrap",
        align === 'right' ? "text-right" : "text-left",
        sortKey === key ? "text-terminal-cyan" : "text-terminal-text-secondary hover:text-white"
      )}
    >
      {label}{sortKey === key ? (sortDir === -1 ? ' ▾' : ' ▴') : ''}
    </th>
  );

  const fmtCap = (v: number) => v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-terminal-line bg-terminal-panel/80 shrink-0">
        <Zap size={10} className="text-terminal-cyan" />
        <span className="text-[8px] font-black uppercase tracking-widest text-terminal-cyan">MULTI_SIGNAL_MATRIX</span>
        <button
          onClick={() => setQuantOpen(o => !o)}
          className={cn(
            "ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[8px] font-black uppercase tracking-widest transition-all",
            quantOpen
              ? "border-terminal-green/60 text-terminal-green bg-terminal-green/10 shadow-[0_0_10px_rgba(0,255,102,0.25)]"
              : "border-terminal-line text-zinc-500 hover:text-terminal-cyan hover:border-terminal-cyan/50"
          )}
        >
          {quantOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          <Sigma size={9} /> QUANT_EDGE
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-[10px]">
          <thead className="sticky top-0 bg-terminal-bg z-10">
            <tr className="border-b border-terminal-line">
              {header('Ticker', 'ticker', 'left')}
              {header('Price', 'price')}
              {header('Δ1D', 'change1d')}
              {header('Mkt Cap', 'marketCap')}
              {header('Vol/ADV', 'volSurge')}
              {quantOpen && (
                <>
                  {header('50-DMA', 'dma50')}
                  {header('200-DMA', 'dma200')}
                  {header('% 52W-HI', 'fromHigh')}
                  {header('% 52W-LO', 'fromLow')}
                </>
              )}
              <th className="px-3 py-2 text-[8px] uppercase tracking-widest font-medium text-terminal-text-secondary">Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const q = quant[s.ticker];
              const up = s.change1d >= 0;
              const surge = s.avg30dVolume > 0 ? s.volume / s.avg30dVolume : 0;
              const isSel = selected?.ticker === s.ticker;
              const watched = watchlistTickers.has(s.ticker);
              const aboveDMA200 = q && s.price > q.dma200;
              return (
                <tr
                  key={s.ticker}
                  onClick={() => onSelect(s)}
                  className={cn(
                    "cursor-pointer border-b border-terminal-line/60 transition-colors",
                    isSel ? "bg-white/10" : "hover:bg-white/[0.04]",
                    watched && !isSel && "bg-terminal-cyan/[0.03]"
                  )}
                >
                  <td className={cn("px-3 py-1.5 font-bold", isSel ? "text-terminal-cyan" : "text-white")}>
                    {watched && <span className="text-terminal-cyan mr-1">◈</span>}{s.ticker}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-200">{s.price > 0 ? `$${s.price.toFixed(2)}` : '—'}</td>
                  <td className={cn("px-3 py-1.5 text-right font-black", up ? "text-terminal-green" : "text-terminal-red")}>
                    {up ? '+' : ''}{s.change1d.toFixed(2)}%
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-400">{fmtCap(s.marketCap)}</td>
                  <td className={cn("px-3 py-1.5 text-right", surge > 2 ? "text-terminal-gold font-black" : "text-zinc-400")}>
                    {surge > 0 ? `${surge.toFixed(1)}x` : '—'}
                  </td>
                  {quantOpen && (
                    <>
                      <td className="px-3 py-1.5 text-right text-zinc-400">{q ? `$${q.dma50.toFixed(2)}` : '…'}</td>
                      <td className={cn("px-3 py-1.5 text-right", q ? (aboveDMA200 ? "text-terminal-green" : "text-terminal-red") : "text-zinc-600")}>
                        {q ? `$${q.dma200.toFixed(2)}` : '…'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-zinc-400">{q ? `${q.pctFrom52wHigh.toFixed(1)}%` : '…'}</td>
                      <td className="px-3 py-1.5 text-right text-zinc-400">{q ? `+${q.pctFrom52wLow.toFixed(1)}%` : '…'}</td>
                    </>
                  )}
                  <td className="px-3 py-1.5">
                    <span className={cn(
                      "text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border",
                      s.change1d > 1.5
                        ? "text-terminal-green border-terminal-green/40 bg-terminal-green/5"
                        : s.change1d < -1.5
                          ? "text-terminal-red border-terminal-red/40 bg-terminal-red/5"
                          : "text-zinc-500 border-terminal-line"
                    )}>
                      {s.change1d > 1.5 ? 'EXPANSION' : s.change1d < -1.5 ? 'CONTRACTION' : 'NEUTRAL'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
