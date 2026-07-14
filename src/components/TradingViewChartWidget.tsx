// Free-tier TradingView Advanced Chart Widget embedded via the public
// widgetembed iframe. High-contrast dark configuration is baked in so charts
// initialize natively in Bloomberg Night Mode inside any dashboard cell.

interface TradingViewChartWidgetProps {
  ticker: string;
  interval?: string; // 'D' daily, '60' hourly…
}

// Crude symbol mapper: crypto pairs route to a crypto feed, Swiss tickers to
// SIX; everything else is left for TradingView's own resolver.
function toTvSymbol(ticker: string): string {
  const t = ticker.toUpperCase();
  if (t.endsWith('-USD')) return `CRYPTO:${t.replace('-USD', '')}USD`;
  if (t.endsWith('.SW')) return `SIX:${t.replace('.SW', '')}`;
  if (t.endsWith('.MC')) return `BME:${t.replace('.MC', '')}`;
  return t;
}

export default function TradingViewChartWidget({ ticker, interval = 'D' }: TradingViewChartWidgetProps) {
  const params = new URLSearchParams({
    symbol: toTvSymbol(ticker),
    interval,
    theme: 'dark',
    style: '1',
    timezone: 'Europe/Zurich',
    locale: 'en',
    backgroundColor: '#05070a',
    gridColor: 'rgba(28, 35, 48, 0.5)',
    hide_top_toolbar: '0',
    hide_legend: '0',
    allow_symbol_change: '1',
    save_image: '0',
    withdateranges: '1',
  });

  return (
    <iframe
      key={ticker}
      title={`TradingView ${ticker}`}
      src={`https://www.tradingview.com/widgetembed/?${params.toString()}`}
      className="w-full h-full border-0 bg-terminal-bg"
      allowFullScreen
    />
  );
}
