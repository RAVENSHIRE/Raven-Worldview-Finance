import { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, ArcLayer } from '@deck.gl/layers';
import { Map } from 'react-map-gl/maplibre';
import { StockNode, FinanceEvent } from '../types';

interface FlatViewportProps {
  stocks: StockNode[];
  events: FinanceEvent[];
  onSelectStock: (stock: StockNode) => void;
  selectedStock?: StockNode | null;
  colorMode: 'change' | 'trump_beta';
}

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1.5,
  pitch: 30,
  bearing: 0
};

// Mock Geo Data for extra worldview detail
const MOCK_AIS_CORRIDORS = [
  { source: [32, 30], target: [-74, 40], color: [0, 224, 255, 50] }, // Suez to NY
  { source: [103, 1], target: [121, 25], color: [212, 175, 55, 50] }, // Malacca to Taiwan
];

export default function FlatViewport({ stocks, events, onSelectStock, selectedStock, colorMode }: FlatViewportProps) {
  
  const layers = useMemo(() => [
    // 1. Shipping Corridors (Situational Awareness)
    new ArcLayer({
        id: 'ais-corridors',
        data: MOCK_AIS_CORRIDORS,
        getSourcePosition: (d: any) => d.source,
        getTargetPosition: (d: any) => d.target,
        getSourceColor: (d: any) => d.color,
        getTargetColor: (d: any) => d.color,
        getWidth: 1,
    }),

    // 2. Real-Time Pulse Events
    new ScatterplotLayer({
        id: 'live-pulses',
        data: events.filter(e => e.lat !== undefined),
        getPosition: (d: any) => [d.lon, d.lat],
        getFillColor: (d: any) => {
            switch(d.severity) {
                case 'danger': return [255, 49, 49, 150];
                case 'warn': return [212, 175, 55, 150];
                case 'success': return [0, 255, 65, 150];
                default: return [0, 224, 255, 150];
            }
        },
        getRadius: (d: any) => 300000,
        radiusMinPixels: 10,
        stroked: true,
        lineWidthMinPixels: 2,
        getLineColor: (d: any) => [255, 255, 255, 100],
    }),

    // 3. Asset Nodes (Equities/IPOs)
    new ScatterplotLayer({
      id: 'stock-nodes',
      data: stocks,
      getPosition: (d: any) => [d.lon, d.lat],
      getFillColor: (d: any) => {
        if (colorMode === 'change') {
          return d.change1d >= 0 ? [0, 255, 65] : [255, 49, 49];
        }
        const beta = d.trumpBeta || 0;
        return beta >= 8 ? [212, 175, 55] : [0, 224, 255];
      },
      getRadius: (d: any) => Math.sqrt(d.marketCap / 1e8) * 800,
      radiusMinPixels: 4,
      radiusMaxPixels: 30,
      pickable: true,
      onClick: info => onSelectStock(info.object as StockNode),
      updateTriggers: {
        getFillColor: [colorMode]
      }
    })
  ], [stocks, events, colorMode, onSelectStock]);

  return (
    <div className="w-full h-full relative">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE as any}
        controller={true}
        layers={layers}
        getTooltip={({ object }) => object && (
            (object as StockNode).ticker ? {
                html: `<div style="padding: 10px; background: #0A0A0B; border: 1px solid #00E0FF; color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 10px;">
                    <div style="font-weight: 900; color: #00E0FF; border-bottom: 1px solid #28282A; margin-bottom: 4px;">${(object as StockNode).ticker}</div>
                    VAL: $${((object as StockNode).marketCap / 1e9).toFixed(1)}B<br/>
                    1D: ${(object as StockNode).change1d}%<br/>
                    SIG: ${(object as StockNode).momentumSignal || 'N/A'}
                </div>`
            } : {
                html: `<div style="padding: 10px; background: #141416; border: 1px solid #D4AF37; color: #fff; font-family: monospace; font-size: 10px;">
                    EVENT: ${(object as FinanceEvent).label}
                </div>`
            }
        )}
      >
        <Map 
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        />
      </DeckGL>
    </div>
  );
}
