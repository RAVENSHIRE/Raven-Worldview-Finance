import { useEffect, useRef } from 'react';
import Globe from 'globe.gl';
import { StockNode } from '../types';

interface GlobeViewportProps {
  stocks: StockNode[];
  onSelectStock: (stock: StockNode) => void;
  selectedStock?: StockNode | null;
  colorMode: 'change' | 'trump_beta';
}

export default function GlobeViewport({ stocks, onSelectStock, selectedStock, colorMode }: GlobeViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeInstance = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Use default export correctly for globe.gl
    const g = (Globe as any)()(containerRef.current)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
      .pointLat('lat')
      .pointLng('lon')
      .pointColor(d => {
        const stock = d as StockNode;
        if (colorMode === 'change') {
           return stock.change1d > 0 ? '#00FF41' : stock.change1d < 0 ? '#FF3131' : '#8E9299';
        } else {
           const beta = stock.trumpBeta || 0;
           return beta > 7 ? '#D4AF37' : '#00E0FF';
        }
      })
      .pointAltitude(0.05)
      .pointRadius(d => {
        const stock = d as StockNode;
        return Math.max(0.2, Math.log10(stock.marketCap / 1e9) * 0.5);
      })
      .pointLabel(d => {
        const stock = d as StockNode;
        return `
          <div style="background: rgba(0,0,0,0.8); padding: 8px; border: 1px solid #28282A; font-family: monospace; font-size: 10px;">
            <div style="font-weight: bold; color: #fff;">${stock.ticker} | ${stock.name}</div>
            <div style="color: ${stock.change1d >= 0 ? '#00FF41' : '#FF3131'}">
              1D: ${stock.change1d > 0 ? '+' : ''}${stock.change1d}%
            </div>
            <div style="color: #00E0FF">MCap: $${(stock.marketCap / 1e9).toFixed(1)}B</div>
          </div>
        `;
      })
      .onPointClick((d: any) => onSelectStock(d as StockNode));

    g.controls().autoRotate = true;
    g.controls().autoRotateSpeed = 0.5;

    globeInstance.current = g;

    // Responsive
    const handleResize = () => {
      if (containerRef.current) {
        g.width(containerRef.current.clientWidth);
        g.height(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      g._destructor?.();
    };
  }, []);

  // Update data when props change
  useEffect(() => {
    if (globeInstance.current) {
      globeInstance.current.pointsData(stocks);
    }
  }, [stocks]);

  // Handle selected stock focus
  useEffect(() => {
    if (globeInstance.current && selectedStock) {
      globeInstance.current.pointOfView({ 
        lat: selectedStock.lat, 
        lng: selectedStock.lon, 
        altitude: 1.5 
      }, 1000);
    }
  }, [selectedStock]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
