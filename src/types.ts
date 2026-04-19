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

export type FinanceEvent = {
  type: 'AIS_ALERT' | 'AERO_ALERT' | 'CRYPTO_NODE' | 'MARKET_CATALYST' | 'SYSTEM' | 'MACRO_PULSE' | 'GEOPOLITICAL';
  label: string;
  lat?: number;
  lon?: number;
  severity: 'info' | 'success' | 'warn' | 'danger';
  symbol?: string;
  timestamp: string;
  source?: 'BLOOMBERG' | 'IMF' | 'ROUTERS' | 'GEO_INT';
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

export const MOCK_STOCKS: StockNode[] = [
  {
    ticker: "PLTR",
    name: "Palantir Technologies",
    country: "USA",
    iso_code: "USA",
    lat: 37.7749,
    lon: -122.4194,
    exchange: "NYSE",
    sector: "Technology",
    themes: ["Enterprise AI", "Aerospace & Defense"],
    marketCap: 85000000000,
    price: 38.42,
    change1d: 2.5,
    change5d: 8.2,
    volume: 45000000,
    avg30dVolume: 32000000,
    revenueCagr5y: 28,
    riskScore: 6,
    trumpBeta: 9,
    lastUpdated: new Date().toISOString(),
    ipoStatus: 'public',
    aiStrength: 9.8,
    macroBeta: 2.1,
    momentumSignal: 'breakout'
  },
  {
    ticker: "RKLB",
    name: "Rocket Lab USA",
    country: "USA",
    iso_code: "USA",
    lat: 33.9192,
    lon: -118.0831,
    exchange: "NASDAQ",
    sector: "Industrials",
    themes: ["Aerospace & Defense"],
    marketCap: 12000000000,
    price: 24.15,
    change1d: 4.8,
    change5d: 12.1,
    volume: 15000000,
    avg30dVolume: 8000000,
    revenueCagr5y: 42,
    riskScore: 8,
    trumpBeta: 10,
    lastUpdated: new Date().toISOString()
  },
  {
    ticker: "MSTR",
    name: "MicroStrategy",
    country: "USA",
    iso_code: "USA",
    lat: 38.9072,
    lon: -77.0369,
    exchange: "NASDAQ",
    sector: "Technology",
    themes: ["Crypto Infra"],
    marketCap: 45000000000,
    price: 420.50,
    change1d: 7.2,
    change5d: 18.5,
    volume: 12000000,
    avg30dVolume: 5000000,
    revenueCagr5y: 2,
    riskScore: 9,
    trumpBeta: 10,
    lastUpdated: new Date().toISOString()
  },
  {
    ticker: "ARM",
    name: "Arm Holdings",
    country: "UK",
    iso_code: "GBR",
    lat: 52.2053,
    lon: 0.1218,
    exchange: "NASDAQ",
    sector: "Technology",
    themes: ["Enterprise AI"],
    marketCap: 140000000000,
    price: 135.20,
    change1d: -1.2,
    change5d: 3.4,
    volume: 18000000,
    avg30dVolume: 15000000,
    revenueCagr5y: 18,
    riskScore: 5,
    trumpBeta: 6,
    lastUpdated: new Date().toISOString()
  },
  {
    ticker: "ASML",
    name: "ASML Holding",
    country: "Netherlands",
    iso_code: "NLD",
    lat: 51.4416,
    lon: 5.4697,
    exchange: "Euronext Amsterdam",
    sector: "Technology",
    themes: ["Semiconductors"],
    marketCap: 320000000000,
    price: 785.40,
    change1d: -2.1,
    change5d: -4.5,
    volume: 2500000,
    avg30dVolume: 3000000,
    revenueCagr5y: 22,
    riskScore: 4,
    trumpBeta: 3,
    lastUpdated: new Date().toISOString()
  },
  {
    ticker: "COIN",
    name: "Coinbase Global",
    country: "USA",
    iso_code: "USA",
    lat: 37.7749,
    lon: -122.4194,
    exchange: "NASDAQ",
    sector: "Financial Services",
    themes: ["Crypto Infra"],
    marketCap: 55000000000,
    price: 245.10,
    change1d: 5.5,
    change5d: 15.2,
    volume: 9000000,
    avg30dVolume: 6000000,
    revenueCagr5y: 35,
    riskScore: 8,
    trumpBeta: 10,
    lastUpdated: new Date().toISOString()
  },
  {
    ticker: "SMCI",
    name: "Super Micro Computer",
    country: "USA",
    iso_code: "USA",
    lat: 37.3382,
    lon: -121.8863,
    exchange: "NASDAQ",
    sector: "Technology",
    themes: ["Enterprise AI"],
    marketCap: 48000000000,
    price: 885.20,
    change1d: -8.5,
    change5d: -15.4,
    volume: 22000000,
    avg30dVolume: 12000000,
    revenueCagr5y: 45,
    riskScore: 7,
    trumpBeta: 5,
    lastUpdated: new Date().toISOString()},
  {
    ticker: "DATABRICKS",
    name: "Databricks Inc.",
    country: "USA",
    iso_code: "US",
    lat: 37.77,
    lon: -122.41,
    exchange: "PRIVATE (NASDAQ EXPECTED)",
    sector: "AI & Data",
    themes: ["Enterprise AI", "AI Infrastructure"],
    marketCap: 43e9,
    price: 0,
    change1d: 0,
    change5d: 0,
    volume: 0,
    avg30dVolume: 0,
    revenueCagr5y: 70,
    riskScore: 4,
    trumpBeta: 3,
    lastUpdated: new Date().toISOString(),
    ipoStatus: 'pre',
    aiStrength: 9.5,
    macroBeta: 1.2,
    momentumSignal: 'accumulation'
  },
  {
    ticker: "KLARNA",
    name: "Klarna Bank AB",
    country: "Sweden",
    iso_code: "SE",
    lat: 59.33,
    lon: 18.06,
    exchange: "PRIVATE",
    sector: "Fintech",
    themes: ["Enterprise AI", "Crypto Infra"],
    marketCap: 15e9,
    price: 0,
    change1d: 0,
    change5d: 0,
    volume: 0,
    avg30dVolume: 0,
    revenueCagr5y: 25,
    riskScore: 7,
    trumpBeta: 5,
    lastUpdated: new Date().toISOString(),
    ipoStatus: 'imminent',
    aiStrength: 7.2,
    macroBeta: 1.8,
    momentumSignal: 'neutral'
  },
  {
    ticker: "NESN",
    name: "Nestle SA",
    country: "Switzerland",
    iso_code: "CH",
    lat: 46.46,
    lon: 6.84,
    exchange: "SIX Swiss",
    sector: "Consumer",
    themes: ["Energy"],
    marketCap: 280e9,
    price: 84.50,
    change1d: -0.2,
    change5d: -1.5,
    volume: 5e6,
    avg30dVolume: 4.5e6,
    revenueCagr5y: 4,
    riskScore: 2,
    trumpBeta: 1,
    lastUpdated: new Date().toISOString(),
    ipoStatus: 'public',
    aiStrength: 2.5,
    macroBeta: 0.9,
    momentumSignal: 'neutral'
  },
  {
    ticker: "UBSG",
    name: "UBS Group AG",
    country: "Switzerland",
    iso_code: "CH",
    lat: 47.37,
    lon: 8.54,
    exchange: "SIX Swiss",
    sector: "Financial",
    themes: ["Crypto Infra"],
    marketCap: 95e9,
    price: 28.15,
    change1d: 0.8,
    change5d: 2.4,
    volume: 10e6,
    avg30dVolume: 12e6,
    revenueCagr5y: 8,
    riskScore: 5,
    trumpBeta: 4,
    lastUpdated: new Date().toISOString(),
    ipoStatus: 'public',
    aiStrength: 6.5,
    macroBeta: 1.4,
    momentumSignal: 'accumulation'
  }
];
