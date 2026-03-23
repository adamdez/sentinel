"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, MapPin, Search, ArrowRight, Home, User, Banknote,
  CalendarDays, ChevronDown, AlertTriangle, Shield, CheckCircle2,
  XCircle, HelpCircle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface AddressSuggestion {
  id: string;
  address: string;
  apn: string | null;
  county: string | null;
  state: string | null;
  zip: string | null;
}

interface ProviderFact {
  fieldName: string;
  value: string | number | boolean | null;
  confidence: string;
}

interface ProviderResult {
  provider: string;
  rawPayload: Record<string, unknown>;
  facts: ProviderFact[];
  cached: boolean;
  fetchedAt: string;
}

interface LookupResponse {
  ok: boolean;
  existingProperty?: {
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    apn: string | null;
  } | null;
  existingLead?: { id: string; status?: string; next_action?: string; owner_name?: string } | null;
  configuredProviders?: string[];
  providerResults?: ProviderResult[];
  providerErrors?: Array<{ provider: string; code: string; message: string; retryable: boolean }>;
}

// ── Autocomplete hook ────────────────────────────────────────────────────────

function useAddressAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("properties")
          .select("id, address, apn, county, state, zip")
          .ilike("address", `%${trimmed}%`)
          .limit(8);
        if (!error && data) setSuggestions(data as AddressSuggestion[]);
      } catch {
        // non-fatal autocomplete failure
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const clear = useCallback(() => setSuggestions([]), []);
  return { suggestions, loading, clear };
}

// ── Merged summary helpers ───────────────────────────────────────────────────

interface MergedFact {
  label: string;
  value: string;
  confidence: string;
  providers: string[];
  contradiction: boolean;
}

const DECISION_FIELDS: Record<string, { label: string; priority: number; format?: (v: string | number | boolean) => string }> = {
  owner_name:       { label: "Owner", priority: 1 },
  owner_first_name: { label: "Owner First", priority: 2 },
  owner_last_name:  { label: "Owner Last", priority: 3 },
  owner_occupied:   { label: "Owner Occupied", priority: 10, format: (v) => v ? "Yes" : "No" },
  absentee:         { label: "Absentee", priority: 11, format: (v) => v ? "Yes" : "No" },
  mailing_address:  { label: "Mailing Address", priority: 12 },
  estimated_value:  { label: "Est. Value", priority: 20, format: fmtCurrency },
  avm:              { label: "AVM", priority: 21, format: fmtCurrency },
  assessed_value:   { label: "Assessed", priority: 22, format: fmtCurrency },
  equity_percent:   { label: "Equity", priority: 23, format: (v) => `${v}%` },
  equity:           { label: "Equity $", priority: 24, format: fmtCurrency },
  loan_balance:     { label: "Loan Balance", priority: 25, format: fmtCurrency },
  last_sale_price:  { label: "Last Sale", priority: 30, format: fmtCurrency },
  last_sale_date:   { label: "Sale Date", priority: 31 },
  years_owned:      { label: "Years Owned", priority: 32 },
  property_type:    { label: "Type", priority: 40 },
  bedrooms:         { label: "Beds", priority: 41 },
  bathrooms:        { label: "Baths", priority: 42 },
  sqft:             { label: "Sqft", priority: 43, format: (v) => Number(v).toLocaleString() },
  year_built:       { label: "Built", priority: 44 },
  lot_acres:        { label: "Lot (ac)", priority: 45 },
  foreclosure:      { label: "Foreclosure", priority: 50, format: (v) => v ? "Yes" : "No" },
  pre_foreclosure:  { label: "Pre-Foreclosure", priority: 51, format: (v) => v ? "Yes" : "No" },
  tax_lien:         { label: "Tax Lien", priority: 52, format: (v) => v ? "Yes" : "No" },
  bankruptcy:       { label: "Bankruptcy", priority: 53, format: (v) => v ? "Yes" : "No" },
  probate:          { label: "Probate", priority: 54, format: (v) => v ? "Yes" : "No" },
  vacant:           { label: "Vacant", priority: 55, format: (v) => v ? "Yes" : "No" },
  tax_amount:       { label: "Tax Amount", priority: 60, format: fmtCurrency },
};

function fmtCurrency(v: string | number | boolean): string {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(n)) return String(v);
  return "$" + n.toLocaleString();
}

function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s-]+/g, "_");
}

function buildMergedSummary(results: ProviderResult[]): {
  merged: MergedFact[];
  contradictions: Array<{ field: string; values: Array<{ value: string; provider: string; confidence: string }> }>;
  highConfidence: number;
  lowConfidence: number;
  totalFacts: number;
  distressSignals: MergedFact[];
} {
  const factMap = new Map<string, Array<{ value: string; provider: string; confidence: string; raw: string | number | boolean | null }>>();

  for (const result of results) {
    for (const fact of result.facts) {
      const key = normalizeFieldName(fact.fieldName);
      const arr = factMap.get(key) ?? [];
      arr.push({
        value: fact.value === null || fact.value === undefined ? "" : String(fact.value),
        provider: result.provider,
        confidence: fact.confidence,
        raw: fact.value,
      });
      factMap.set(key, arr);
    }
  }

  const merged: MergedFact[] = [];
  const contradictions: Array<{ field: string; values: Array<{ value: string; provider: string; confidence: string }> }> = [];
  let highConfidence = 0;
  let lowConfidence = 0;
  let totalFacts = 0;
  const distressSignals: MergedFact[] = [];

  for (const [key, entries] of factMap.entries()) {
    totalFacts++;
    const def = DECISION_FIELDS[key];
    const uniqueValues = [...new Set(entries.map((e) => e.value.toLowerCase()))];
    const isContradiction = uniqueValues.length > 1;

    if (isContradiction) {
      contradictions.push({ field: def?.label ?? key, values: entries.map((e) => ({ value: e.value, provider: e.provider, confidence: e.confidence })) });
    }

    const best = entries.sort((a, b) => {
      const confRank = (c: string) => c === "verified" ? 4 : c === "high" ? 3 : c === "medium" ? 2 : 1;
      return confRank(b.confidence) - confRank(a.confidence);
    })[0];

    const formatted = def?.format && best.raw != null ? def.format(best.raw) : (best.raw === null ? "N/A" : String(best.raw));

    if (best.confidence === "high" || best.confidence === "verified") highConfidence++;
    if (best.confidence === "low") lowConfidence++;

    const fact: MergedFact = {
      label: def?.label ?? key,
      value: formatted,
      confidence: best.confidence,
      providers: entries.map((e) => e.provider),
      contradiction: isContradiction,
    };

    if (["foreclosure", "pre_foreclosure", "tax_lien", "bankruptcy", "probate", "vacant"].includes(key) && best.raw === true) {
      distressSignals.push(fact);
    }

    if (def) merged.push(fact);
  }

  merged.sort((a, b) => {
    const pa = Object.entries(DECISION_FIELDS).find(([, v]) => v.label === a.label)?.[1].priority ?? 999;
    const pb = Object.entries(DECISION_FIELDS).find(([, v]) => v.label === b.label)?.[1].priority ?? 999;
    return pa - pb;
  });

  return { merged, contradictions, highConfidence, lowConfidence, totalFacts, distressSignals };
}

// ── Per-field confidence indicator ───────────────────────────────────────────

function ConfDot({ conf }: { conf: string }) {
  const color = conf === "verified" || conf === "high" ? "text-emerald-400" : conf === "medium" ? "text-amber-400" : "text-red-400";
  const glyph = conf === "high" || conf === "verified" ? "●" : conf === "medium" ? "◐" : "○";
  return <span className={`text-xs ${color}`}>{glyph}</span>;
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PropertyLookupPage() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [apn, setApn] = useState("");
  const [county, setCounty] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const [showSuggestions, setShowSuggestions] = useState(false);
  const { suggestions, loading: suggestionsLoading, clear: clearSuggestions } = useAddressAutocomplete(address);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectSuggestion(s: AddressSuggestion) {
    setAddress(s.address);
    if (s.apn) setApn(s.apn);
    if (s.county) setCounty(s.county);
    if (s.state) setState(s.state);
    if (s.zip) setZip(s.zip);
    setShowSuggestions(false);
    clearSuggestions();
  }

  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [nextAction, setNextAction] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [notes, setNotes] = useState("");

  const lookupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/properties/lookup", {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({
          address: address.trim() || undefined,
          apn: apn.trim() || undefined,
          county: county.trim() || undefined,
          state: state.trim() || undefined,
          zip: zip.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Lookup failed");
      return json as LookupResponse;
    },
    onSuccess: (data) => {
      setLookupResult(data);
      setPromoteOpen(false);
      toast.success("Lookup complete");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lookup failed"),
  });

  const promoteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/properties/promote-to-lead", {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({
          propertyId: lookupResult?.existingProperty?.id,
          address: lookupResult?.existingProperty?.address ?? address.trim(),
          city: lookupResult?.existingProperty?.city ?? undefined,
          state: lookupResult?.existingProperty?.state ?? (state.trim() || undefined),
          zip: lookupResult?.existingProperty?.zip ?? (zip.trim() || undefined),
          county: lookupResult?.existingProperty?.county ?? (county.trim() || undefined),
          apn: lookupResult?.existingProperty?.apn ?? (apn.trim() || undefined),
          ownerName: ownerName.trim() || undefined,
          source: "manual_lookup",
          notes: notes.trim() || undefined,
          nextAction: nextAction.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Promote failed");
      return json as { ok: boolean; leadId: string; created: boolean };
    },
    onSuccess: (data) => {
      toast.success(data.created ? "Lead created — opening queue" : "Lead already exists");
      router.push("/leads");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Promote failed"),
  });

  const canPromote =
    lookupResult?.ok &&
    !lookupResult.existingLead &&
    (lookupResult.existingProperty || address.trim().length > 0);

  const summary = useMemo(() => {
    if (!lookupResult?.providerResults) return null;
    return buildMergedSummary(lookupResult.providerResults);
  }, [lookupResult]);

  const ownerFacts = useMemo(() => summary?.merged.filter((f) =>
    ["Owner", "Owner First", "Owner Last", "Owner Occupied", "Absentee", "Mailing Address"].includes(f.label)
  ) ?? [], [summary]);

  const financialFacts = useMemo(() => summary?.merged.filter((f) =>
    ["Est. Value", "AVM", "Assessed", "Equity", "Equity $", "Loan Balance", "Last Sale", "Sale Date", "Years Owned", "Tax Amount"].includes(f.label)
  ) ?? [], [summary]);

  const propertyFacts = useMemo(() => summary?.merged.filter((f) =>
    ["Type", "Beds", "Baths", "Sqft", "Built", "Lot (ac)"].includes(f.label)
  ) ?? [], [summary]);

  const hasResult = lookupResult !== null;
  const existingProp = lookupResult?.existingProperty;
  const existingLead = lookupResult?.existingLead;
  const providerResults = lookupResult?.providerResults ?? [];
  const providerErrors = lookupResult?.providerErrors ?? [];

  return (
    <PageShell
      title="Property Research"
      description="Search, review, decide — promote to a working lead when ready."
    >
      {/* ── Search ────────────────────────────────────────────── */}
      <GlassCard hover={false} className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-3 relative" ref={suggestionsRef}>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Address</label>
            <Input
              value={address}
              onChange={(e) => { setAddress(e.target.value); setShowSuggestions(true); }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              placeholder="123 Main St, Spokane"
              className="mt-1 bg-overlay-3 border-overlay-8"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border/20 bg-background shadow-lg max-h-56 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-overlay-6 transition-colors border-b border-border/10 last:border-b-0"
                    onClick={() => selectSuggestion(s)}
                  >
                    <span className="text-foreground">{s.address}</span>
                    {(s.county || s.state || s.zip) && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {[s.county, s.state, s.zip].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && suggestionsLoading && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border/20 bg-background shadow-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Searching...</span>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">APN</label>
            <Input value={apn} onChange={(e) => setApn(e.target.value)} className="mt-1 bg-overlay-3 border-overlay-8" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">County</label>
            <Input value={county} onChange={(e) => setCounty(e.target.value)} className="mt-1 bg-overlay-3 border-overlay-8" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 items-end">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">State</label>
            <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="WA" className="mt-1 bg-overlay-3 border-overlay-8" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">ZIP</label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} className="mt-1 bg-overlay-3 border-overlay-8" />
          </div>
          <div className="md:col-span-3 flex items-end">
            <Button
              className="gap-2 bg-primary text-primary-foreground border border-overlay-15 hover:opacity-95"
              disabled={lookupMutation.isPending || (!address.trim() && !apn.trim())}
              onClick={() => lookupMutation.mutate()}
            >
              {lookupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Look Up
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* ── Loading state ─────────────────────────────────────── */}
      {lookupMutation.isPending && (
        <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Querying providers...
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────── */}
      {lookupMutation.isError && !hasResult && (
        <GlassCard hover={false} className="border-red-500/20 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-red-300">
              Lookup failed — {lookupMutation.error instanceof Error ? lookupMutation.error.message : "unknown error"}
            </span>
          </div>
        </GlassCard>
      )}

      {/* ── Results ───────────────────────────────────────────── */}
      {hasResult && lookupResult.ok && (
        <div className="space-y-4">

          {/* ── Already in Sentinel ──────────────────────────── */}
          {existingLead && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/[0.04] px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-primary">Already a working lead</p>
                    <p className="text-xs text-muted-foreground">
                      {existingLead.status && <span className="capitalize">{existingLead.status}</span>}
                      {existingLead.next_action && <span> — {existingLead.next_action}</span>}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/leads?open=${existingLead.id}`}
                  className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors shrink-0"
                >
                  Open Lead <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {existingProp && !existingLead && (
            <div className="rounded-lg border border-border/20 bg-muted/[0.04] px-4 py-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">In Sentinel — not yet a lead</p>
                  <p className="text-xs text-muted-foreground">{formatAddress(existingProp)}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Property Summary ─────────────────────────────── */}
          {summary && summary.merged.length > 0 && (
            <GlassCard hover={false}>
              {/* Address header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {existingProp?.address ?? address}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {[
                      existingProp?.county ?? county,
                      existingProp?.state ?? state,
                      existingProp?.zip ?? zip,
                      existingProp?.apn ? `APN ${existingProp.apn}` : apn ? `APN ${apn}` : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {lookupResult.configuredProviders && lookupResult.configuredProviders.length > 0 && (
                  <div className="flex flex-wrap gap-1 shrink-0">
                    {lookupResult.configuredProviders.map((p) => (
                      <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Distress signals — highly visible */}
              {summary.distressSignals.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {summary.distressSignals.map((d) => (
                    <span key={d.label} className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-2 py-1 text-xs font-semibold text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      {d.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Ownership snapshot */}
              {ownerFacts.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground/50 font-bold mb-1.5 flex items-center gap-1.5">
                    <User className="h-3 w-3" /> Ownership
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
                    {ownerFacts.map((f) => (
                      <FactRow key={f.label} fact={f} />
                    ))}
                  </div>
                </div>
              )}

              {/* Financial snapshot */}
              {financialFacts.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground/50 font-bold mb-1.5 flex items-center gap-1.5">
                    <Banknote className="h-3 w-3" /> Financial
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
                    {financialFacts.map((f) => (
                      <FactRow key={f.label} fact={f} />
                    ))}
                  </div>
                </div>
              )}

              {/* Property details */}
              {propertyFacts.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground/50 font-bold mb-1.5 flex items-center gap-1.5">
                    <Home className="h-3 w-3" /> Property
                  </p>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-1">
                    {propertyFacts.map((f) => (
                      <FactRow key={f.label} fact={f} compact />
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* ── Confidence & Gaps ────────────────────────────── */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Confidence overview */}
              <GlassCard hover={false} className="!py-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground/50 font-bold mb-2 flex items-center gap-1.5">
                  <Shield className="h-3 w-3" /> Data Confidence
                </p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-muted-foreground">{summary.highConfidence} high</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    <span className="text-muted-foreground">{summary.lowConfidence} low</span>
                  </span>
                  <span className="text-muted-foreground/40 text-xs">{summary.totalFacts} total facts</span>
                </div>
                {summary.contradictions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-overlay-4">
                    <p className="text-xs text-amber-400 font-semibold mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {summary.contradictions.length} contradiction{summary.contradictions.length !== 1 ? "s" : ""}
                    </p>
                    {summary.contradictions.map((c) => (
                      <div key={c.field} className="text-xs text-muted-foreground mb-1">
                        <span className="text-foreground/70">{c.field}:</span>{" "}
                        {c.values.map((v, i) => (
                          <span key={i}>
                            {i > 0 && " vs "}
                            <span className="text-foreground/80">{v.value}</span>
                            <span className="text-muted-foreground/40"> ({v.provider})</span>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* What's missing */}
              <GlassCard hover={false} className="!py-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground/50 font-bold mb-2 flex items-center gap-1.5">
                  <HelpCircle className="h-3 w-3" /> What We Still Need
                </p>
                <MissingFactsList merged={summary.merged} />
              </GlassCard>
            </div>
          )}

          {/* ── Promote to Lead ───────────────────────────────── */}
          {canPromote && (
            <GlassCard hover={false} className="border-primary/15">
              {!promoteOpen ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Ready to work this property?</p>
                    <p className="text-xs text-muted-foreground">Promotion creates a working lead. Skip trace and deeper research happen after promotion.</p>
                  </div>
                  <Button
                    onClick={() => setPromoteOpen(true)}
                    className="gap-2 bg-primary text-primary-foreground border border-overlay-15 hover:opacity-95 shrink-0"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Promote to Lead
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Promote to Lead</p>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Next Action <span className="text-amber-400">*</span>
                    </label>
                    <Input
                      value={nextAction}
                      onChange={(e) => setNextAction(e.target.value)}
                      placeholder="e.g. Call seller — verify motivation"
                      className="mt-1 bg-overlay-3 border-overlay-8"
                    />
                    {!nextAction.trim() && (
                      <p className="text-xs text-amber-400/70 mt-1">Required — no lead advances without a next action</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Owner name</label>
                      <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1 bg-overlay-3 border-overlay-8" />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Notes</label>
                      <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 bg-overlay-3 border-overlay-8" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={!nextAction.trim() || promoteMutation.isPending}
                      className="gap-2 bg-primary text-primary-foreground border border-overlay-15 hover:opacity-95"
                      onClick={() => promoteMutation.mutate()}
                    >
                      {promoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Create Lead
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPromoteOpen(false)} className="text-muted-foreground">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* ── Provider errors ───────────────────────────────── */}
          {providerErrors.length > 0 && (
            <GlassCard hover={false} className="border-red-500/15 !py-3">
              <p className="text-xs font-semibold text-red-300 mb-1 flex items-center gap-1.5">
                <XCircle className="h-3 w-3" />
                {providerErrors.length} provider error{providerErrors.length !== 1 ? "s" : ""}
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {providerErrors.map((e, i) => (
                  <li key={i}>
                    <span className="text-foreground/70">{e.provider}</span> — {e.message}
                    {e.retryable && <span className="text-muted-foreground/40 ml-1">(retryable)</span>}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {/* ── Provider Detail (demoted) ─────────────────────── */}
          {providerResults.length > 0 && (
            <ProviderDetailSection results={providerResults} />
          )}
        </div>
      )}

      {/* ── No results state ──────────────────────────────────── */}
      {hasResult && !lookupResult.ok && (
        <GlassCard hover={false} className="mt-4 border-amber-500/15">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-muted-foreground">Lookup completed but returned no usable data. Try a different address or check provider configuration.</span>
          </div>
        </GlassCard>
      )}
    </PageShell>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function FactRow({ fact, compact }: { fact: MergedFact; compact?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", compact ? "py-0" : "py-0.5")}>
      <span className={cn("text-muted-foreground truncate", compact ? "text-xs" : "text-sm")}>{fact.label}</span>
      <span className={cn("font-medium text-foreground shrink-0 tabular-nums flex items-center gap-1", compact ? "text-xs" : "text-sm")}>
        {fact.contradiction && <AlertTriangle className="h-2.5 w-2.5 text-amber-400 shrink-0" />}
        {fact.value}
        <ConfDot conf={fact.confidence} />
      </span>
    </div>
  );
}

function MissingFactsList({ merged }: { merged: MergedFact[] }) {
  const presentKeys = new Set(merged.map((f) => f.label));

  const criticalMissing: string[] = [];
  const wantedFields = [
    { label: "Owner", critical: true },
    { label: "Est. Value", critical: true },
    { label: "Equity", critical: true },
    { label: "Last Sale", critical: false },
    { label: "Years Owned", critical: false },
    { label: "Owner Occupied", critical: false },
    { label: "Absentee", critical: false },
    { label: "Mailing Address", critical: false },
    { label: "Tax Amount", critical: false },
  ];

  const missing: string[] = [];
  for (const w of wantedFields) {
    if (!presentKeys.has(w.label)) {
      if (w.critical) criticalMissing.push(w.label);
      else missing.push(w.label);
    }
  }

  if (criticalMissing.length === 0 && missing.length === 0) {
    return (
      <p className="text-xs text-emerald-400/70 flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> Key decision fields present
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {criticalMissing.length > 0 && (
        <div>
          <p className="text-xs text-amber-400/80 font-medium mb-0.5">Critical gaps</p>
          <div className="flex flex-wrap gap-1.5">
            {criticalMissing.map((f) => (
              <span key={f} className="text-xs px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/[0.06] text-amber-300">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
      {missing.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground/50 font-medium mb-0.5">Nice to have</p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((f) => (
              <span key={f} className="text-xs px-1.5 py-0.5 rounded border border-border/15 text-muted-foreground/50">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderDetailSection({ results }: { results: ProviderResult[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-overlay-4 pt-3 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors w-full"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        {expanded ? "Hide" : "Show"} provider detail ({results.length} source{results.length !== 1 ? "s" : ""})
      </button>
      {expanded && (
        <div className="space-y-3 mt-3">
          {results.map((row) => (
            <ProviderResultCard key={`${row.provider}-${row.fetchedAt}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

const FACT_CATEGORIES: Record<string, { icon: typeof Home; label: string; fields: string[] }> = {
  property: {
    icon: Home, label: "Property",
    fields: ["property_type", "bedrooms", "bathrooms", "sqft", "lot_size", "year_built", "lot_acres", "stories", "garage"],
  },
  owner: {
    icon: User, label: "Owner",
    fields: ["owner_name", "owner_first_name", "owner_last_name", "owner_type", "owner_occupied", "absentee", "mailing_address", "owner_age"],
  },
  financial: {
    icon: Banknote, label: "Financial",
    fields: ["estimated_value", "avm", "assessed_value", "tax_amount", "equity_percent", "loan_balance", "loan_amount", "mortgage_amount", "equity"],
  },
  transaction: {
    icon: CalendarDays, label: "Transaction",
    fields: ["last_sale_date", "last_sale_price", "transfer_date", "transfer_type", "recording_date", "years_owned"],
  },
  distress: {
    icon: AlertTriangle, label: "Distress Signals",
    fields: ["foreclosure", "pre_foreclosure", "tax_lien", "bankruptcy", "probate", "vacant", "code_violation", "lis_pendens"],
  },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-red-400",
  verified: "text-emerald-400",
};

function formatFactValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (value >= 1000) return "$" + value.toLocaleString();
    return String(value);
  }
  return String(value);
}

function ProviderResultCard({ row }: { row: ProviderResult }) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const facts = row.facts ?? [];

  const categorized = new Map<string, typeof facts>();
  const uncategorized: typeof facts = [];

  for (const fact of facts) {
    const fn = fact.fieldName.toLowerCase().replace(/\s+/g, "_");
    let placed = false;
    for (const [cat, def] of Object.entries(FACT_CATEGORIES)) {
      if (def.fields.some((f) => fn.includes(f) || f.includes(fn))) {
        const arr = categorized.get(cat) ?? [];
        arr.push(fact);
        categorized.set(cat, arr);
        placed = true;
        break;
      }
    }
    if (!placed) uncategorized.push(fact);
  }

  return (
    <GlassCard hover={false}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-muted-foreground/50" />
          <h4 className="text-sm font-semibold capitalize">{row.provider}</h4>
        </div>
        <div className="flex items-center gap-2">
          {row.cached && <Badge variant="outline" className="text-[10px]">cached</Badge>}
          <Badge variant="outline" className="text-[10px]">{facts.length} facts</Badge>
        </div>
      </div>

      {facts.length > 0 ? (
        <div className="space-y-3">
          {Array.from(categorized.entries()).map(([catKey, catFacts]) => {
            const cfg = FACT_CATEGORIES[catKey];
            if (!cfg) return null;
            const CatIcon = cfg.icon;
            return (
              <div key={catKey}>
                <div className="flex items-center gap-1.5 mb-1">
                  <CatIcon className="h-3 w-3 text-muted-foreground/40" />
                  <p className="text-xs uppercase tracking-wider text-muted-foreground/40 font-medium">{cfg.label}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
                  {catFacts.map((f, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 py-0.5">
                      <span className="text-xs text-muted-foreground truncate">{f.fieldName}</span>
                      <span className="text-xs font-medium text-foreground shrink-0 tabular-nums">
                        {formatFactValue(f.value)}
                        <span className={`text-xs ml-1 ${CONFIDENCE_COLORS[f.confidence] ?? "text-muted-foreground/40"}`}>
                          {f.confidence === "high" ? "●" : f.confidence === "medium" ? "◐" : "○"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {uncategorized.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground/40 font-medium mb-1">Other</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5">
                {uncategorized.map((f, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 py-0.5">
                    <span className="text-xs text-muted-foreground truncate">{f.fieldName}</span>
                    <span className="text-xs font-medium text-foreground shrink-0 tabular-nums">
                      {formatFactValue(f.value)}
                      <span className={`text-xs ml-1 ${CONFIDENCE_COLORS[f.confidence] ?? "text-muted-foreground/40"}`}>
                        {f.confidence === "high" ? "●" : f.confidence === "medium" ? "◐" : "○"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/40">No structured facts from this provider.</p>
      )}

      <button
        onClick={() => setRawExpanded(!rawExpanded)}
        className="flex items-center gap-1 mt-3 pt-2 border-t border-overlay-4 text-xs text-muted-foreground/30 hover:text-muted-foreground transition-colors w-full"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", rawExpanded && "rotate-180")} />
        {rawExpanded ? "Hide" : "Show"} raw payload
      </button>
      {rawExpanded && (
        <pre className="text-xs font-mono text-muted-foreground/50 overflow-x-auto max-h-40 overflow-y-auto bg-black/20 rounded-md p-2 border border-overlay-4 mt-2">
          {JSON.stringify(row.rawPayload, null, 2)}
        </pre>
      )}
    </GlassCard>
  );
}

function formatAddress(p: NonNullable<LookupResponse["existingProperty"]>): string {
  const parts = [p.address, p.city, p.state, p.zip].filter(Boolean);
  return parts.length ? parts.join(", ") : p.id;
}
