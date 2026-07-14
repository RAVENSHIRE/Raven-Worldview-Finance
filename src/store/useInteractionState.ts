import { create } from 'zustand';
import { IntelReport, MacroOutlook } from '../types';

// Global interaction slice syncing the globe, tooltips, tables and command
// line. Kept minimal and flat so updates don't cascade hard re-renders:
// components subscribe to individual fields via selector functions.

export type AppPage = 'globe' | 'pipeline' | 'intel';

export type LayerToggles = {
  livePortfolio: boolean;
  topMovers: boolean;
  supplyChain: boolean;
};

type InteractionState = {
  page: AppPage;
  setPage: (page: AppPage) => void;

  // Cursor-hover on a globe node (drives the glassmorphic tooltip)
  hoveredTicker: string | null;
  hoverScreenPos: { x: number; y: number } | null;
  setHovered: (ticker: string | null, pos?: { x: number; y: number } | null) => void;

  // Focused asset: set by clicking a node or a "> LOAD PLTR" command.
  // Centers the camera, fires the listing-link arc, highlights the pipeline card.
  focusedTicker: string | null;
  focusTicker: (ticker: string | null) => void;

  layers: LayerToggles;
  toggleLayerKey: (key: keyof LayerToggles) => void;

  // Intel reports cache keyed by ticker (supply chain web + tooltip narrative)
  intel: Record<string, IntelReport>;
  setIntel: (report: IntelReport) => void;

  // Daily macro outlook — a risk-off regime re-themes the dashboard amber.
  macro: MacroOutlook | null;
  setMacro: (outlook: MacroOutlook) => void;

  // Modularity grid: floating split-screen workspace panes spun out from a
  // pipeline asset or globe node (inline TradingView chart / YouTube analysis).
  panes: WorkPane[];
  addPane: (kind: WorkPane['kind'], ticker: string) => void;
  removePane: (id: string) => void;
};

export type WorkPane = { id: string; kind: 'chart' | 'video'; ticker: string };

export const useInteractionState = create<InteractionState>((set) => ({
  page: 'globe',
  setPage: (page) => set({ page }),

  hoveredTicker: null,
  hoverScreenPos: null,
  setHovered: (ticker, pos = null) =>
    set({ hoveredTicker: ticker, hoverScreenPos: ticker ? pos : null }),

  focusedTicker: null,
  focusTicker: (ticker) => set({ focusedTicker: ticker }),

  layers: { livePortfolio: true, topMovers: true, supplyChain: false },
  toggleLayerKey: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

  intel: {},
  setIntel: (report) =>
    set((s) => ({ intel: { ...s.intel, [report.ticker]: report } })),

  macro: null,
  setMacro: (outlook) => set({ macro: outlook }),

  panes: [],
  addPane: (kind, ticker) =>
    set((s) => {
      // Dedup one pane per (kind, ticker); cap the split grid at 4 panes.
      if (s.panes.some(p => p.kind === kind && p.ticker === ticker)) return s;
      const next = [...s.panes, { id: `${kind}-${ticker}-${Date.now()}`, kind, ticker }];
      return { panes: next.slice(-4) };
    }),
  removePane: (id) => set((s) => ({ panes: s.panes.filter(p => p.id !== id) })),
}));
