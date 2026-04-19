import { useEffect, useRef } from 'react';
import Globe from 'globe.gl';
import { StockNode, FinanceEvent } from '../types';

interface GlobeViewportProps {
  stocks: StockNode[];
  events: FinanceEvent[];
  onSelectStock: (stock: StockNode) => void;
  selectedStock?: StockNode | null;
  colorMode: 'change' | 'trump_beta';
}

export default function GlobeViewport({ stocks, events, onSelectStock, selectedStock, colorMode }: GlobeViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeInstance = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const g = (Globe as any)()(containerRef.current)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
      .atmosphereColor('#00E0FF')
      .atmosphereAltitude(0.15)
      // Points
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
      .pointAltitude(0.02)
      .pointRadius(d => {
        const stock = d as StockNode;
        return Math.max(0.2, Math.log10(stock.marketCap / 1e8) * 0.4);
      })
      .pointLabel(d => {
        const stock = d as StockNode;
        return `
          <div style="background: rgba(10,10,11,0.95); padding: 12px; border: 1px solid #00E0FF; border-radius: 2px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #fff; min-width: 140px;">
            <div style="border-bottom: 1px solid #28282A; margin-bottom: 6px; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 900; letter-spacing: -0.5px;">${stock.ticker}</span>
                <span style="font-size: 8px; opacity: 0.5;">${stock.exchange}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span style="opacity: 0.6;">1D_CHG:</span>
                <span style="color: ${stock.change1d >= 0 ? '#00FF41' : '#FF3131'}; font-weight: 900;">${stock.change1d > 0 ? '+' : ''}${stock.change1d}%</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span style="opacity: 0.6;">SIGNAL:</span>
                <span style="color: #00E0FF; font-weight: 900;">${stock.momentumSignal || 'STEADY'}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="opacity: 0.6;">VAL_CAP:</span>
                <span style="font-weight: 900;">$${(stock.marketCap / 1e9).toFixed(1)}B</span>
            </div>
          </div>
        `;
      })
      // Rings (Pulse Events)
      .ringLat('lat')
      .ringLng('lon')
      .ringColor(d => {
        const e = d as FinanceEvent;
        switch(e.severity) {
            case 'danger': return '#FF3131';
            case 'warn': return '#D4AF37';
            case 'success': return '#00FF41';
            default: return '#00E0FF';
        }
      })
      .ringMaxRadius(3)
      .ringPropagationSpeed(1.5)
      .ringRepeatPeriod(1000)
      .onPointClick((d: any) => onSelectStock(d as StockNode));

    g.controls().autoRotate = true;
    g.controls().autoRotateSpeed = 0.2;

    globeInstance.current = g;

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
      g?._destructor?.();
    };
  }, []);

  useEffect(() => {
    if (globeInstance.current) {
      globeInstance.current.pointsData(stocks);
    }
  }, [stocks]);

  useEffect(() => {
    if (globeInstance.current) {
      // Only show recent geo-located events on the globe
      const mapEvents = events.filter(e => e.lat !== undefined && e.lon !== undefined);
      globeInstance.current.ringsData(mapEvents);
    }
  }, [events]);

  useEffect(() => {
    if (globeInstance.current && selectedStock) {
      globeInstance.current.pointOfView({ 
        lat: selectedStock.lat, 
        lng: selectedStock.lon, 
        altitude: 1.5 
      }, 1000);
    }
  }, [selectedStock]);

  return <div ref={containerRef} className="w-full h-full bg-black/10" />;
}
