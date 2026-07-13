// Exchange coordinates for the primary-listing capital-flow arc
// (Exchange node ──► Corporate HQ node). Stock lat/lon is treated as HQ.
export const EXCHANGE_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  'NYSE':               { lat: 40.7069, lon: -74.0113, label: 'New York Stock Exchange' },
  'NASDAQ':             { lat: 40.7580, lon: -73.9855, label: 'NASDAQ MarketSite' },
  'NMS':                { lat: 40.7580, lon: -73.9855, label: 'NASDAQ MarketSite' },
  'NYQ':                { lat: 40.7069, lon: -74.0113, label: 'New York Stock Exchange' },
  'Euronext Amsterdam': { lat: 52.3676, lon: 4.9041,  label: 'Euronext Amsterdam' },
  'AMS':                { lat: 52.3676, lon: 4.9041,  label: 'Euronext Amsterdam' },
  'SIX Swiss':          { lat: 47.3769, lon: 8.5417,  label: 'SIX Swiss Exchange' },
  'EBS':                { lat: 47.3769, lon: 8.5417,  label: 'SIX Swiss Exchange' },
  'Bolsa de Madrid':    { lat: 40.4168, lon: -3.7038, label: 'Madrid Stock Exchange (XMAD)' },
  'MCE':                { lat: 40.4168, lon: -3.7038, label: 'Madrid Stock Exchange (XMAD)' },
  'LSE':                { lat: 51.5155, lon: -0.0922, label: 'London Stock Exchange' },
  'ASX':                { lat: -33.8688, lon: 151.2093, label: 'Australian Securities Exchange' },
  'TYO':                { lat: 35.6828, lon: 139.7745, label: 'Tokyo Stock Exchange' },
  'HKG':                { lat: 22.2793, lon: 114.1628, label: 'Hong Kong Exchange' },
};

export function exchangeCoords(exchange?: string) {
  if (!exchange) return null;
  if (EXCHANGE_COORDS[exchange]) return EXCHANGE_COORDS[exchange];
  // Loose match: "PRIVATE (NASDAQ EXPECTED)" → NASDAQ
  const key = Object.keys(EXCHANGE_COORDS).find(k => exchange.toUpperCase().includes(k.toUpperCase()));
  return key ? EXCHANGE_COORDS[key] : null;
}

// Deterministic pseudo 30-day price path seeded by ticker; used as sparkline
// fallback until real history hydrates. Trend follows actual 1d change sign.
export function syntheticSparkline(ticker: string, change1d: number, points = 30): number[] {
  let h = 2166136261;
  for (const c of ticker) h = (h ^ c.charCodeAt(0)) * 16777619 >>> 0;
  const out: number[] = [];
  let v = 100;
  const drift = (change1d >= 0 ? 1 : -1) * 0.15;
  for (let i = 0; i < points; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    v += drift + ((h % 1000) / 1000 - 0.5) * 2.2;
    out.push(v);
  }
  return out;
}
