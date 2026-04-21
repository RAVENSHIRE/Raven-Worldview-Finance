export type StockNode = {
  ticker: string;
  name: string;
  country: string;
  iso_code: string;
  lat: number;
  lon: number;
  exchange: string;
  sector: string;
  themes: string[];
  marketCap: number;
  price: number;
  change1d: number;
  change5d: number;
  volume: number;
  avg30dVolume: number;
  revenueCagr5y?: number;
  riskScore?: number;
  trumpBeta?: number;
  lastUpdated: string;
  isStale?: boolean;
  // Persona Specifics
  ipoStatus?: 'pre' | 'imminent' | 'public' | 'na';
  aiStrength?: number; // 0-10
  macroBeta?: number; // Correlation to global macro shifts
  momentumSignal?: 'accumulation' | 'breakout' | 'distribution' | 'neutral';
};

export type EventSeverity = 'info' | 'success' | 'warn' | 'danger';

export type FinanceEvent = {
  type: 'AIS_ALERT' | 'AERO_ALERT' | 'CRYPTO_NODE' | 'MARKET_CATALYST' | 'SYSTEM' | 'MACRO_PULSE' | 'GEOPOLITICAL';
  label: string;
  lat?: number;
  lon?: number;
  severity: EventSeverity;
  symbol?: string;
  timestamp: string;
  source?: 'BLOOMBERG' | 'IMF' | 'ROUTERS' | 'GEO_INT';
};

export type SwarmMessage = {
  type: 'AGENT_TALK';
  agentName: string;
  content: string;
  timestamp: string;
  severity: EventSeverity;
};

export type MarketQuote = {
  price: number | null;
  change1d: number | null;
  volume: number | null;
  marketCap: number | null;
  lastUpdated: string;
};

export type AISNode = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: string;
  type: 'tanker' | 'container' | 'cargo';
  dest: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'swarm';
  agentName?: string;
  content: string;
  timestamp: string;
};

export type AgentStatus = 'idle' | 'scanning' | 'analyzing' | 'alerting';

export type AgentInstance = {
  id: string;
  name: string;
  persona: string;
  status: AgentStatus;
  focus: string[];
};

export type BacktestResult = {
  symbol: string;
  period: string;
  return: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: number;
};

export type SatelliteNode = {
  id: string;
  name: string;
  operator: string;
  lat: number;
  lon: number;
  orbitType: string;
};
