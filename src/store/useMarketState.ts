import { create } from 'zustand';
import { StockNode, FinanceEvent } from '../types';

interface MarketState {
  liveQuotes: Record<string, any>;
  selectedStock: StockNode | null;
  events: FinanceEvent[];
  swarmMessages: any[];
  isRefreshing: boolean;
  syncError: { code: string; message: string } | null;
  
  // Actions
  setLiveQuotes: (quotes: Record<string, any>) => void;
  setSelectedStock: (stock: StockNode | null) => void;
  addEvent: (event: FinanceEvent) => void;
  addSwarmMessage: (msg: any) => void;
  setIsRefreshing: (val: boolean) => void;
  setSyncError: (error: { code: string; message: string } | null) => void;
}

export const useMarketState = create<MarketState>((set) => ({
  liveQuotes: {},
  selectedStock: null,
  events: [],
  swarmMessages: [],
  isRefreshing: false,
  syncError: null,

  setLiveQuotes: (quotes) => set((state) => ({ 
    liveQuotes: { ...state.liveQuotes, ...quotes } 
  })),
  setSelectedStock: (stock) => set({ selectedStock: stock }),
  addEvent: (event) => set((state) => ({ 
    events: [event, ...state.events].slice(0, 50) 
  })),
  addSwarmMessage: (msg) => set((state) => ({ 
    swarmMessages: [msg, ...state.swarmMessages].slice(0, 10) 
  })),
  setIsRefreshing: (val) => set({ isRefreshing: val }),
  setSyncError: (error) => set({ syncError: error }),
}));
