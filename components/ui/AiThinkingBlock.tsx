"use client";

import { Card } from "./Card";
import { Loader } from "./Loader";
import { useEffect, useRef, useState } from "react";
import type { AiPersonality } from "../../types";

const PERSONALITY_META: Record<AiPersonality, { 
    label: string, 
    shimmerColor: string
}> = {
    aurepal: { label: "AurePal", shimmerColor: "#3b82f6" }, // Blue
    muse: { label: "Muse", shimmerColor: "#a855f7" }, // Purple
    socrates: { label: "Socrates", shimmerColor: "#f59e0b" }, // Amber
    jarvis: { label: "J.A.R.V.I.S.", shimmerColor: "#06b6d4" }, // Cyan
    exampal: { label: "ExamPal", shimmerColor: "#10b981" }, // Emerald
    ocr: { label: "OCR Specialist", shimmerColor: "#64748b" }, // Slate
    auremed: { label: "AureMed", shimmerColor: "#f43f5e" }, // Rose
};

export default function AIThinkingBlock({ 
    personality = 'aurepal', 
    thoughtHistory = [], 
    isComplete = false 
}: { 
    personality?: AiPersonality, 
    thoughtHistory?: { text: string; time: string }[],
    isComplete?: boolean 
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [timer, setTimer] = useState(0);
    const [isExpanded, setIsExpanded] = useState(!isComplete);
    const finalTimeRef = useRef<number | null>(null);
    const hasAutoCollapsedRef = useRef(false);

    const meta = PERSONALITY_META[personality] || PERSONALITY_META.aurepal;

    // Automatically collapse terminal when thinking completes
    useEffect(() => {
      if (isComplete) {
        if (!hasAutoCollapsedRef.current) {
          setIsExpanded(false);
          hasAutoCollapsedRef.current = true;
        }
        if (finalTimeRef.current === null) {
          finalTimeRef.current = timer;
        }
        return;
      }
      
      const timerInterval = window.setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 100);

      return () => {
        clearInterval(timerInterval);
      };
    }, [isComplete]);

    // Use the frozen final time when complete, otherwise live timer
    const displayTime = isComplete && finalTimeRef.current !== null 
      ? finalTimeRef.current 
      : timer;

    useEffect(() => {
      if (contentRef.current && isExpanded) {
        const scrollHeight = contentRef.current.scrollHeight;
        const clientHeight = contentRef.current.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        // Auto-scroll to bottom as new thoughts arrive
        if (maxScroll > 0) {
             contentRef.current.scrollTo({ top: maxScroll, behavior: 'smooth' });
        }
      }
    }, [thoughtHistory, isExpanded]);

    // Constructing the shimmer gradient dynamically based on personality color
    const shimmerGradient = `linear-gradient(110deg, #404040, 35%, ${meta.shimmerColor}, 50%, #404040, 75%, #404040)`;

    return (
      <div className="flex flex-col p-3 max-w-xl animate-fade-in-up w-full">
        <div 
            className="flex items-center justify-start gap-3 mb-3 cursor-pointer hover:bg-secondary/50 p-2 rounded-lg transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
        >
          {isComplete ? (
            <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[10px] font-bold">
              ✓
            </div>
          ) : (
            <Loader size={"sm"} />
          )}
          <p
            className={isComplete
              ? "text-sm font-semibold text-muted-foreground"
              : "bg-[length:200%_100%] bg-clip-text text-sm font-semibold text-transparent animate-[shimmer_5s_linear_infinite]"
            }
            style={isComplete ? {} : {
              backgroundImage: shimmerGradient,
              animation: "shimmer 5s linear infinite",
            }}
          >
            {isComplete ? `Thought for ${(displayTime / 10).toFixed(1)}s` : `${meta.label} is thinking...`}
          </p>
          <span className="text-xs text-muted-foreground ml-auto font-mono flex items-center gap-2">
            {(displayTime / 10).toFixed(1)}s
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            >
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
          <style>{`
            @keyframes shimmer {
              0% {
                background-position: 200% 0;
              }
              100% {
                background-position: -200% 0;
              }
            }
          `}</style>
        </div>
        {isExpanded && (
            <Card className="relative h-[160px] overflow-hidden bg-black/90 dark:bg-black/95 p-0 rounded-xl border border-border/50 shadow-inner animate-in slide-in-from-top-2 flex flex-col">
              {/* Terminal Header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-white/10 border-b border-white/10">
                  <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
                  </div>
                  <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider ml-2">Agent Execution Log</span>
              </div>

              {/* Top fade overlay */}
              <div className="absolute top-[36px] left-0 right-0 bg-gradient-to-b from-black/90 to-transparent z-10 pointer-events-none h-[20px]" />

              {/* Scrolling content */}
              <div
                ref={contentRef}
                className="flex-1 overflow-y-auto p-4 text-green-400 hide-scrollbar"
              >
                <div className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono opacity-90 flex flex-col gap-1">
                  {thoughtHistory.length > 0 ? (
                      thoughtHistory.map((t, i) => (
                          <div key={i} className="flex gap-2">
                              <span className="text-white/30 select-none">[{t.time}]</span>
                              <span className={i === thoughtHistory.length - 1 ? "text-green-300" : "text-green-500/70"}>
                                  {t.text}
                              </span>
                          </div>
                      ))
                  ) : (
                      <div className="flex gap-2">
                          <span className="text-white/30 select-none">[{new Date().toISOString().split('T')[1].substring(0, 8)}]</span>
                          <span className="text-green-300">Initializing agent...</span>
                      </div>
                  )}
                  <div className="flex gap-2 mt-1">
                      <span className="text-white/30 select-none">[{new Date().toISOString().split('T')[1].substring(0, 8)}]</span>
                      <span className="inline-block w-2 h-3 bg-green-400 animate-pulse align-middle" />
                  </div>
                </div>
              </div>
            </Card>
        )}
      </div>
    );
}