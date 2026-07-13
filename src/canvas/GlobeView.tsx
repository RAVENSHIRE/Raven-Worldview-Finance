import { useEffect, useMemo, useRef } from 'react';
import Globe from 'globe.gl';
import * as topojson from 'topojson-client';
import countries110m from 'world-atlas/countries-110m.json';
import { StockNode, FinanceEvent } from '../types';
import { useInteractionState } from '../store/useInteractionState';
import { exchangeCoords } from '../lib/geo';
import { evaluateRiskState } from '../services/riskMonitoringEngine';

// Convert the bundled TopoJSON world into GeoJSON country features once at
// module load. This makes the globe fully self-contained — no external CDN
// textures — so it renders reliably in any environment.
const WORLD = topojson.feature(
  countries110m as any,
  (countries110m as any).objects.countries
) as any;
const COUNTRY_FEATURES = WORLD.features as any[];

interface GlobeViewportProps {
  stocks: StockNode[];
  events: FinanceEvent[];
  activeLayers: string[];
  onSelectStock: (stock: StockNode) => void;
  selectedStock?: StockNode | null;
  colorMode: 'change' | 'trump_beta';
  portfolioTickers?: Set<string>;
}

export default function GlobeViewport({ stocks, events, activeLayers, onSelectStock, selectedStock, colorMode, portfolioTickers }: GlobeViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeInstance = useRef<any>(null);
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const focusedTicker = useInteractionState(s => s.focusedTicker);
  const hoveredTicker = useInteractionState(s => s.hoveredTicker);
  const supplyChainOn = useInteractionState(s => s.layers.supplyChain);
  const livePortfolioOn = useInteractionState(s => s.layers.livePortfolio);
  const intel = useInteractionState(s => s.intel);

  const stocksByTicker = useMemo(() => {
    const m = new Map<string, StockNode>();
    for (const s of stocks) m.set(s.ticker, s);
    return m;
  }, [stocks]);

  // Mock Shipping Corridors for Globe
  const ARCHS_DATA = [
    { startLat: 29.9, startLng: 32.5, endLat: 40.7, endLng: -74.0, name: 'Suez to NY Pipeline', color: '#00E0FF' },
    { startLat: 1.3, startLng: 103.8, endLat: 34.0, endLng: -118.2, name: 'Malacca to Long Beach', color: '#D4AF37' },
    { startLat: 40.4, startLng: -3.7, endLat: 40.7, endLng: -74.0, name: 'Madrid to NY Corridors', color: '#00E0FF' }
  ];

  useEffect(() => {
    if (!containerRef.current) return;

    const g = (Globe as any)()(containerRef.current)
      // Night-mode aesthetic: ultra-dark background + glowing atmosphere
      .backgroundColor('#020408')
      .showGlobe(true)
      .showAtmosphere(true)
      .atmosphereColor('#00FF88')
      .atmosphereAltitude(0.25)
      // Country landmasses
      .polygonsData(COUNTRY_FEATURES)
      .polygonCapColor(() => 'rgba(15, 25, 35, 0.75)')
      .polygonSideColor(() => 'rgba(0, 224, 255, 0.04)')
      .polygonStrokeColor(() => 'rgba(0, 255, 136, 0.35)')
      .polygonAltitude(0.008)
      .polygonLabel((d: any) => `<span style="font-family:monospace;font-size:9px;color:#00FF88;">${d?.properties?.name || ''}</span>`)
      // Arcs: shipping corridors, Exchange→HQ listing links, supply-chain web.
      // Per-arc styling via accessors so the three layers can coexist.
      .arcLabel(d => (d as any).name)
      .arcColor('color')
      .arcDashLength((d: any) => d.dashLen ?? 0.4)
      .arcDashGap((d: any) => d.dashGap ?? 4)
      .arcDashInitialGap(() => Math.random() * 5)
      .arcDashAnimateTime((d: any) => d.animMs ?? 1000)
      .arcStroke((d: any) => d.stroke ?? 0.1)
      .arcAltitudeAutoScale(0.35)
      // Hex Bin (Sector Heatmap)
      .hexBinPointLat('lat')
      .hexBinPointLng('lon')
      .hexBinPointWeight(d => (d as StockNode).marketCap / 1e11)
      .hexBinResolution(4)
      .hexMargin(0.1)
      .hexTopColor(() => '#00FF88')
      .hexSideColor(() => '#00FF8822')
      .hexLabel(d => {
        const points = (d as any).points as StockNode[];
        const sectorCount: Record<string, number> = {};
        points.forEach(p => {
            sectorCount[p.sector] = (sectorCount[p.sector] || 0) + 1;
        });
        const topSector = Object.entries(sectorCount).sort((a,b) => b[1] - a[1])[0]?.[0];
        return `
          <div style="background: rgba(0,0,0,0.9); padding: 8px; border: 1px solid #00FF88; font-size: 9px; font-family: 'JetBrains Mono';">
            <div style="color: #00FF88; font-weight: 900; margin-bottom: 4px;">SECTOR_CLUSTER: ${topSector || 'MIXED'}</div>
            <div style="opacity: 0.6;">CONVERGENCE_NODES: ${points.length}</div>
            <div style="opacity: 0.6;">TICKERS: ${points.map(p => p.ticker).join(', ')}</div>
          </div>
        `;
      })
      // Points with volumetric glow effect
      .pointLat('lat')
      .pointLng('lon')
      .pointColor(d => {
        const stock = d as StockNode;
        if (colorMode === 'change') {
           return stock.change1d > 0 ? '#00FF66' : stock.change1d < 0 ? '#FF3844' : '#6B7280';
        } else {
           const beta = stock.trumpBeta || 0;
           return beta > 7 ? '#FFD700' : '#00FF88';
        }
      })
      .pointAltitude(0.02)
      .pointRadius(d => {
        const stock = d as StockNode;
        return Math.max(0.25, Math.log10(stock.marketCap / 1e8) * 0.5);
      })
      // Hover drives the external glassmorphic NodeTooltip via global state —
      // no built-in HTML label (it would double-render the card).
      .pointLabel(() => '')
      .onPointHover((d: any) => {
        const setHovered = useInteractionState.getState().setHovered;
        if (d) setHovered((d as StockNode).ticker, { ...mousePos.current });
        else setHovered(null);
      })
      // Rings (Pulse Events)
      .ringLat('lat')
      .ringLng('lon')
      .ringColor(d => {
        const e = d as FinanceEvent & { _portfolio?: boolean; _invalidated?: boolean };
        if (e._invalidated) return 'rgba(255, 32, 48, 0.9)'; // invalidation-level breach ripple
        if (e._portfolio) return 'rgba(0, 240, 255, 0.7)';  // portfolio halo
        switch(e.severity) {
            case 'danger': return '#FF3131';
            case 'warn': return '#D4AF37';
            case 'success': return '#00FF41';
            default: return '#00E0FF';
        }
      })
      .ringMaxRadius((d: any) => d._invalidated ? 7 : 3)
      .ringPropagationSpeed((d: any) => d._invalidated ? 3.2 : 1.5)
      .ringRepeatPeriod((d: any) => d._invalidated ? 650 : 1000)
      .onPointClick((d: any) => {
        onSelectStock(d as StockNode);
        useInteractionState.getState().focusTicker((d as StockNode).ticker);
      });

    // Night-mode ocean with subtle city-lights glow
    try {
      const mat = g.globeMaterial();
      mat.color?.set?.('#0a0e14');
      if ('emissive' in mat) mat.emissive?.set?.('#001a2e');
      if ('shininess' in mat) mat.shininess = 3;
    } catch { /* material not ready — non-fatal */ }

    g.controls().autoRotate = true;
    g.controls().autoRotateSpeed = 0.35;

    // Cinematic low-orbit opening view: off-center with the horizon curvature
    // visible, rather than a dead-on staring globe.
    g.pointOfView({ lat: 28, lng: -35, altitude: 2.1 }, 0);

    globeInstance.current = g;

    // Track cursor so the hover tooltip can anchor next to the node.
    const trackMouse = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      const st = useInteractionState.getState();
      if (st.hoveredTicker) st.setHovered(st.hoveredTicker, { x: e.clientX, y: e.clientY });
    };
    containerRef.current.addEventListener('mousemove', trackMouse);

    const handleResize = () => {
      if (containerRef.current) {
        g.width(containerRef.current.clientWidth);
        g.height(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const mountEl = containerRef.current;
    return () => {
      window.removeEventListener('resize', handleResize);
      mountEl?.removeEventListener('mousemove', trackMouse);
      g?._destructor?.();
    };
  }, []);

  useEffect(() => {
    if (globeInstance.current) {
      const legacyHeatmap = activeLayers.includes('Signal Heatmap');
      globeInstance.current.pointsData(legacyHeatmap ? [] : stocks);
      // Heat zones: portfolio capital concentration binned over regions.
      // Zones pulse red when the local book is in drawdown (macro red flag).
      const heatPoints = legacyHeatmap
        ? stocks
        : (livePortfolioOn && portfolioTickers)
          ? stocks.filter(s => portfolioTickers.has(s.ticker))
          : [];
      globeInstance.current
        .hexTopColor((d: any) => {
          const pts = (d?.points ?? []) as StockNode[];
          const avg = pts.length ? pts.reduce((a, p) => a + p.change1d, 0) / pts.length : 0;
          return avg <= -3 ? 'rgba(255,56,68,0.85)' : 'rgba(0,240,255,0.55)';
        })
        .hexSideColor((d: any) => {
          const pts = (d?.points ?? []) as StockNode[];
          const avg = pts.length ? pts.reduce((a, p) => a + p.change1d, 0) / pts.length : 0;
          return avg <= -3 ? 'rgba(255,56,68,0.15)' : 'rgba(0,240,255,0.12)';
        })
        .hexBinPointsData(heatPoints);
    }
  }, [stocks, activeLayers, livePortfolioOn, portfolioTickers]);

  useEffect(() => {
    if (globeInstance.current) {
      // Geo-located event pulses (legacy layers) + steady cyan halos marking
      // the user's live portfolio assets on the globe.
      const showEvents = activeLayers.includes('Crypto Nodes') || activeLayers.includes('AIS Corridors');
      const mapEvents = showEvents ? events.filter(e => e.lat !== undefined && e.lon !== undefined) : [];
      const held = (livePortfolioOn && portfolioTickers)
        ? stocks.filter(s => portfolioTickers.has(s.ticker))
        : [];
      const halos = held.map(s => ({ lat: s.lat, lon: s.lon, _portfolio: true }));
      // Invalidation visualizer: a holding whose price breaks its numeric
      // Invalidation_Level_Num (binary hook; -8% daily proxy until levels are
      // populated) fires a fast red expanding ripple at its node.
      const breaches = held
        .filter(s => evaluateRiskState(s.price, s.invalidationLevelNum ?? 0) === 'INVALIDATED' || s.change1d <= -8)
        .map(s => ({ lat: s.lat, lon: s.lon, _invalidated: true }));
      globeInstance.current.ringsData([...mapEvents, ...halos, ...breaches]);
    }
  }, [events, activeLayers, stocks, portfolioTickers, livePortfolioOn]);

  // Capital-flow arcs. Three layers, recomputed on interaction changes:
  //  1. Shipping corridors (legacy AIS layer)
  //  2. Primary listing link: Exchange ──► Corporate HQ for the active asset
  //  3. Supply-chain web: HQ ──► suppliers (amber) / customers (cyan), dotted
  useEffect(() => {
    if (!globeInstance.current) return;
    const arcs: any[] = [];

    if (activeLayers.includes('AIS Corridors')) arcs.push(...ARCHS_DATA);

    const active = focusedTicker || hoveredTicker;
    const stock = active ? stocksByTicker.get(active) : null;

    if (stock) {
      const ex = exchangeCoords(stock.exchange);
      // Skip the listing link when exchange and HQ are effectively co-located
      if (ex && (Math.abs(ex.lat - stock.lat) > 0.2 || Math.abs(ex.lon - stock.lon) > 0.2)) {
        arcs.push({
          startLat: ex.lat, startLng: ex.lon,
          endLat: stock.lat, endLng: stock.lon,
          color: ['#00f0ff', '#00ff66'],
          name: `${stock.ticker} LISTING: ${ex.label} → HQ`,
          stroke: 0.32, dashLen: 0.5, dashGap: 0.2, animMs: 1400,
        });
      }

      if (supplyChainOn) {
        const report = intel[stock.ticker];
        for (const node of report?.supplyChain ?? []) {
          if (node.lat == null || node.lon == null) continue;
          arcs.push({
            startLat: stock.lat, startLng: stock.lon,
            endLat: node.lat, endLng: node.lon,
            color: node.relation === 'customer' ? 'rgba(0,240,255,0.4)' : 'rgba(255,170,0,0.4)',
            name: `${node.relation.toUpperCase()}: ${node.name}`,
            stroke: 0.12, dashLen: 0.12, dashGap: 0.08, animMs: 2200,
          });
        }
      }
    }

    globeInstance.current.arcsData(arcs);
  }, [activeLayers, focusedTicker, hoveredTicker, supplyChainOn, intel, stocksByTicker]);

  // "> LOAD PLTR" / pipeline-card focus: center the camera on the node.
  useEffect(() => {
    if (!globeInstance.current || !focusedTicker) return;
    const stock = stocksByTicker.get(focusedTicker);
    if (!stock) return;
    globeInstance.current.controls().autoRotate = false;
    globeInstance.current.pointOfView({ lat: stock.lat, lng: stock.lon, altitude: 1.2 }, 1200);
  }, [focusedTicker, stocksByTicker]);

  useEffect(() => {
    if (globeInstance.current && selectedStock) {
      globeInstance.current.pointOfView({ 
        lat: selectedStock.lat, 
        lng: selectedStock.lon, 
        altitude: 1.5 
      }, 1000);

      // Trigger "Target Recognition" pulse on selection
      const recognitionEvent: FinanceEvent = {
          type: 'SYSTEM',
          label: `TARGET_RECOGNITION: ${selectedStock.ticker}`,
          lat: selectedStock.lat,
          lon: selectedStock.lon,
          severity: 'success',
          timestamp: new Date().toISOString()
      };
      // We don't have direct access to setEvents here, but the globe will pick up 
      // the selectedStock point and we can add a transient ring
      const rings = globeInstance.current.ringsData();
      globeInstance.current.ringsData([...rings, recognitionEvent]);
      setTimeout(() => {
          globeInstance.current.ringsData(globeInstance.current.ringsData().filter((r: any) => r !== recognitionEvent));
      }, 3000);
    }
  }, [selectedStock]);

  return <div ref={containerRef} className="w-full h-full bg-black/10" />;
}
