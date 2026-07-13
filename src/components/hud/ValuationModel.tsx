import { useEffect, useMemo, useState } from 'react';
import { StockNode } from '../../types';
import { cn } from '../../lib/utils';
import { Calculator, Loader2 } from 'lucide-react';
import {
  Fundamentals,
  Assumptions,
  ingestStatements,
  projectForward,
  solveImpliedReturn,
  intrinsicValue,
  defaultAssumptions,
} from '../../lib/dcf';

interface ValuationModelProps {
  stock: StockNode;
}

const fmt = (v: number): string => {
  if (!Number.isFinite(v) || v === 0) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toFixed(0);
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Editable neon assumption cell: the user tweaks growth/margins and the
// reverse-DCF implied return recomputes live.
function EditCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState((value * 100).toFixed(1));
  useEffect(() => { setText((value * 100).toFixed(1)); }, [value]);
  return (
    <div className="flex items-center justify-end">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text);
          if (Number.isFinite(n)) onChange(Math.max(-0.9, Math.min(3, n / 100)));
          else setText((value * 100).toFixed(1));
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-14 bg-terminal-green/5 border border-terminal-green/40 text-terminal-green text-right text-[9px] font-black px-1 py-0.5 rounded-[1px] outline-none focus:border-terminal-green focus:shadow-[0_0_8px_rgba(0,255,102,0.3)] transition-all"
      />
      <span className="text-[8px] text-terminal-green/60 ml-0.5">%</span>
    </div>
  );
}

// Automated 3-statement + Reverse DCF module: historicals on the left,
// editable 5-year forward projections on the right, implied return on top.
export default function ValuationModel({ stock }: ValuationModelProps) {
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFundamentals(null);
    setAssumptions(null);
    (async () => {
      try {
        const res = await fetch(new URL(`/api/fundamentals/${stock.ticker}`, window.location.origin).toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        if (cancelled) return;
        const history = ingestStatements(raw.history);
        const f: Fundamentals = {
          ticker: raw.ticker,
          currency: raw.currency || 'USD',
          marketCap: raw.marketCap || stock.marketCap,
          history,
          source: raw.source === 'api' ? 'api' : 'derived',
        };
        setFundamentals(f);
        setAssumptions(defaultAssumptions(history));
      } catch {
        if (!cancelled) setFundamentals(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stock.ticker, stock.marketCap]);

  const latest = fundamentals?.history[fundamentals.history.length - 1] ?? null;

  const projections = useMemo(() => {
    if (!latest || !assumptions) return [];
    return projectForward(latest.revenue, assumptions);
  }, [latest, assumptions]);

  const impliedReturn = useMemo(() => {
    if (!fundamentals || !assumptions || projections.length === 0) return null;
    return solveImpliedReturn(fundamentals.marketCap || stock.marketCap, projections, assumptions.terminalGrowth);
  }, [fundamentals, assumptions, projections, stock.marketCap]);

  const fairValueAt10 = useMemo(() => {
    if (!assumptions || projections.length === 0) return null;
    return intrinsicValue(projections, assumptions.terminalGrowth, 0.10);
  }, [assumptions, projections]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-[9px] uppercase tracking-widest text-zinc-600">
        <Loader2 size={12} className="animate-spin text-terminal-cyan" /> Building valuation model…
      </div>
    );
  }
  if (!fundamentals || !latest || !assumptions) {
    return (
      <div className="p-6 text-[9px] uppercase tracking-widest text-zinc-700">
        Valuation model unavailable for {stock.ticker}.
      </div>
    );
  }

  const upside = fairValueAt10 && fundamentals.marketCap > 0
    ? (fairValueAt10 / fundamentals.marketCap - 1)
    : null;

  const ROWS: { label: string; get: (y: typeof latest) => number }[] = [
    { label: 'Revenue', get: y => y.revenue },
    { label: 'EBITDA', get: y => y.ebitda },
    { label: 'Net Income', get: y => y.netIncome },
    { label: 'Total Debt', get: y => y.totalDebt },
    { label: 'Cash', get: y => y.cash },
    { label: 'Equity', get: y => y.equity },
    { label: 'Op. Cash Flow', get: y => y.operatingCashFlow },
    { label: 'CapEx', get: y => -y.capex },
    { label: 'Free Cash Flow', get: y => y.freeCashFlow },
  ];

  return (
    <div className="border border-terminal-line rounded-sm bg-black/30 overflow-hidden">
      {/* Header: glowing implied-return metric */}
      <div className="flex items-stretch border-b border-terminal-line">
        <div className="flex items-center gap-2 px-3 py-2 flex-1">
          <Calculator size={12} className="text-terminal-cyan" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-white">DEEP DIVE VALUATION · {fundamentals.ticker}</div>
            <div className="text-[7px] uppercase tracking-widest text-zinc-600">
              3-Statement + Reverse DCF {fundamentals.source === 'derived' && <span className="text-terminal-gold">· DERIVED MODEL (provider offline)</span>}
            </div>
          </div>
        </div>
        <div className={cn(
          "px-4 py-2 border-l border-terminal-line flex flex-col items-end justify-center",
          impliedReturn !== null && impliedReturn >= 0.10 ? "bg-terminal-green/10" : "bg-terminal-red/10"
        )}>
          <span className="text-[7px] uppercase tracking-widest text-zinc-500">Implied Return (Reverse DCF)</span>
          <span className={cn(
            "text-[16px] font-black",
            impliedReturn !== null && impliedReturn >= 0.10
              ? "text-terminal-green [text-shadow:0_0_12px_rgba(0,255,102,0.5)]"
              : "text-terminal-red [text-shadow:0_0_12px_rgba(255,56,68,0.5)]"
          )}>
            {impliedReturn !== null ? pct(impliedReturn) : 'N/A'}
          </span>
        </div>
        <div className="px-4 py-2 border-l border-terminal-line flex flex-col items-end justify-center">
          <span className="text-[7px] uppercase tracking-widest text-zinc-500">Upside @ 10% hurdle</span>
          <span className={cn("text-[12px] font-black", upside !== null && upside >= 0 ? "text-terminal-green" : "text-terminal-red")}>
            {upside !== null ? pct(upside) : '—'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        {/* Historicals grid */}
        <table className="w-full text-[9px] font-mono">
          <thead>
            <tr className="border-b border-terminal-line text-zinc-600 uppercase tracking-widest text-[7px]">
              <th className="text-left px-3 py-1.5 font-black">Historicals ({fundamentals.currency})</th>
              {fundamentals.history.map(y => (
                <th key={y.year} className="text-right px-3 py-1.5 font-black">FY{y.year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.label} className="border-b border-terminal-line/40 hover:bg-white/[0.02]">
                <td className="px-3 py-1 text-zinc-400">{row.label}</td>
                {fundamentals.history.map(y => {
                  const v = row.get(y);
                  return (
                    <td key={y.year} className={cn("px-3 py-1 text-right font-black", v < 0 ? "text-terminal-red/80" : "text-zinc-200")}>
                      {fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Forward projections with editable assumptions */}
        <table className="w-full text-[9px] font-mono border-t-2 border-terminal-cyan/30">
          <thead>
            <tr className="border-b border-terminal-line text-zinc-600 uppercase tracking-widest text-[7px]">
              <th className="text-left px-3 py-1.5 font-black text-terminal-cyan">Forward Projections</th>
              {projections.map(p => (
                <th key={p.year} className="text-right px-3 py-1.5 font-black">FY{p.year}E</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-terminal-line/40">
              <td className="px-3 py-1 text-zinc-400">Revenue Growth <span className="text-terminal-green/60">(edit)</span></td>
              {assumptions.growthRates.map((g, i) => (
                <td key={i} className="px-3 py-1">
                  <EditCell
                    value={g}
                    onChange={(v) => setAssumptions(a => a && ({
                      ...a,
                      growthRates: a.growthRates.map((x, j) => j === i ? v : x),
                    }))}
                  />
                </td>
              ))}
            </tr>
            <tr className="border-b border-terminal-line/40">
              <td className="px-3 py-1 text-zinc-400">Revenue</td>
              {projections.map(p => (
                <td key={p.year} className="px-3 py-1 text-right font-black text-zinc-200">{fmt(p.revenue)}</td>
              ))}
            </tr>
            <tr className="border-b border-terminal-line/40">
              <td className="px-3 py-1 text-zinc-400">Free Cash Flow</td>
              {projections.map(p => (
                <td key={p.year} className={cn("px-3 py-1 text-right font-black", p.freeCashFlow >= 0 ? "text-terminal-green/90" : "text-terminal-red/90")}>
                  {fmt(p.freeCashFlow)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* Global assumptions strip */}
        <div className="flex items-center gap-6 px-3 py-2 border-t border-terminal-line bg-terminal-panel/40">
          <div className="flex items-center gap-2">
            <span className="text-[8px] uppercase tracking-widest text-zinc-500">FCF Margin</span>
            <EditCell value={assumptions.fcfMargin} onChange={(v) => setAssumptions(a => a && ({ ...a, fcfMargin: v }))} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] uppercase tracking-widest text-zinc-500">Terminal Growth</span>
            <EditCell value={assumptions.terminalGrowth} onChange={(v) => setAssumptions(a => a && ({ ...a, terminalGrowth: Math.min(0.05, v) }))} />
          </div>
          <div className="ml-auto text-[8px] uppercase tracking-widest text-zinc-600">
            Market Cap {fmt(fundamentals.marketCap || stock.marketCap)} · Fair value @10% {fairValueAt10 ? fmt(fairValueAt10) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
