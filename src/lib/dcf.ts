// ─── AUTOMATED 3-STATEMENT + REVERSE DCF ENGINE ───────────────────────────────
// Replaces the manual Excel "7-step DCF template": ingest standard financial
// API statements, project 5 years forward from editable assumptions, and solve
// for the discount rate implied by the current market cap (Reverse DCF).

export type StatementYear = {
  year: number;
  revenue: number;
  ebitda: number;
  netIncome: number;
  totalDebt: number;
  cash: number;
  equity: number;
  operatingCashFlow: number;
  capex: number;               // stored as a positive spend figure
  freeCashFlow: number;
};

export type Fundamentals = {
  ticker: string;
  currency: string;
  marketCap: number;
  history: StatementYear[];    // oldest → newest (last 3 fiscal years)
  source: 'api' | 'derived';   // 'derived' = synthesized from live quote when statements unavailable
};

export type Assumptions = {
  growthRates: number[];       // Y1..Y5 revenue growth, decimal (0.12 = 12%)
  fcfMargin: number;           // projected FCF / revenue, decimal
  terminalGrowth: number;      // perpetuity growth, decimal
};

export type Projection = {
  year: number;
  revenue: number;
  freeCashFlow: number;
};

// Map a raw financial-API payload (Financial Modeling Prep / Alpha Vantage /
// yahoo quoteSummary shapes) into normalized statement years. Missing line
// items degrade to 0 rather than throwing — the grid renders what exists.
export function ingestStatements(raw: any[], tickerYearKey = 'year'): StatementYear[] {
  return (raw || [])
    .map((r: any) => {
      const num = (...keys: string[]) => {
        for (const k of keys) {
          const v = r?.[k];
          if (v !== undefined && v !== null && Number.isFinite(Number(v))) return Number(v);
        }
        return 0;
      };
      const ocf = num('operatingCashFlow', 'totalCashFromOperatingActivities', 'netCashProvidedByOperatingActivities');
      const capex = Math.abs(num('capitalExpenditure', 'capitalExpenditures', 'capex'));
      return {
        year: num(tickerYearKey, 'calendarYear', 'fiscalYear') || new Date(r?.date || r?.endDate || Date.now()).getFullYear(),
        revenue: num('revenue', 'totalRevenue'),
        ebitda: num('ebitda', 'EBITDA'),
        netIncome: num('netIncome'),
        totalDebt: num('totalDebt', 'shortLongTermDebtTotal'),
        cash: num('cash', 'cashAndCashEquivalents', 'cashAndShortTermInvestments'),
        equity: num('totalStockholdersEquity', 'totalShareholderEquity', 'stockholdersEquity'),
        operatingCashFlow: ocf,
        capex,
        freeCashFlow: num('freeCashFlow') || (ocf - capex),
      };
    })
    .sort((a, b) => a.year - b.year)
    .slice(-3);
}

export function projectForward(baseRevenue: number, a: Assumptions): Projection[] {
  const startYear = new Date().getFullYear() + 1;
  const out: Projection[] = [];
  let rev = baseRevenue;
  for (let i = 0; i < 5; i++) {
    rev *= 1 + (a.growthRates[i] ?? 0);
    out.push({ year: startYear + i, revenue: rev, freeCashFlow: rev * a.fcfMargin });
  }
  return out;
}

// Enterprise value of the 5y projection + Gordon terminal value at rate r.
function presentValue(projections: Projection[], terminalGrowth: number, r: number): number {
  let pv = 0;
  projections.forEach((p, i) => {
    pv += p.freeCashFlow / Math.pow(1 + r, i + 1);
  });
  const last = projections[projections.length - 1];
  if (last && r > terminalGrowth) {
    const terminal = (last.freeCashFlow * (1 + terminalGrowth)) / (r - terminalGrowth);
    pv += terminal / Math.pow(1 + r, projections.length);
  }
  return pv;
}

// ── Reverse DCF Solver ──
// Finds the discount rate r where PV(projected FCFs + terminal) equals the
// current market cap: the return the market is implicitly pricing in.
// Monotonic in r, so bisection converges reliably.
export function solveImpliedReturn(
  marketCap: number,
  projections: Projection[],
  terminalGrowth: number,
): number | null {
  if (!marketCap || marketCap <= 0 || projections.length === 0) return null;
  if (projections.every(p => p.freeCashFlow <= 0)) return null;

  let lo = Math.max(terminalGrowth + 0.0005, 0.0005);
  let hi = 1.5; // 150% — beyond any sane implied return
  const pvAt = (r: number) => presentValue(projections, terminalGrowth, r);

  // PV(lo) must exceed marketCap and PV(hi) fall below it to bracket a root.
  if (pvAt(lo) < marketCap) return lo;   // even near-zero discounting can't reach the cap → implied ≈ floor
  if (pvAt(hi) > marketCap) return hi;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (pvAt(mid) > marketCap) lo = mid; else hi = mid;
    if (hi - lo < 1e-6) break;
  }
  return (lo + hi) / 2;
}

export function intrinsicValue(projections: Projection[], terminalGrowth: number, discountRate: number): number {
  return presentValue(projections, terminalGrowth, discountRate);
}

// Default assumptions seeded from history: trailing revenue CAGR decayed
// toward terminal growth, trailing FCF margin, 2.5% perpetuity.
export function defaultAssumptions(history: StatementYear[]): Assumptions {
  const latest = history[history.length - 1];
  const first = history[0];
  let cagr = 0.08;
  if (latest && first && first.revenue > 0 && history.length > 1) {
    cagr = Math.pow(latest.revenue / first.revenue, 1 / (history.length - 1)) - 1;
    cagr = Math.max(-0.2, Math.min(0.6, cagr));
  }
  const margin = latest && latest.revenue > 0
    ? Math.max(0.02, Math.min(0.5, latest.freeCashFlow / latest.revenue))
    : 0.15;
  const decay = (y: number) => cagr + (0.025 - cagr) * (y / 6);
  return {
    growthRates: [0, 1, 2, 3, 4].map(decay).map(g => Math.round(g * 1000) / 1000),
    fcfMargin: Math.round(margin * 1000) / 1000,
    terminalGrowth: 0.025,
  };
}
