import { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { Map } from 'react-map-gl/maplibre';
import { StockNode } from '../types';

interface FlatViewportProps {
  stocks: StockNode[];
  onSelectStock: (stock: StockNode) => void;
  selectedStock?: StockNode | null;
  colorMode: 'change' | 'trump_beta';
}

const INITIAL_VIEW_STATE = {
  longitude: -20,
  latitude: 20,
  zoom: 1.5,
  pitch: 0,
  bearing: 0
};

export default function FlatViewport({ stocks, onSelectStock, selectedStock, colorMode }: FlatViewportProps) {
  
  const layers = useMemo(() => [
    new ScatterplotLayer({
      id: 'stock-nodes',
      data: stocks,
      getPosition: (d: any) => [d.lon, d.lat],
      getFillColor: (d: any) => {
        if (colorMode === 'change') {
          return d.change1d >= 0 ? [0, 255, 65] : [255, 49, 49];
        }
        return d.trumpBeta && d.trumpBeta >= 8 ? [212, 175, 55] : [0, 224, 255];
      },
      getRadius: (d: any) => Math.sqrt(d.marketCap / 1e8) * 1000,
      radiusMinPixels: 4,
      radiusMaxPixels: 30,
      pickable: true,
      onClick: info => onSelectStock(info.object as StockNode),
      updateTriggers: {
        getFillColor: [colorMode]
      }
    })
  ], [stocks, colorMode, onSelectStock]);

  return (
    <div className="w-full h-full relative">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE as any}
        controller={true}
        layers={layers}
        getTooltip={({ object }) => object && {
          html: `<div style="padding: 10px; background: #141416; border: 1px solid #28282A; color: #fff; font-family: monospace;">
            <b>${(object as StockNode).ticker}</b><br/>
            Price: $${(object as StockNode).price}<br/>
            1D: ${(object as StockNode).change1d}%
          </div>`
        }}
      >
        <Map 
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        />
      </DeckGL>
    </div>
  );
}
