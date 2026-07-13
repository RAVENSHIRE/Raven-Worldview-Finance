import { useMemo, useState } from 'react';
import { StockNode } from '../../types';
import { cn } from '../../lib/utils';
import { evaluateRiskState } from '../../services/riskMonitoringEngine';
import { ChevronDown, ChevronRight, ShieldAlert, Gauge } from 'lucide-react';

interface RiskExposurePanelProps {
  stocks: StockNode[];
  portfolioTickers: Set<string>;
}

type Region = 'AMERICAS' | 'EMEA' | 'APAC';

const regionOf = (lon: number): Region =>
  lon < -30 ? 'AMERICAS' : lon < 60 ? 'EMEA' : 'APAC';

// Bottom-left glassmorphic "Risk & Exposure" overlay: translates classic 2D
// portfolio-sheet metrics (AUM, net exposure, sector/region concentration,
// invalidation-level breaches) into the spatial workspace. Position sizes are
// synthesized (~$1M notional per holding) until a real positions ledger exists.
export default function RiskExposurePanel({ stocks, portfolioTickers }: RiskExposurePanelProps) {
  const [open, setOpen] = useState(true);

  const model = useMemo(() => {
    const portfolio = stocks.filter(s => portfolioTickers.has(s.ticker) && s.price > 0);
    if (portfolio.length === 0) return null;

    const positions = portfolio.map(s => ({
      stock: s,
      notional: s.price * Math.max(1, Math.round(1_000_000 / s.price)),
    }));
    const aum = positions.reduce((sum, p) => sum + p.notional, 0);

    // Long-only book until short positions exist; a small cash drag keeps the
    // net figure honest rather than a hardcoded 0.98.
    const netExposure = aum > 0 ? 1 - Math.min(0.05, portfolio.length * 0.005) : 0;

    const bySector = new Map<string, number>();
    const byRegion = new Map<Region, { notional: number; avgChange: number; n: number }>();
    for (const p of positions) {
      const sector = p.stock.sector || 'Other';
      bySector.set(sector, (bySector.get(sector) ?? 0) + p.notional);
      const r = regionOf(p.stock.lon);
      const cur = byRegion.get(r) ?? { notional: 0, avgChange: 0, n: 0 };
      cur.notional += p.notional;
      cur.avgChange += p.stock.change1d;
      cur.n += 1;
      byRegion.set(r, cur);
    }
    const topSector = [...bySector.entries()].sort((a, b) => b[1] - a[1])[0];
    const regions = [...byRegion.entries()]
      .map(([region, v]) => ({
        region,
        pct: v.notional / aum,
        avgChange: v.avgChange / v.n,
        redFlag: v.avgChange / v.n <= -3,
      }))
      .sort((a, b) => b.pct - a.pct);

    // Day-weighted P&L as YTD-alpha stand-in until fills history exists.
    const dayAlpha = positions.reduce((sum, p) => sum + p.notional * (p.stock.change1d / 100), 0);
    // Binary invalidation hook: numeric level when configured, -8% daily
    // proxy until per-asset Invalidation_Level_Num values are populated.
    const breaches = portfolio.filter(s =>
      evaluateRiskState(s.price, s.invalidationLevelNum ?? 0) === 'INVALIDATED' || s.change1d <= -8
    );

    return { aum, netExposure, topSector, regions, dayAlpha, breaches, count: portfolio.length };
  }, [stocks, portfolioTickers]);

  const fmtM = (v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`;

  return (
    <div className="w-64 rounded-sm border border-terminal-line bg-terminal-panel/70 backdrop-blur-md select-none">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-terminal-cyan"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        <Gauge size={10} />
        RISK &amp; EXPOSURE
        {model && model.breaches.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-terminal-red">
            <ShieldAlert size={9} className="animate-pulse" /> {model.breaches.length}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-2.5">
          {!model ? (
            <div className="text-[8px] uppercase tracking-widest text-zinc-700 italic py-1">
              No priced portfolio positions. Add tickers via &gt; LOAD.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[8px] uppercase tracking-widest border-b border-terminal-line/60 pb-2 mb-2">
                <div className="text-zinc-600">Total AUM</div>
                <div className="text-right font-black text-white">{fmtM(model.aum)}</div>
                <div className="text-zinc-600">Day Alpha</div>
                <div className={cn("text-right font-black", model.dayAlpha >= 0 ? "text-terminal-green" : "text-terminal-red")}>
                  {model.dayAlpha >= 0 ? '+' : '-'}{fmtM(Math.abs(model.dayAlpha))}
                </div>
                <div className="text-zinc-600">Net Exposure</div>
                <div className="text-right font-black text-terminal-cyan">{model.netExposure.toFixed(2)}</div>
                <div className="text-zinc-600">Top Sector</div>
                <div className="text-right font-black text-white truncate">
                  {model.topSector ? `${model.topSector[0]} ${(model.topSector[1] / model.aum * 100).toFixed(0)}%` : '—'}
                </div>
              </div>

              <div className="space-y-1">
                {model.regions.map(r => (
                  <div key={r.region} className="flex items-center gap-2 text-[8px] uppercase tracking-widest">
                    <span className={cn("w-16 shrink-0", r.redFlag ? "text-terminal-red font-black animate-pulse" : "text-zinc-500")}>
                      {r.region}
                    </span>
                    <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", r.redFlag ? "bg-terminal-red shadow-[0_0_6px_#ff3844]" : "bg-terminal-cyan shadow-[0_0_6px_#00f0ff]")}
                        style={{ width: `${Math.round(r.pct * 100)}%` }}
                      />
                    </div>
                    <span className={cn("w-8 text-right font-black", r.redFlag ? "text-terminal-red" : "text-zinc-400")}>
                      {(r.pct * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>

              {model.breaches.length > 0 && (
                <div className="mt-2 pt-2 border-t border-terminal-red/30 text-[8px] uppercase tracking-widest">
                  <div className="text-terminal-red font-black mb-0.5 flex items-center gap-1">
                    <ShieldAlert size={9} /> INVALIDATION_LEVEL BREACH
                  </div>
                  {model.breaches.map(b => (
                    <div key={b.ticker} className="flex justify-between text-zinc-400">
                      <span>{b.ticker}</span>
                      <span className="text-terminal-red font-black">INVALIDATED {b.change1d.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
