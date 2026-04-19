import React, { useMemo } from 'react';
import { StockNode } from '../types';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface GalaxyProps {
  stocks: StockNode[];
  onSelectStock: (stock: StockNode) => void;
  selectedStock?: StockNode | null;
}

export default function GalaxyCluster({ stocks, onSelectStock, selectedStock }: GalaxyProps) {
  // Group stocks by sector
  const sectors = useMemo(() => {
    const groups: Record<string, StockNode[]> = {};
    stocks.forEach(s => {
      if (!groups[s.sector]) groups[s.sector] = [];
      groups[s.sector].push(s);
    });
    return groups;
  }, [stocks]);

  return (
    <div className="w-full h-full p-6 overflow-hidden flex flex-col bg-terminal-bg/50 backdrop-blur-sm border border-terminal-line rounded-lg">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-terminal-gold font-black uppercase tracking-[0.2em] text-xs">Sector Galaxy Clusters</h3>
        <span className="text-[10px] opacity-40 font-mono italic">ORBITAL_VIEW_v4.0</span>
      </div>

      <div className="flex-1 relative overflow-hidden grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
        {Object.entries(sectors).map(([sector, nodes], idx) => (
          <div key={sector} className="flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-terminal-line pb-1">
              <span className="text-[9px] font-black text-terminal-cyan uppercase tracking-widest">{sector}</span>
              <span className="text-[8px] opacity-30">({(nodes as StockNode[]).length})</span>
            </div>
            
            <div className="flex flex-wrap gap-3">
              {(nodes as StockNode[]).map(node => {
                const isSelected = selectedStock?.ticker === node.ticker;
                const momentum = node.change1d > 0;
                
                return (
                  <motion.div
                    key={node.ticker}
                    layoutId={`galaxy-${node.ticker}`}
                    onClick={() => onSelectStock(node)}
                    className={cn(
                      "group relative w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300",
                      isSelected ? "ring-2 ring-terminal-gold bg-terminal-gold/20" : "bg-terminal-panel hover:bg-white/10"
                    )}
                    whileHover={{ scale: 1.1 }}
                  >
                    {/* Momentum Pulse */}
                    <motion.div
                      className={cn(
                        "absolute inset-0 rounded-full",
                        momentum ? "bg-terminal-green/20" : "bg-terminal-red/20"
                      )}
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.2, 0.4, 0.2]
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: Math.random() * 2
                      }}
                    />
                    
                    <span className="text-[9px] font-black z-10">{node.ticker}</span>
                    
                    {/* Tooltip on Hover */}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-terminal-bg border border-terminal-line px-2 py-1 rounded-sm z-50 whitespace-nowrap">
                      <div className="text-[8px] font-black">${node.price.toFixed(2)}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4 border-t border-terminal-line pt-4">
        <div className="flex flex-col">
          <span className="text-[8px] opacity-40 uppercase tracking-tighter text-terminal-gold">Total Nodes</span>
          <span className="text-xl font-black">{stocks.length}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] opacity-40 uppercase tracking-tighter text-terminal-gold">Sector Clusters</span>
          <span className="text-xl font-black">{Object.keys(sectors).length}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] opacity-40 uppercase tracking-tighter text-terminal-gold">Universe Resonance</span>
          <span className="text-xl font-black">98.4%</span>
        </div>
      </div>
    </div>
  );
}
