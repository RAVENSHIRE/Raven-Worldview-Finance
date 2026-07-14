// Zurich Time Cron Engine — dual-market snapshot filters on Swiss local time:
//   09:00 CET → Swiss SIX opening anomalies
//   15:30 CET → US NYSE/NASDAQ market-open movements
// Each run summarizes the strategy parameters applied and the flagged ticker
// outputs into a dense, ultra-compact text block pushed through the screening
// report stream. Vocabulary is locked to the compliance matrix: assets are
// classified EXPANSION / CONTRACTION, never given directives.

export interface ZurichSnapshotDeps {
  yahooFinance: any;
  publishReport: (report: { id: string; text: string; source?: string; capturedAt: string }) => Promise<void>;
  log?: (msg: string) => void;
}

const SIX_UNIVERSE = [
  'NESN.SW', 'NOVN.SW', 'ROG.SW', 'UBSG.SW', 'ZURN.SW', 'ABBN.SW',
  'SIKA.SW', 'LONN.SW', 'CFR.SW', 'HOLN.SW', 'GIVN.SW', 'ALC.SW',
];

const US_UNIVERSE = [
  'NVDA', 'PLTR', 'TSLA', 'AMD', 'MSFT', 'META', 'COIN', 'MSTR', 'SMCI',
  'AVGO', 'IONQ', 'RKLB', 'LMT', 'NOC', 'CEG', 'VST', 'OKLO', 'SMR',
];

// Wall-clock "now" in Europe/Zurich (DST-aware via Intl).
function zurichNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Zurich' }));
}

function msUntilZurich(hour: number, minute: number): number {
  const zNow = zurichNow();
  const target = new Date(zNow);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= zNow.getTime()) target.setDate(target.getDate() + 1);
  return Math.max(30_000, target.getTime() - zNow.getTime());
}

type Flagged = { ticker: string; change: number; price: number };

async function scanUniverse(yahooFinance: any, universe: string[], minAbsChange: number): Promise<Flagged[]> {
  const flagged: Flagged[] = [];
  const results = await Promise.allSettled(universe.map(t => yahooFinance.quote(t)));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled' || !r.value) continue;
    const q: any = r.value;
    const change = Number(q.regularMarketChangePercent ?? 0);
    if (Math.abs(change) >= minAbsChange) {
      flagged.push({ ticker: universe[i], change, price: Number(q.regularMarketPrice ?? 0) });
    }
  }
  return flagged.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

function compactBlock(label: string, universeTag: string, minAbs: number, flagged: Flagged[]): string {
  const stamp = zurichNow().toISOString().slice(0, 16).replace('T', ' ');
  const expansion = flagged.filter(f => f.change > 0).length;
  const contraction = flagged.length - expansion;
  const lines = flagged.length
    ? flagged.map(f =>
        `${f.ticker.replace('.SW', '')} ${f.change >= 0 ? '+' : ''}${f.change.toFixed(1)}% $${f.price.toFixed(2)} [${f.change >= 0 ? 'EXPANSION' : 'CONTRACTION'}]`
      ).join(' | ')
    : 'NO_ANOMALIES_FLAGGED';
  return [
    `[ZRH_SNAPSHOT ${stamp} CET | ${label}]`,
    `PARAMS: |Δ1D| ≥ ${minAbs.toFixed(1)}% · universe=${universeTag} · classification=EXPANSION/CONTRACTION`,
    `FLAGGED(${flagged.length}): ${lines}`,
    `STATE_TALLY: ${expansion} EXPANSION / ${contraction} CONTRACTION`,
  ].join('\n');
}

export function createZurichSnapshotWorker(deps: ZurichSnapshotDeps) {
  const log = deps.log ?? ((m: string) => console.log(`[ZRH_CRON] ${m}`));
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;

  async function runSnapshot(kind: 'six-open' | 'us-open'): Promise<string> {
    const [label, universe, tag, minAbs] =
      kind === 'six-open'
        ? ['SIX_OPEN_ANOMALY_FILTER', SIX_UNIVERSE, `SIX${SIX_UNIVERSE.length}`, 2.0] as const
        : ['US_OPEN_MOVER_FILTER', US_UNIVERSE, `US${US_UNIVERSE.length}`, 2.5] as const;

    const flagged = await scanUniverse(deps.yahooFinance, [...universe], minAbs);
    const text = compactBlock(label, tag, minAbs, flagged);
    await deps.publishReport({
      id: crypto.randomUUID(),
      text,
      source: `zurich-cron/${kind}`,
      capturedAt: new Date().toISOString(),
    });
    log(`${kind} snapshot published (${flagged.length} flagged)`);
    return text;
  }

  function schedule(kind: 'six-open' | 'us-open', hour: number, minute: number) {
    if (stopped) return;
    const delay = msUntilZurich(hour, minute);
    log(`${kind} armed in ${(delay / 60000).toFixed(1)}m (${hour}:${String(minute).padStart(2, '0')} Zurich)`);
    timers.push(setTimeout(async () => {
      try { await runSnapshot(kind); }
      catch (err: any) { log(`${kind} failed: ${err?.message ?? err}`); }
      schedule(kind, hour, minute);
    }, delay));
  }

  return {
    start() {
      schedule('six-open', 9, 0);
      schedule('us-open', 15, 30);
    },
    stop() {
      stopped = true;
      for (const t of timers) clearTimeout(t);
    },
    runSnapshot, // manual trigger (exposed via /api/snapshot/run)
  };
}
