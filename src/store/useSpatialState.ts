import { create } from 'zustand';

interface SpatialState {
  viewMode: 'globe' | 'flat';
  activeLayers: string[];
  colorMode: 'change' | 'trump_beta';
  searchQuery: string;
  showSignals: boolean;

  // Actions
  setViewMode: (mode: 'globe' | 'flat') => void;
  toggleLayer: (layer: string) => void;
  setColorMode: (mode: 'change' | 'trump_beta') => void;
  setSearchQuery: (query: string) => void;
  setShowSignals: (val: boolean) => void;
}

export const useSpatialState = create<SpatialState>((set) => ({
  viewMode: 'globe',
  activeLayers: ['AIS Corridors', 'Aerospace Tracker', 'Crypto Nodes'],
  colorMode: 'change',
  searchQuery: '',
  showSignals: true,

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleLayer: (layer) => set((state) => ({
    activeLayers: state.activeLayers.includes(layer)
      ? state.activeLayers.filter((l) => l !== layer)
      : [...state.activeLayers, layer],
  })),
  setColorMode: (mode) => set({ colorMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setShowSignals: (val) => set({ showSignals: val }),
}));
