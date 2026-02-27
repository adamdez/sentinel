"use client";

import {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  forwardRef,
} from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  ArrowRight,
  Flame,
  UserPlus,
  Users,
  User,
  MapPin,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { DUMMY_LEADS } from "@/lib/leads-data";
import { cn } from "@/lib/utils";

interface SearchRecord {
  id: string;
  kind: "prospect" | "lead" | "contact";
  primary: string;
  secondary: string;
  tertiary?: string;
  href: string;
  score?: number;
  scoreLabel?: "fire" | "hot" | "warm" | "cold";
  status?: string;
}

const CONTACT_DATA = [
  { id: "c1", name: "Sarah Kim", company: "AZ Realty Group", phone: "(602) 555-0100", role: "Title Agent" },
  { id: "c2", name: "Mike Reynolds", company: "Desert Title Co", phone: "(480) 555-0200", role: "Closer" },
  { id: "c3", name: "Jennifer Torres", company: "Pinal County Records", phone: "(520) 555-0300", role: "County Clerk" },
  { id: "c4", name: "Brian Patterson", company: "Phoenix Appraisals", phone: "(602) 555-0400", role: "Appraiser" },
  { id: "c5", name: "Amanda Walsh", company: "Southwest Escrow", phone: "(480) 555-0500", role: "Escrow Officer" },
];

const SEARCH_INDEX: SearchRecord[] = (() => {
  const records: SearchRecord[] = [];

  for (const lead of DUMMY_LEADS) {
    const isProspect = lead.status === "prospect";
    records.push({
      id: lead.id,
      kind: isProspect ? "prospect" : "lead",
      primary: lead.ownerName,
      secondary: `${lead.address}, ${lead.city} ${lead.state} ${lead.zip}`,
      tertiary: [
        lead.apn,
        lead.county,
        lead.ownerPhone ?? "",
        lead.ownerEmail ?? "",
        lead.source,
        ...lead.tags,
        ...lead.distressSignals,
        lead.notes ?? "",
        lead.assignedName ?? "",
        lead.ownerBadge ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      href: isProspect ? "/sales-funnel/prospects" : "/leads",
      score: lead.score.composite,
      scoreLabel: lead.score.label,
      status: lead.status,
    });
  }

  for (const c of CONTACT_DATA) {
    records.push({
      id: c.id,
      kind: "contact",
      primary: c.name,
      secondary: `${c.role} — ${c.company}`,
      tertiary: `${c.phone} ${c.company}`,
      href: "/contacts",
    });
  }

  return records;
})();

const SCORE_COLORS: Record<string, string> = {
  fire: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  hot: "text-red-400 bg-red-500/15 border-red-500/30",
  warm: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  cold: "text-blue-400 bg-blue-500/15 border-blue-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  lead: "Lead",
  negotiation: "Negotiation",
  nurture: "Nurture",
  dead: "Dead",
  closed: "Closed",
};

const KIND_ICONS: Record<string, LucideIcon> = {
  prospect: UserPlus,
  lead: Users,
  contact: User,
};

const KIND_COLORS: Record<string, string> = {
  prospect: "bg-neon/10 border-neon/20 text-neon",
  lead: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  contact: "bg-purple-500/10 border-purple-500/20 text-purple-400",
};

function matchScore(record: SearchRecord, query: string): number {
  const q = query.toLowerCase();
  const fields = [record.primary, record.secondary, record.tertiary ?? ""];
  let best = 0;

  for (const field of fields) {
    const lower = field.toLowerCase();
    if (lower === q) return 100;
    if (lower.startsWith(q)) best = Math.max(best, 80);
    else if (lower.includes(q)) best = Math.max(best, 50);

    const words = lower.split(/[\s,\-—]+/);
    for (const word of words) {
      if (word === q) best = Math.max(best, 90);
      else if (word.startsWith(q)) best = Math.max(best, 70);
    }
  }

  return best;
}

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isOpen = focused && query.length > 0;

  const results = useMemo(() => {
    if (!query) return [];
    return SEARCH_INDEX
      .map((rec) => ({ rec, relevance: matchScore(rec, query) }))
      .filter((r) => r.relevance > 0)
      .sort((a, b) => {
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        return (b.rec.score ?? 0) - (a.rec.score ?? 0);
      })
      .slice(0, 10)
      .map((r) => r.rec);
  }, [query]);

  const handleSelect = useCallback(
    (href: string) => {
      setQuery("");
      setFocused(false);
      inputRef.current?.blur();
      router.push(href);
    },
    [router]
  );

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      } else if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        handleSelect(results[activeIndex].href);
      } else if (e.key === "Escape") {
        setFocused(false);
        inputRef.current?.blur();
      }
    },
    [isOpen, activeIndex, results, handleSelect]
  );

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-all duration-200 min-w-[320px]",
          focused
            ? "bg-secondary/80 border-neon/30 shadow-[0_0_12px_rgba(0,255,136,0.08)]"
            : "bg-secondary/50 border-glass-border hover:bg-secondary/70"
        )}
      >
        <Search className={cn("h-3.5 w-3.5 shrink-0 transition-colors", focused ? "text-neon" : "text-muted-foreground")} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search anything in Sentinel..."
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
        {query ? (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="text-[10px] bg-background/50 px-1.5 py-0.5 rounded border border-glass-border font-mono text-muted-foreground">
            Ctrl+K
          </kbd>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{ transformOrigin: "top" }}
            className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl glass-strong border border-glass-border shadow-2xl overflow-hidden min-w-[400px]"
          >
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto py-1.5">
                {results.map((rec, i) => {
                  const Icon = KIND_ICONS[rec.kind] ?? MapPin;
                  const isActive = i === activeIndex;

                  return (
                    <button
                      key={rec.id}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(rec.href);
                      }}
                      className={cn(
                        "flex items-center gap-3 w-full text-left px-3 py-2.5 transition-colors",
                        isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                      )}
                    >
                      <div
                        className={cn(
                          "h-7 w-7 rounded-md flex items-center justify-center shrink-0 border",
                          KIND_COLORS[rec.kind] ?? "bg-secondary/40 border-glass-border text-muted-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-semibold truncate text-foreground"
                          style={{
                            textShadow: isActive ? "0 0 10px rgba(0,255,136,0.15)" : undefined,
                            WebkitFontSmoothing: "antialiased",
                          }}
                        >
                          <HighlightMatch text={rec.primary} query={query} />
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          <HighlightMatch text={rec.secondary} query={query} />
                        </p>
                      </div>

                      {rec.score != null && rec.scoreLabel && (
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded border font-bold shrink-0",
                            SCORE_COLORS[rec.scoreLabel]
                          )}
                        >
                          {rec.scoreLabel === "fire" && (
                            <Flame className="h-2 w-2 inline mr-0.5" />
                          )}
                          {rec.score}
                        </span>
                      )}

                      {rec.status && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground border border-glass-border shrink-0">
                          {STATUS_LABELS[rec.status] ?? rec.status}
                        </span>
                      )}

                      <ArrowRight
                        className={cn(
                          "h-3 w-3 shrink-0 transition-colors",
                          isActive ? "text-neon/60" : "text-muted-foreground/20"
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="border-t border-glass-border/50 px-3 py-1.5 flex items-center gap-4 text-[10px] text-muted-foreground/60">
              <span>
                <kbd className="font-mono bg-background/40 px-1 py-0.5 rounded border border-glass-border/50">↑↓</kbd> Navigate
              </span>
              <span>
                <kbd className="font-mono bg-background/40 px-1 py-0.5 rounded border border-glass-border/50">↵</kbd> Open
              </span>
              <span>
                <kbd className="font-mono bg-background/40 px-1 py-0.5 rounded border border-glass-border/50">Esc</kbd> Close
              </span>
              <span className="ml-auto text-neon/40">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return <>{text}</>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <span className="text-neon font-bold">{match}</span>
      {after}
    </>
  );
}
