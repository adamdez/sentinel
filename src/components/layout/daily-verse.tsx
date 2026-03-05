"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ExternalLink, ChevronDown } from "lucide-react";

interface Devotional {
  verseRef: string;
  verseText: string;
  author: string;
  commentary: string;
  sourceUrl: string;
  sourceTitle: string;
}

export function DailyVerse() {
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/daily-verse");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.devotional) {
          setDevotional(data.devotional);
        }
      } catch {
        // Silently fail — devotional is optional chrome
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (loading || !devotional) return null;

  // Truncate verse for the top bar display
  const displayText =
    devotional.verseText.length > 80
      ? devotional.verseText.slice(0, 77) + "..."
      : devotional.verseText;

  return (
    <div className="relative shrink-0 border-b border-glass-border/50 bg-white/[0.015]" ref={dropdownRef}>
      {/* Thin banner strip — clickable verse */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-2 group cursor-pointer px-4 py-1"
      >
        <BookOpen className="h-3 w-3 text-[#ff6b35]/40 shrink-0 group-hover:text-[#ff6b35]/70 transition-colors" />
        <p className="text-[11px] text-[#ff6b35]/50 group-hover:text-[#ff6b35]/80 transition-colors truncate italic">
          &ldquo;{displayText}&rdquo;
        </p>
        <span className="text-[11px] text-[#ff6b35]/40 group-hover:text-[#ff6b35]/70 transition-colors shrink-0 font-medium">
          — {devotional.verseRef}
        </span>
        <ChevronDown
          className={`h-2.5 w-2.5 text-[#ff6b35]/30 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown bubble */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[480px] max-w-[calc(100vw-2rem)] z-50"
          >
            <div className="rounded-[12px] border border-cyan/15 bg-[rgba(12,12,22,0.95)] backdrop-blur-xl shadow-2xl shadow-black/40 p-5 space-y-4">
              {/* Verse */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-cyan" />
                  <h3 className="text-sm font-semibold text-cyan">
                    {devotional.verseRef}
                  </h3>
                  <span className="text-[9px] text-muted-foreground/40 ml-auto">ESV</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed pl-6">
                  &ldquo;{devotional.verseText}&rdquo;
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-white/[0.06]" />

              {/* Commentary */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Commentary
                </p>
                <blockquote className="text-xs text-foreground/80 leading-relaxed italic border-l-2 border-cyan/20 pl-3">
                  {devotional.commentary}
                </blockquote>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] font-semibold text-foreground/70">
                    — {devotional.author}
                  </p>
                  <a
                    href={devotional.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-cyan/60 hover:text-cyan transition-colors"
                  >
                    <span className="underline underline-offset-2">
                      {devotional.sourceTitle}
                    </span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>

              {/* ESV Copyright */}
              <p className="text-[8px] text-muted-foreground/30 text-center pt-1">
                Scripture quotations are from the ESV® Bible, copyright © 2001 by Crossway.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
