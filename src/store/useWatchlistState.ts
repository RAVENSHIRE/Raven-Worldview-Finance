import { create } from 'zustand';
import { WatchlistNode } from '../types';

interface WatchlistState {
  nodes: WatchlistNode[];

  // Actions
  setNodes: (nodes: WatchlistNode[]) => void;
  addNode: (node: WatchlistNode) => void;
  removeNode: (ticker: string) => void;
}

export const useWatchlistState = create<WatchlistState>((set) => ({
  nodes: [],

  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({
    nodes: [...state.nodes.filter(n => n.ticker !== node.ticker), node],
  })),
  removeNode: (ticker) => set((state) => ({
    nodes: state.nodes.filter(n => n.ticker !== ticker),
  })),
}));
