import { useEffect, useState } from 'react';
import { useScreenState } from '../../store/useScreenState';
import { ScreenReport } from '../../types';
import { cn } from '../../lib/utils';
import { TerminalSquare, Clock } from 'lucide-react';

// REPORTS — the SCREEN_REPORT view compressed into a singular text-based
// terminal chat panel. Every screening blob and Zurich cron snapshot renders
// as a dense monospace block in a single scrolling stream; clicking an index
// entry expands the full text inline. No cards, no charts — text density only.
export default function ReportsTerminal() {
  const { reports, activeReport, setActiveReport } = useScreenState();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fullTexts, setFullTexts] = useState<Record<string, string>>({});

  // The WS push carries full text for fresh reports; older index entries are
  // lazily hydrated on expand.
  useEffect(() => {
    if (activeReport) setFullTexts(t => ({ ...t, [activeReport.id]: activeReport.text }));
  }, [activeReport]);

  const expand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!fullTexts[id]) {
      try {
        const res = await fetch(new URL(`/api/screen/report/${id}`, window.location.origin).toString());
        if (res.ok) {
          const report: ScreenReport = await res.json();
          setFullTexts(t => ({ ...t, [id]: report.text }));
          setActiveReport(report);
        }
      } catch { /* stays collapsed-preview */ }
    }
  };

  return (
    <div className="h-full flex flex-col bg-terminal-bg font-mono">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-terminal-line bg-terminal-panel shrink-0">
        <TerminalSquare size={12} className="text-terminal-cyan" />
        <span className="text-[9px] font-black uppercase tracking-widest text-terminal-cyan">SCREEN_REPORT_TERMINAL</span>
        <span className="text-[7px] uppercase tracking-widest text-zinc-600 ml-auto">
          {reports.length} BLOCKS · ZRH CRON 09:00 / 15:30 CET
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-w-4xl w-full mx-auto">
        {reports.length === 0 && (
          <div className="text-[9px] uppercase tracking-widest text-zinc-700 italic p-6 text-center border border-dashed border-terminal-line rounded-sm">
            Stream idle. Zurich snapshot crons and screening workflows publish here.
          </div>
        )}

        {reports.map(r => {
          const isSnapshot = r.source?.startsWith('zurich-cron');
          const open = expandedId === r.id;
          const text = fullTexts[r.id];
          return (
            <div key={r.id} className="border border-terminal-line/70 rounded-sm bg-black/40">
              <button
                onClick={() => expand(r.id)}
                className="w-full text-left px-2.5 py-1.5 flex items-baseline gap-2 hover:bg-white/[0.03] transition-colors"
              >
                <span className={cn(
                  "text-[7px] font-black uppercase tracking-widest px-1 py-0.5 rounded-sm border shrink-0",
                  isSnapshot
                    ? "text-terminal-gold border-terminal-gold/40 bg-terminal-gold/5"
                    : "text-terminal-cyan border-terminal-cyan/40 bg-terminal-cyan/5"
                )}>
                  {isSnapshot ? 'ZRH_CRON' : (r.source || 'SCREEN')}
                </span>
                <span className="text-[10px] text-zinc-300 truncate flex-1">{r.preview}</span>
                <span className="text-[7px] text-zinc-600 uppercase tracking-widest shrink-0 flex items-center gap-1">
                  <Clock size={8} /> {new Date(r.capturedAt).toISOString().slice(5, 16).replace('T', ' ')}
                </span>
              </button>
              {open && (
                <pre className="px-2.5 pb-2 pt-1 text-[10px] leading-snug text-terminal-green/90 whitespace-pre-wrap border-t border-terminal-line/50 overflow-x-auto">
                  {text ?? 'HYDRATING_BLOCK…'}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
