import { create } from 'zustand';
import { ScreenReport, ScreenReportMeta } from '../types';

interface ScreenState {
  reports: ScreenReportMeta[];        // index, newest first
  activeReport: ScreenReport | null;  // full blob currently viewed

  // Actions
  setReports: (reports: ScreenReportMeta[]) => void;
  // The WS push carries the full report plus a preview line.
  addReport: (report: ScreenReport & { preview: string }) => void;
  setActiveReport: (report: ScreenReport | null) => void;
}

export const useScreenState = create<ScreenState>((set) => ({
  reports: [],
  activeReport: null,

  setReports: (reports) => set({ reports }),
  addReport: (report) => set((state) => {
    const { text, ...meta } = report;
    return {
      reports: [meta, ...state.reports.filter(r => r.id !== report.id)].slice(0, 50),
      // A freshly ingested report becomes the active view.
      activeReport: { id: report.id, text, source: report.source, filterVersionId: report.filterVersionId, capturedAt: report.capturedAt },
    };
  }),
  setActiveReport: (report) => set({ activeReport: report }),
}));
