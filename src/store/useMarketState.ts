import { create } from 'zustand';
import { StockNode, FinanceEvent, MarketQuote, SwarmMessage } from '../types';

interface MarketState {
  liveQuotes: Record<string, MarketQuote>;
  selectedStock: StockNode | null;
  events: FinanceEvent[];
  swarmMessages: SwarmMessage[];
  isRefreshing: boolean;
  syncError: { code: string; message: string } | null;
  connectionStatus: 'connecting' | 'live' | 'reconnecting' | 'offline';
  
  // Actions
  setLiveQuotes: (quotes: Record<string, MarketQuote>) => void;
  setSelectedStock: (stock: StockNode | null) => void;
  addEvent: (event: FinanceEvent) => void;
  addSwarmMessage: (msg: SwarmMessage) => void;
  setIsRefreshing: (val: boolean) => void;
  setSyncError: (error: { code: string; message: string } | null) => void;
  setConnectionStatus: (status: MarketState['connectionStatus']) => void;
}

export const useMarketState = create<MarketState>((set) => ({
  liveQuotes: {},
  selectedStock: null,
  events: [],
  swarmMessages: [],
  isRefreshing: false,
  syncError: null,
  connectionStatus: 'connecting',

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
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
