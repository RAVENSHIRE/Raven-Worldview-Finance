import { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { Youtube, CandlestickChart, Twitter, Plus, Trash2, BrainCircuit, CheckCheck, Loader2 } from 'lucide-react';

// RESEARCH page — News Intelligence Interface.
// Account-connection dashboard for preferred alpha creators (YouTube /
// TradingView / Twitter-X handles) persisted in the backend key-value layer,
// plus the extraction feed produced by services/mediaTranscriptionEngine.ts
// and the interactive backcheck audit console: corrections written here are
// recursively piped into the engine's extraction prompt context.

type Platform = 'youtube' | 'tradingview' | 'twitter';

interface Creator {
  id: string;
  platform: Platform;
  handle: string;
  addedAt: string;
  lastPolledAt?: string;
}

interface Extraction {
  id: string;
  platform: Platform;
  handle: string;
  title: string;
  url: string;
  publishedAt: string;
  transcriptStatus: string;
  slideStatus: string;
  slides: { timestamp: string; imageUrl: string; caption?: string }[];
  thesis: string | null;
  audits: { note: string; at: string }[];
}

const PLATFORM_META: Record<Platform, { label: string; icon: typeof Youtube; hint: string }> = {
  youtube: { label: 'YOUTUBE', icon: Youtube, hint: 'channel id (UC…) for auto-poll, or @handle' },
  tradingview: { label: 'TRADINGVIEW', icon: CandlestickChart, hint: 'profile username' },
  twitter: { label: 'TWITTER / X', icon: Twitter, hint: '@handle' },
};

export default function ResearchHub() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [auditDrafts, setAuditDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const [cRes, eRes] = await Promise.all([
        fetch(new URL('/api/research/creators', window.location.origin).toString()),
        fetch(new URL('/api/research/extractions?limit=40', window.location.origin).toString()),
      ]);
      if (cRes.ok) setCreators(await cRes.json());
      if (eRes.ok) setExtractions(await eRes.json());
    } catch { /* offline-tolerant */ }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const addCreator = async () => {
    if (!handle.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(new URL('/api/research/creators', window.location.origin).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, handle: handle.trim() }),
      });
      if (res.ok) {
        setHandle('');
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const removeCreator = async (id: string) => {
    await fetch(new URL(`/api/research/creators/${id}`, window.location.origin).toString(), { method: 'DELETE' });
    await refresh();
  };

  const submitAudit = async (id: string) => {
    const note = auditDrafts[id]?.trim();
    if (!note) return;
    const res = await fetch(new URL(`/api/research/extractions/${id}/audit`, window.location.origin).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    if (res.ok) {
      setAuditDrafts(d => ({ ...d, [id]: '' }));
      await refresh();
    }
  };

  return (
    <div className="h-full grid grid-cols-[360px_1fr] bg-terminal-bg">
      {/* Creator connection dashboard */}
      <aside className="border-r border-terminal-line bg-terminal-panel flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-terminal-line">
          <span className="text-[9px] font-black uppercase tracking-widest text-terminal-cyan">ALPHA_CREATOR_UPLINK</span>
        </div>

        <div className="p-3 border-b border-terminal-line/60 space-y-2">
          <div className="flex gap-1">
            {(Object.keys(PLATFORM_META) as Platform[]).map(p => {
              const Icon = PLATFORM_META[p].icon;
              return (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-sm border text-[7px] font-black uppercase tracking-widest transition-all",
                    platform === p
                      ? "border-terminal-cyan/60 text-terminal-cyan bg-terminal-cyan/10"
                      : "border-terminal-line text-zinc-600 hover:text-white"
                  )}
                >
                  <Icon size={10} /> {PLATFORM_META[p].label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5">
            <input
              value={handle}
              onChange={e => setHandle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCreator()}
              placeholder={PLATFORM_META[platform].hint}
              className="flex-1 min-w-0 terminal-input text-[10px]"
            />
            <button
              onClick={addCreator}
              disabled={busy || !handle.trim()}
              className="px-2.5 rounded-sm border border-terminal-green/50 text-terminal-green hover:bg-terminal-green/10 disabled:opacity-30 transition-all"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {creators.length === 0 && (
            <div className="text-[8px] uppercase tracking-widest text-zinc-700 italic p-2">
              No creators tracked. Connect a handle to arm the extraction worker.
            </div>
          )}
          {creators.map(c => {
            const Icon = PLATFORM_META[c.platform].icon;
            return (
              <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm border border-terminal-line bg-black/30 group">
                <Icon size={11} className="text-terminal-cyan shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-white truncate">{c.handle}</div>
                  <div className="text-[7px] uppercase tracking-widest text-zinc-600">
                    {c.lastPolledAt ? `POLLED ${new Date(c.lastPolledAt).toLocaleTimeString([], { hour12: false })}` : 'AWAITING_FIRST_POLL'}
                  </div>
                </div>
                <button
                  onClick={() => removeCreator(c.id)}
                  className="ml-auto text-zinc-700 hover:text-terminal-red opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-terminal-line text-[7px] uppercase tracking-widest text-zinc-600 leading-relaxed">
          Audit notes below are recursively piped into the extraction prompt
          context — every correction tunes future runs.
        </div>
      </aside>

      {/* Extraction feed + backcheck audit console */}
      <main className="overflow-y-auto p-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <BrainCircuit size={12} className="text-terminal-gold" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white">EXTRACTION_FEED &amp; BACKCHECK_CONSOLE</span>
        </div>

        {extractions.length === 0 && (
          <div className="text-[8px] uppercase tracking-widest text-zinc-700 italic border border-dashed border-terminal-line rounded-sm p-6 text-center">
            No extractions yet. YouTube channel-id creators auto-poll every 30m;
            other platforms activate once a scraper adapter is configured.
          </div>
        )}

        {extractions.map(e => (
          <div key={e.id} className="rounded-sm border border-terminal-line bg-terminal-panel/60 p-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[8px] font-black uppercase tracking-widest text-terminal-cyan">{e.platform}/{e.handle}</span>
              <a href={e.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-white hover:text-terminal-cyan transition-colors">
                {e.title}
              </a>
              <span className="ml-auto text-[7px] text-zinc-600 uppercase tracking-widest">
                {new Date(e.publishedAt).toISOString().slice(0, 10)}
              </span>
            </div>

            <div className="mt-1.5 flex gap-2 text-[7px] uppercase tracking-widest">
              <span className={cn("px-1.5 py-0.5 rounded-sm border",
                e.transcriptStatus === 'transcribed' ? "text-terminal-green border-terminal-green/40" : "text-zinc-500 border-terminal-line")}>
                AUDIO: {e.transcriptStatus}
              </span>
              <span className={cn("px-1.5 py-0.5 rounded-sm border",
                e.slideStatus === 'extracted' ? "text-terminal-green border-terminal-green/40" : "text-zinc-500 border-terminal-line")}>
                SLIDES: {e.slideStatus}{e.slides.length > 0 ? ` (${e.slides.length})` : ''}
              </span>
            </div>

            {e.slides.length > 0 && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto">
                {e.slides.map((s, i) => (
                  <a key={i} href={s.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={s.imageUrl} alt={s.caption ?? s.timestamp} className="h-16 rounded-sm border border-terminal-line" />
                    <div className="text-[6px] text-zinc-600 text-center">{s.timestamp}</div>
                  </a>
                ))}
              </div>
            )}

            <div className="mt-2 text-[10px] leading-relaxed text-zinc-300 border-l-2 border-terminal-gold/60 pl-2">
              <span className="text-[7px] uppercase tracking-widest text-zinc-600 block">Core_Thesis_Extraction</span>
              {e.thesis ?? <span className="italic text-zinc-600">PENDING — awaiting LLM distillation (set GEMINI_API_KEY)</span>}
            </div>

            {e.audits.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {e.audits.map((a, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[9px] text-terminal-green/80">
                    <CheckCheck size={10} className="shrink-0 mt-0.5" />
                    <span>{a.note}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 flex gap-1.5">
              <input
                value={auditDrafts[e.id] ?? ''}
                onChange={ev => setAuditDrafts(d => ({ ...d, [e.id]: ev.target.value }))}
                onKeyDown={ev => ev.key === 'Enter' && submitAudit(e.id)}
                placeholder="BACKCHECK: correct or refine this extraction…"
                className="flex-1 min-w-0 terminal-input text-[9px] py-1"
              />
              <button
                onClick={() => submitAudit(e.id)}
                className="px-2 rounded-sm border border-terminal-cyan/50 text-terminal-cyan text-[8px] font-black uppercase tracking-widest hover:bg-terminal-cyan/10 transition-all"
              >
                AUDIT
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
