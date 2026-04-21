import { FinanceEvent } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { Ship, Rocket, Cpu, BarChart2, Bell, Globe, Newspaper } from 'lucide-react';

interface LiveFeedSidebarProps {
  events: FinanceEvent[];
}

export default function LiveFeedSidebar({ events }: LiveFeedSidebarProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'AIS_ALERT': return Ship;
      case 'AERO_ALERT': return Rocket;
      case 'CRYPTO_NODE': return Cpu;
      case 'MARKET_CATALYST': return BarChart2;
      case 'MACRO_PULSE': return Newspaper;
      case 'GEOPOLITICAL': return Globe;
      default: return Bell;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'danger': return 'text-terminal-red border-terminal-red/30 bg-terminal-red/5';
      case 'warn': return 'text-terminal-gold border-terminal-gold/30 bg-terminal-gold/5';
      case 'success': return 'text-terminal-green border-terminal-green/30 bg-terminal-green/5';
      default: return 'text-terminal-cyan border-terminal-cyan/30 bg-terminal-cyan/5';
    }
  };

  return (
    <div className="flex flex-col h-full bg-terminal-panel/50 border-l border-terminal-line overflow-hidden">
      <div className="p-4 border-b border-terminal-line flex items-center justify-between bg-black/20">
        <span className="section-label !mb-0">GEO_ALPHA_PULSE</span>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-terminal-green animate-pulse" />
          <span className="text-[9px] text-terminal-green font-bold uppercase tracking-widest">Live</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        <AnimatePresence initial={false}>
          {events.length === 0 ? (
            <div className="text-center py-10 opacity-30 italic text-[10px] font-mono">
              Waiting for network pulse...
            </div>
          ) : (
            events.map((event, idx) => {
              const Icon = getIcon(event.type);
              return (
                <motion.div
                  key={event.timestamp + idx}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "p-3 rounded-sm border flex flex-col gap-2 transition-all group cursor-default",
                    getSeverityColor(event.severity)
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={12} className="opacity-70 group-hover:opacity-100 transition-opacity" />
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-60">
                        {event.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                       {event.source && (
                         <span className="text-[7px] px-1 bg-white/10 rounded-sm border border-white/10 text-white font-bold tracking-tighter">
                           {event.source}
                         </span>
                       )}
                       <span className="text-[8px] font-mono opacity-40">
                         {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                       </span>
                    </div>
                  </div>
                  <p className="text-[10px] font-mono leading-tight font-medium text-white/90">
                    {event.label}
                  </p>
                  {event.lat && (
                    <div className="text-[8px] font-mono opacity-40 flex items-center gap-1">
                      <span>Coords:</span>
                      <span>{event.lat.toFixed(2)}, {event.lon?.toFixed(2)}</span>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
