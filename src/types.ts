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
    lastUpdated: new Date().toISOString()
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
    lastUpdated: new Date().toISOString()
  }
];
