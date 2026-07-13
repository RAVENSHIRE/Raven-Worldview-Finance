// ─── ANALYST AI · DAILY MACRO SYNC ────────────────────────────────────────────
// Replaces the manual "Current Global Stock Environment" Excel drop-downs:
// a daily LLM pass extracts US GDP growth, unemployment trajectory and a
// Risk-On/Risk-Off rating. A Risk-Off flip re-themes the dashboard amber and
// posts an analyst note into the chat stream naming the vulnerable exposure.

import crypto from 'crypto';

export type MacroOutlook = {
  gdpGrowthYoY: number | null;           // %, e.g. 2.4
  unemploymentTrend: 'rising' | 'falling' | 'stable' | 'unknown';
  environment: 'risk-on' | 'risk-off' | 'neutral';
  redFlags: string[];                    // e.g. ["yield curve inversion"]
  summary: string;                       // 2-3 sentence analyst framing
  vulnerableSectors: string[];           // sectors most exposed to the regime
  generatedAt: string;
  source: 'perplexity' | 'fallback-llm' | 'stub';
};

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MACRO_KEY = 'macro:latest';

const MACRO_PROMPT = `Analyze current global macroeconomic drivers as of today. Respond with ONLY a JSON object (no markdown fences) with exactly these keys:
{
  "gdpGrowthYoY": <latest US real GDP growth YoY in percent, number>,
  "unemploymentTrend": "<rising | falling | stable>",
  "environment": "<risk-on | risk-off | neutral>",
  "redFlags": ["<major macro red flags: yield curve inversion, credit spreads widening, unemployment spike, etc. Empty array if none>"],
  "summary": "<2-3 sentences: why the environment rating, what changed>",
  "vulnerableSectors": ["<up to 3 equity sectors most vulnerable right now>"]
}`;

function parseMacro(text: string): Omit<MacroOutlook, 'generatedAt' | 'source'> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    const env = ['risk-on', 'risk-off', 'neutral'].includes(obj.environment) ? obj.environment : 'neutral';
    const trend = ['rising', 'falling', 'stable'].includes(obj.unemploymentTrend) ? obj.unemploymentTrend : 'unknown';
    return {
      gdpGrowthYoY: Number.isFinite(Number(obj.gdpGrowthYoY)) ? Number(obj.gdpGrowthYoY) : null,
      unemploymentTrend: trend,
      environment: env,
      redFlags: Array.isArray(obj.redFlags) ? obj.redFlags.slice(0, 6).map((f: any) => String(f).slice(0, 160)) : [],
      summary: String(obj.summary || '').slice(0, 1200),
      vulnerableSectors: Array.isArray(obj.vulnerableSectors) ? obj.vulnerableSectors.slice(0, 3).map((s: any) => String(s).slice(0, 60)) : [],
    };
  } catch {
    return null;
  }
}

async function queryMacro(): Promise<MacroOutlook> {
  if (PERPLEXITY_API_KEY) {
    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(25_000),
        headers: { 'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [{ role: 'user', content: MACRO_PROMPT }],
          temperature: 0.1,
        }),
      });
      if (res.ok) {
        const raw = await res.json();
        const parsed = parseMacro(raw?.choices?.[0]?.message?.content ?? '');
        if (parsed) return { ...parsed, generatedAt: new Date().toISOString(), source: 'perplexity' };
      }
    } catch (err: any) {
      console.warn('[MACRO] Perplexity failed, trying fallback:', err?.message ?? err);
    }
  }

  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: MACRO_PROMPT }] }],
            generationConfig: { temperature: 0.1 },
          }),
        }
      );
      if (res.ok) {
        const raw = await res.json();
        const parsed = parseMacro(raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
        if (parsed) return { ...parsed, generatedAt: new Date().toISOString(), source: 'fallback-llm' };
      }
    } catch (err: any) {
      console.warn('[MACRO] Fallback LLM failed:', err?.message ?? err);
    }
  }

  return {
    gdpGrowthYoY: null,
    unemploymentTrend: 'unknown',
    environment: 'neutral',
    redFlags: [],
    summary: 'No macro provider configured or reachable; environment defaults to neutral.',
    vulnerableSectors: [],
    generatedAt: new Date().toISOString(),
    source: 'stub',
  };
}

export function createMacroWorker(deps: { redis: any; broadcast: (payload: object) => void }) {
  let latest: MacroOutlook | null = null;

  async function get(): Promise<MacroOutlook | null> {
    if (latest) return latest;
    try {
      const raw = await deps.redis.get(MACRO_KEY);
      if (raw) latest = JSON.parse(raw);
    } catch { /* redis down */ }
    return latest;
  }

  async function run(): Promise<MacroOutlook> {
    const previous = await get();
    const outlook = await queryMacro();
    latest = outlook;
    try {
      await deps.redis.set(MACRO_KEY, JSON.stringify(outlook));
    } catch { /* redis down — memory holds it */ }

    deps.broadcast({ type: 'MACRO_UPDATE', payload: outlook });

    // Analyst note into the chat stream when the regime shifts (or on any
    // red-flagged Risk-Off day) so the user sees *why* the theme changed.
    const shifted = previous?.environment !== outlook.environment;
    if ((shifted || outlook.redFlags.length > 0) && outlook.source !== 'stub') {
      const exposure = outlook.vulnerableSectors.length
        ? ` Most vulnerable exposure: ${outlook.vulnerableSectors.join(', ')}.`
        : '';
      deps.broadcast({
        type: 'AGENT_TALK',
        id: crypto.randomUUID(),
        role: 'swarm',
        agentName: 'MACRO_ANALYST',
        content: `ENVIRONMENT ${outlook.environment.toUpperCase()}${outlook.redFlags.length ? ` · RED FLAGS: ${outlook.redFlags.join('; ')}` : ''} — ${outlook.summary}${exposure}`,
        timestamp: new Date().toISOString(),
      });
    }
    console.log(`[MACRO] Outlook ${outlook.environment} (${outlook.source})`);
    return outlook;
  }

  // Daily at 11:30 UTC (pre-US-open) plus a warm-up pass shortly after boot
  // when no cached outlook exists yet.
  function startScheduler() {
    let lastRunDate = '';
    setInterval(() => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (now.getUTCHours() === 11 && now.getUTCMinutes() === 30 && lastRunDate !== today) {
        lastRunDate = today;
        run().catch(err => console.error('[MACRO] Daily run failed:', err?.message ?? err));
      }
    }, 60_000);

    setTimeout(async () => {
      if (!(await get())) {
        run().catch(err => console.warn('[MACRO] Warm-up run failed:', err?.message ?? err));
      }
    }, 10_000);

    console.log('[MACRO] Scheduler armed (daily @ 11:30 UTC)');
  }

  return { get, run, startScheduler };
}
