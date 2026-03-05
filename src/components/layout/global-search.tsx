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
  Globe,
  Loader2,
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
  scoreLabel?: "platinum" | "gold" | "silver" | "bronze";
  status?: string;
}

const SCORE_COLORS: Record<string, string> = {
  platinum: "text-cyan-300 bg-cyan-400/15 border-cyan-400/30",
  gold: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  silver: "text-slate-300 bg-slate-400/15 border-slate-400/30",
  bronze: "text-orange-500 bg-orange-600/15 border-orange-600/30",
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

function labelFromScore(n: number): "platinum" | "gold" | "silver" | "bronze" {
  if (n >= 85) return "platinum";
  if (n >= 65) return "gold";
  if (n >= 40) return "silver";
  return "bronze";
}

/** Heuristic: does the query look like a US street address? */
function looksLikeAddress(q: string): boolean {
  // Must start with a number and contain at least one letter word after it
  return /^\d+\s+[a-zA-Z]/.test(q.trim()) && q.trim().length >= 6;
}

interface NationwideSuggestion {
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  placeId?: string;
  lat?: number | null;
  lng?: number | null;
}

// Session token groups autocomplete requests to reduce Google billing
let _sessionToken: string | null = null;
function getSessionToken() {
  if (!_sessionToken) _sessionToken = crypto.randomUUID();
  return _sessionToken;
}
function resetSessionToken() { _sessionToken = null; }

async function fetchSuggestions(q: string): Promise<NationwideSuggestion[]> {
  try {
    const res = await fetch("/api/property-lookup/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, sessionToken: getSessionToken() }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.suggestions ?? [];
  } catch {
    return [];
  }
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
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [suggestions, setSuggestions] = useState<NationwideSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = open && query.length > 0;
  const showNationwide = looksLikeAddress(query) && !searching;

  // Build a unified navigable item count: local results + nationwide suggestions + fallback button
  const localResults = results.filter((r) => r.id !== "__no_result__" && r.id !== "__error__");
  const showFallbackButton = showNationwide && suggestions.length === 0 && !loadingSuggestions;
  const totalNavItems = localResults.length + suggestions.length + (showFallbackButton ? 1 : 0);

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

  // Debounced nationwide suggestions (fires when address-like query + few local results)
  useEffect(() => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);

    if (!looksLikeAddress(query) || query.length < 6) {
      setSuggestions([]);
      return;
    }

    setLoadingSuggestions(true);
    suggestDebounceRef.current = setTimeout(async () => {
      const s = await fetchSuggestions(query);
      setSuggestions(s);
      setLoadingSuggestions(false);
    }, 500);

    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
  }, [query]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const handleSelect = useCallback(
    (href: string) => {
      setQuery("");
      closeDropdown();
      resetSessionToken();
      inputRef.current?.blur();
      router.push(href);
    },
    [router, closeDropdown]
  );

  // Nationwide PropertyRadar lookup
  const handleNationwideLookup = useCallback(async (addressOverride?: string) => {
    if (lookingUp) return;
    setLookingUp(true);
    try {
      const res = await fetch("/api/property-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addressOverride ?? query }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.property) {
        // Store result in sessionStorage for the preview modal to pick up
        sessionStorage.setItem("propertyPreview", JSON.stringify(data.property));
        setQuery("");
        closeDropdown();
        resetSessionToken();
        inputRef.current?.blur();
        // Navigate to a special preview route or dispatch a custom event
        window.dispatchEvent(new CustomEvent("open-property-preview", { detail: data.property }));
      } else {
        // No result — show inline feedback
        setResults([]);
        setLookingUp(false);
        // Briefly show an error in the dropdown
        setResults([{
          id: "__no_result__",
          kind: "contact",
          primary: "No property found",
          secondary: data.error ?? "PropertyRadar returned no results for this address",
          href: "#",
          status: undefined,
        }]);
        // Re-focus input so user can immediately edit the address
        inputRef.current?.focus();
      }
    } catch {
      setResults([{
        id: "__error__",
        kind: "contact",
        primary: "Lookup failed",
        secondary: "Network error — check console",
        href: "#",
        status: undefined,
      }]);
      inputRef.current?.focus();
    }
    setLookingUp(false);
  }, [query, lookingUp, closeDropdown]);

  useEffect(() => {
    setActiveIndex(-1);
    // Clear error/no-result entries on query change
    setResults((prev) =>
      prev.length > 0 && (prev[0].id === "__no_result__" || prev[0].id === "__error__") ? [] : prev
    );
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
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, closeDropdown]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev < totalNavItems - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalNavItems - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < localResults.length) {
          // Local result selected
          const rec = localResults[activeIndex];
          if (rec.href !== "#") handleSelect(rec.href);
        } else if (activeIndex >= localResults.length && activeIndex < localResults.length + suggestions.length) {
          // Nationwide suggestion selected
          const suggestion = suggestions[activeIndex - localResults.length];
          handleNationwideLookup(suggestion.fullAddress);
        } else if (showFallbackButton && activeIndex === localResults.length + suggestions.length) {
          // Fallback "Look up" button selected
          handleNationwideLookup();
        } else if (totalNavItems === 0 && showNationwide) {
          // No navigable items but nationwide is visible — trigger lookup directly
          handleNationwideLookup();
        }
      } else if (e.key === "Escape") {
        closeDropdown();
        inputRef.current?.blur();
      }
    },
    [isOpen, activeIndex, totalNavItems, localResults, suggestions, showFallbackButton, showNationwide, handleSelect, handleNationwideLookup, closeDropdown]
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div
        className={cn(
          "flex items-center gap-2 h-9 px-3 border text-sm transition-all duration-100 w-full search-scan-line",
          isOpen
            ? "rounded-t-[12px] rounded-b-none bg-[rgb(8,8,16)] border-cyan/22 border-b-white/[0.06] shadow-[0_0_1px_rgba(0,229,255,0.6),0_0_4px_rgba(0,229,255,0.2),0_0_8px_rgba(0,229,255,0.08)]"
            : "rounded-[12px] bg-secondary/50 border-glass-border hover:bg-secondary/70"
        )}
      >
        <Search className={cn("h-3.5 w-3.5 shrink-0 transition-colors", open ? "text-cyan" : "text-muted-foreground")} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search anything in Sentinel..."
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
        {query ? (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="text-[11px] bg-white/[0.03] px-1.5 py-0.5 rounded-[6px] border border-white/[0.06] font-mono text-muted-foreground/70">
            Ctrl+K
          </kbd>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full left-0 right-0 z-50 rounded-b-[12px] rounded-t-none bg-[rgb(8,8,16)] border border-t-0 border-cyan/22 shadow-[0_4px_24px_rgba(0,0,0,0.6),0_0_8px_rgba(0,229,255,0.08)] overflow-hidden max-h-[min(480px,calc(100vh-200px))]"
          >
            {searching && results.length === 0 && suggestions.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            ) : results.length === 0 && suggestions.length === 0 && !showNationwide && !loadingSuggestions ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                {/* ── Local DB results ── */}
                {results.length > 0 && results[0].id !== "__no_result__" && results[0].id !== "__error__" && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                        In Your Pipeline
                      </span>
                    </div>
                    {results.map((rec, i) => {
                      const Icon = KIND_ICONS[rec.kind] ?? MapPin;
                      const isActive = i === activeIndex;

                      return (
                        <button
                          key={rec.id}
                          onMouseEnter={() => setActiveIndex(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (rec.href !== "#") handleSelect(rec.href);
                          }}
                          className={cn(
                            "flex items-center gap-3 w-full text-left px-3 py-2.5 transition-colors",
                            isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                          )}
                        >
                          <div
                            className={cn(
                              "h-7 w-7 rounded-md flex items-center justify-center shrink-0 border",
                              KIND_COLORS[rec.kind] ?? "bg-white/[0.04] border-white/[0.06] text-muted-foreground"
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
                              {rec.scoreLabel === "platinum" && (
                                <Flame className="h-2 w-2 inline mr-0.5" />
                              )}
                              {rec.score}
                            </span>
                          )}

                          {rec.status && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground border border-white/[0.06] shrink-0">
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
                  </>
                )}

                {/* ── Error / no-result inline messages ── */}
                {results.length > 0 && (results[0].id === "__no_result__" || results[0].id === "__error__") && (
                  <div className="px-4 py-4 text-center">
                    <p className="text-sm font-medium text-muted-foreground">{results[0].primary}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{results[0].secondary}</p>
                  </div>
                )}

                {/* ── Nationwide suggestions + fallback lookup ── */}
                {showNationwide && (
                  <>
                    <div className="border-t border-white/[0.04] px-3 pt-2 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                        {suggestions.length > 0 ? "Nationwide Matches" : "Nationwide Search"}
                      </span>
                      {loadingSuggestions && (
                        <Loader2 className="h-3 w-3 animate-spin inline ml-2 text-emerald-400/60" />
                      )}
                    </div>

                    {/* Show address suggestions when available */}
                    {suggestions.map((s, si) => {
                      const navIdx = localResults.length + si;
                      const isActive = navIdx === activeIndex;
                      return (
                      <button
                        key={s.placeId || s.fullAddress}
                        onMouseEnter={() => setActiveIndex(navIdx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleNationwideLookup(s.fullAddress);
                        }}
                        className={cn(
                          "flex items-center gap-3 w-full text-left px-3 py-2.5 transition-colors",
                          isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                        )}
                      >
                        <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                          {lookingUp ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MapPin className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            <HighlightMatch text={s.address} query={query} />
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[s.city, s.state, s.zip].filter(Boolean).join(", ")}
                          </p>
                        </div>
                        <ArrowRight className={cn("h-3 w-3 shrink-0 transition-colors", isActive ? "text-emerald-400/60" : "text-emerald-400/40")} />
                      </button>
                      );
                    })}

                    {/* Always show generic lookup button as fallback */}
                    {suggestions.length === 0 && !loadingSuggestions && (() => {
                      const navIdx = localResults.length;
                      const isFallbackActive = navIdx === activeIndex;
                      return (
                      <button
                        onMouseEnter={() => setActiveIndex(navIdx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleNationwideLookup();
                        }}
                        className={cn(
                          "flex items-center gap-3 w-full text-left px-3 py-3 transition-colors",
                          isFallbackActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                        )}
                      >
                        <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                          {lookingUp ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Globe className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-emerald-400">
                            {lookingUp ? "Looking up property..." : `Look up "${query}"`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Search any US property via PropertyRadar
                          </p>
                        </div>
                        <ArrowRight className={cn("h-3 w-3 shrink-0 transition-colors", isFallbackActive ? "text-emerald-400/60" : "text-emerald-400/40")} />
                      </button>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

            <div className="border-t border-white/[0.04] px-3 py-1.5 flex items-center gap-4 text-[11px] text-muted-foreground/60">
              <span>
                <kbd className="font-mono bg-white/[0.03] px-1 py-0.5 rounded-[4px] border border-white/[0.06]">↑↓</kbd> Navigate
              </span>
              <span>
                <kbd className="font-mono bg-white/[0.03] px-1 py-0.5 rounded-[4px] border border-white/[0.06]">↵</kbd> Open
              </span>
              <span>
                <kbd className="font-mono bg-white/[0.03] px-1 py-0.5 rounded-[4px] border border-white/[0.06]">Esc</kbd> Close
              </span>
              {results.length > 0 && results[0].id !== "__no_result__" && results[0].id !== "__error__" && (
                <span className="ml-auto text-cyan/40">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                </span>
              )}
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
