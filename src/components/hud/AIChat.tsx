import { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, StockNode } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Sparkles, BrainCircuit } from 'lucide-react';
import { cn } from '../../lib/utils';

// Prompt for the specialized finance agent
const SYSTEM_PROMPT = `You are the Finance-Worldview AI Agent, an elite quant strategist and macro analyst.
You specialize in asymmetric information, early-mover signals, and cross-asset correlation.
Your tone is technical, concise, and professional - like a Bloomberg terminal analyst but with AI speed.
You have access to real-time geospatial data, satellite imagery analysis, and shipping corridors.
When asked about stocks, focus on Pre-Mover metrics: IPO status, AI strength, and Macro-beta.
Always provide actionable insights, not just summaries.`;

interface AIChatProps {
  selectedStock?: StockNode | null;
  swarmMessages?: any[];
}

export default function AIChat({ selectedStock, swarmMessages = [] }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The @google/genai constructor THROWS in the browser when no key is set.
  // Construct it once and only when a key exists, so a missing credential
  // degrades to an offline chat instead of crashing the entire dashboard.
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = useMemo(() => (apiKey ? new GoogleGenAI({ apiKey }) : null), [apiKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');

    if (!ai) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "AI_LINK_OFFLINE: No GEMINI_API_KEY configured. Chat is disabled, but the rest of the dashboard is fully operational.",
        timestamp: new Date().toISOString()
      }]);
      return;
    }

    setIsTyping(true);

    try {
      const chat = ai.chats.create({
        model: "gemini-3-flash-latest",
        config: { systemInstruction: SYSTEM_PROMPT }
      });

      const prompt = selectedStock 
        ? `Context: Selected asset is ${selectedStock.ticker} (${selectedStock.name}). Sector: ${selectedStock.sector}. Current Price: $${selectedStock.price}. IPO Status: ${selectedStock.ipoStatus}. AI Strength: ${selectedStock.aiStrength}. Macro Beta: ${selectedStock.macroBeta}. User Query: ${input}`
        : input;

      const result = await chat.sendMessage({ message: prompt });
      
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.text || "NO_DATA_RETURNED",
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error("AI CHAT ERROR:", error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "CRITICAL_ERROR: AI_LINK_FAILURE. Check system credentials.",
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-terminal-panel/50 border border-terminal-line rounded-sm overflow-hidden font-mono shadow-inner">
      <div className="p-3 border-b border-terminal-line bg-terminal-panel/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="text-terminal-cyan" size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest text-white">Quantum_Signal_Analyst</span>
        </div>
        <div className="flex items-center gap-2">
           <div className={cn("w-1.5 h-1.5 rounded-full", ai ? "bg-terminal-green animate-pulse" : "bg-terminal-red")} />
           <span className={cn("text-[8px] uppercase", ai ? "text-terminal-green" : "text-terminal-red")}>{ai ? 'LINK_ACTIVE' : 'LINK_OFFLINE'}</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {swarmMessages.length > 0 && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-2 opacity-50 mb-2">
               <BrainCircuit size={10} className="text-terminal-gold" />
               <span className="text-[8px] font-black uppercase tracking-widest">Active_Agent_Monitoring</span>
            </div>
            {swarmMessages.map((sm, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="bg-terminal-gold/5 border-l border-terminal-gold/40 p-2 text-[9px] font-mono leading-tight"
              >
                <div className="flex justify-between items-center mb-1">
                    <span className="text-terminal-gold font-black">{sm.agentName}</span>
                    <span className="text-[7px] text-zinc-600">{new Date(sm.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                </div>
                <p className="text-zinc-400 italic">"{sm.content}"</p>
              </motion.div>
            ))}
          </div>
        )}

        {messages.length === 0 && swarmMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 text-center px-6">
            <Bot size={32} className="mb-4" />
            <p className="text-[10px] leading-relaxed italic uppercase font-bold">
               Awaiting query parameters... <br/>
               Inquire about IPO readiness, AI infrastructure clusters, or cross-border macro flows.
            </p>
          </div>
        )}
        <AnimatePresence>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-3",
                m.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
               <div className={cn(
                 "w-6 h-6 rounded-sm flex items-center justify-center shrink-0 border",
                 m.role === 'user' ? "bg-zinc-800 border-zinc-700" : "bg-terminal-cyan/10 border-terminal-cyan/20"
               )}>
                 {m.role === 'user' ? <User size={12} className="text-zinc-400"/> : <Sparkles size={12} className="text-terminal-cyan"/>}
               </div>
               <div className={cn(
                 "p-2.5 rounded-sm text-[11px] leading-relaxed max-w-[85%]",
                 m.role === 'user' ? "bg-zinc-900/80 border border-zinc-800 text-zinc-300" : "bg-terminal-cyan/5 border border-terminal-cyan/20 text-white shadow-[0_0_15px_rgba(0,224,255,0.05)]"
               )}>
                 {m.content}
               </div>
            </motion.div>
          ))}
          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
               <div className="w-6 h-6 rounded-sm flex items-center justify-center shrink-0 bg-terminal-cyan/10 border border-terminal-cyan/20 animate-pulse">
                 <Bot size={12} className="text-terminal-cyan"/>
               </div>
               <div className="flex gap-1 items-center px-3">
                 <div className="w-1 h-1 bg-terminal-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms'}} />
                 <div className="w-1 h-1 bg-terminal-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms'}} />
                 <div className="w-1 h-1 bg-terminal-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms'}} />
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-3 bg-black/40 border-t border-terminal-line">
        <div className="relative group">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="GENERATE_ALPHA_REPORT..."
            className="w-full bg-zinc-900 border border-terminal-line rounded-sm py-2 px-3 text-[11px] focus:outline-none focus:border-terminal-cyan transition-all placeholder:text-zinc-700 font-mono pr-10"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-cyan hover:text-white transition-colors disabled:opacity-30"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="mt-2 flex justify-between items-center opacity-30 px-1">
           <span className="text-[7px] uppercase tracking-tighter">Model: gemini-3-flash-latest</span>
           <span className="text-[7px] uppercase tracking-tighter">latency: 124ms</span>
        </div>
      </div>
    </div>
  );
}
