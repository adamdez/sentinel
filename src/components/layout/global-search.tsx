"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
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
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────

interface SearchRecord {
  id: string;
  kind: "prospect" | "lead" | "contact";
  primary: string;
  secondary: string;
  href: string;
  score?: number;
  scoreLabel?: "fire" | "hot" | "warm" | "cold";
  status?: string;
}

const SCORE_COLORS: Record<string, string> = {
  fire: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  hot: "text-red-400 bg-red-500/15 border-red-500/30",
  warm: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  cold: "text-blue-400 bg-blue-500/15 border-blue-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  lead: "Lead",
  my_lead: "My Lead",
  negotiation: "Negotiation",
  disposition: "Disposition",
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
  prospect: "bg-cyan/8 border-cyan/15 text-cyan",
  lead: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  contact: "bg-purple-500/10 border-purple-500/20 text-purple-400",
};

function labelFromScore(n: number): "fire" | "hot" | "warm" | "cold" {
  if (n >= 85) return "fire";
  if (n >= 65) return "hot";
  if (n >= 40) return "warm";
  return "cold";
}

// ── Live search function ───────────────────────────────────────────────

async function searchSupabase(q: string): Promise<SearchRecord[]> {
  if (q.length < 2) return [];
  const pattern = `%${q}%`;

  // Search properties by address, owner_name, apn
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: props } = await (supabase.from("properties") as any)
    .select("id, apn, address, city, state, zip, owner_name")
    .or(`address.ilike.${pattern},owner_name.ilike.${pattern},apn.ilike.${pattern}`)
    .limit(20);

  if (!props || props.length === 0) return [];

  // Get property IDs, then fetch their leads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propIds = (props as any[]).map((p) => p.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (supabase.from("leads") as any)
    .select("id, property_id, status, priority, source")
    .in("property_id", propIds);

  // Build a map: property_id → lead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadMap: Record<string, any> = {};
  if (leads) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of leads as any[]) {
      if (!leadMap[l.property_id] || (l.priority ?? 0) > (leadMap[l.property_id].priority ?? 0)) {
        leadMap[l.property_id] = l;
      }
    }
  }

  const records: SearchRecord[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of props as any[]) {
    const lead = leadMap[p.id];
    const isProspect = !lead || lead.status === "prospect";
    const score = lead?.priority ?? 0;

    records.push({
      id: lead?.id ?? p.id,
      kind: isProspect ? "prospect" : "lead",
      primary: p.owner_name ?? "Unknown",
      secondary: [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "),
      href: isProspect ? "/sales-funnel/prospects" : "/leads",
      score: score > 0 ? score : undefined,
      scoreLabel: score > 0 ? labelFromScore(score) : undefined,
      status: lead?.status ?? "prospect",
    });
  }

  return records;
}

// ── Component ──────────────────────────────────────────────────────────

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = focused && query.length > 0;

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchSupabase(query);
      setResults(r);
      setSearching(false);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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

  // Ctrl+K hotkey
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

  // Click outside to close
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
          "flex items-center gap-2 h-9 px-3 rounded-[12px] border text-sm transition-all duration-200 min-w-[320px]",
          focused
            ? "bg-secondary/80 border-cyan/20 shadow-[0_0_12px_rgba(0,212,255,0.08)]"
            : "bg-secondary/50 border-glass-border hover:bg-secondary/70"
        )}
      >
        <Search className={cn("h-3.5 w-3.5 shrink-0 transition-colors", focused ? "text-cyan" : "text-muted-foreground")} />
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
            className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-[14px] glass-strong border border-glass-border shadow-2xl overflow-hidden min-w-[400px]"
          >
            {searching ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            ) : results.length === 0 ? (
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
                            textShadow: isActive ? "0 0 10px rgba(0,212,255,0.15)" : undefined,
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
                          isActive ? "text-cyan/60" : "text-muted-foreground/20"
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
              <span className="ml-auto text-cyan/40">
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
      <span className="text-cyan font-bold">{match}</span>
      {after}
    </>
  );
}
