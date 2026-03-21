"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Search, ArrowRight, Home, User, Banknote, CalendarDays, ChevronDown, AlertTriangle, Shield } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";

export default function PropertyLookupPage() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [apn, setApn] = useState("");
  const [county, setCounty] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

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
      toast.success(data.created ? "Lead created" : "Lead already exists");
      router.push("/leads");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const canPromote =
    lookupResult?.ok &&
    !lookupResult.existingLead &&
    (lookupResult.existingProperty || address.trim().length > 0);

  return (
    <PageShell
      title="Property lookup"
      description="Query configured providers without writing to CRM. Promote to a lead when you are ready."
    >
      <div className="mb-4">
        <Link href="/leads" className="text-sm text-muted-foreground hover:text-primary transition-colors">
          ← Back to leads
        </Link>
      </div>

      <GlassCard hover={false} className="mb-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Search
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-sm uppercase text-muted-foreground">Address</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Spokane"
              className="mt-1 bg-white/[0.03] border-white/[0.08]"
            />
          </div>
          <div>
            <label className="text-sm uppercase text-muted-foreground">APN</label>
            <Input value={apn} onChange={(e) => setApn(e.target.value)} className="mt-1 bg-white/[0.03] border-white/[0.08]" />
          </div>
          <div>
            <label className="text-sm uppercase text-muted-foreground">County</label>
            <Input value={county} onChange={(e) => setCounty(e.target.value)} className="mt-1 bg-white/[0.03] border-white/[0.08]" />
          </div>
          <div>
            <label className="text-sm uppercase text-muted-foreground">State</label>
            <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="WA" className="mt-1 bg-white/[0.03] border-white/[0.08]" />
          </div>
          <div>
            <label className="text-sm uppercase text-muted-foreground">ZIP</label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} className="mt-1 bg-white/[0.03] border-white/[0.08]" />
          </div>
        </div>
        <Button
          className="mt-4 gap-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25"
          disabled={lookupMutation.isPending || (!address.trim() && !apn.trim())}
          onClick={() => lookupMutation.mutate()}
        >
          {lookupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Look Up Property
        </Button>
      </GlassCard>

      {lookupResult && (
        <div className="space-y-4">
          {lookupResult.configuredProviders && lookupResult.configuredProviders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-sm uppercase text-muted-foreground mr-1">Sources</span>
              {lookupResult.configuredProviders.map((p) => (
                <Badge key={p} variant="outline" className="text-xs">
                  {p}
                </Badge>
              ))}
            </div>
          )}

          {lookupResult.existingProperty && (
            <GlassCard hover={false} className="border-primary/20">
              <p className="text-xs font-semibold text-primary mb-1">Already in Sentinel</p>
              <p className="text-sm">{formatAddress(lookupResult.existingProperty)}</p>
              <p className="text-sm text-muted-foreground mt-1 font-mono">Property ID: {lookupResult.existingProperty.id}</p>
            </GlassCard>
          )}

          {lookupResult.existingLead && (
            <GlassCard hover={false} className="border-border/20">
              <Badge className="mb-2 border-border/40 bg-muted/10 text-foreground">Existing Lead</Badge>
              <p className="text-sm font-mono text-xs">Lead ID: {lookupResult.existingLead.id}</p>
              <Link href="/leads" className="inline-flex items-center gap-1 text-xs text-primary mt-2 hover:underline">
                Open Leads <ArrowRight className="h-3 w-3" />
              </Link>
            </GlassCard>
          )}

          {(lookupResult.providerResults ?? []).map((row) => (
            <ProviderResultCard key={`${row.provider}-${row.fetchedAt}`} row={row} />
          ))}

          {lookupResult.providerErrors && lookupResult.providerErrors.length > 0 && (
            <GlassCard hover={false} className="border-border/25">
              <p className="text-xs font-semibold text-foreground mb-2">Provider errors</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {lookupResult.providerErrors.map((e, i) => (
                  <li key={i}>
                    <span className="text-foreground/80">{e.provider}</span> ({e.code}): {e.message}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {canPromote && (
            <div className="space-y-2">
              {!promoteOpen ? (
                <Button size="sm" variant="outline" onClick={() => setPromoteOpen(true)}>
                  Promote to Lead
                </Button>
              ) : (
                <GlassCard hover={false}>
                  <p className="text-xs text-muted-foreground mb-3">
                    New leads require a next action (stage machine).
                  </p>
                  <label className="text-sm uppercase text-muted-foreground">Next action *</label>
                  <Input
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="e.g. Call seller — verify motivation"
                    className="mt-1 mb-2 bg-white/[0.03] border-white/[0.08]"
                  />
                  <label className="text-sm uppercase text-muted-foreground">Owner name (optional)</label>
                  <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1 mb-2 bg-white/[0.03] border-white/[0.08]" />
                  <label className="text-sm uppercase text-muted-foreground">Notes (optional)</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 mb-3 bg-white/[0.03] border-white/[0.08]" />
                  <div className="flex gap-2">
                    <Button
                      disabled={!nextAction.trim() || promoteMutation.isPending}
                      className="gap-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25"
                      onClick={() => promoteMutation.mutate()}
                    >
                      {promoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Create lead
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPromoteOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </GlassCard>
              )}
            </div>
          )}
        </div>
      )}
    </PageShell>
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

function ProviderResultCard({ row }: { row: NonNullable<LookupResponse["providerResults"]>[number] }) {
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
          <Shield className="h-3.5 w-3.5 text-primary" />
          <h4 className="text-sm font-semibold capitalize">{row.provider}</h4>
        </div>
        <div className="flex items-center gap-2">
          {row.cached && <Badge variant="outline" className="text-xs">cached</Badge>}
          <Badge variant="outline" className="text-xs">{facts.length} facts</Badge>
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
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CatIcon className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{cfg.label}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                  {catFacts.map((f, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 py-0.5">
                      <span className="text-sm text-muted-foreground truncate">{f.fieldName}</span>
                      <span className="text-sm font-medium text-foreground shrink-0 tabular-nums">
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
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Other</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                {uncategorized.map((f, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 py-0.5">
                    <span className="text-sm text-muted-foreground truncate">{f.fieldName}</span>
                    <span className="text-sm font-medium text-foreground shrink-0 tabular-nums">
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
        <p className="text-sm text-muted-foreground/50">No structured facts extracted.</p>
      )}

      <button
        onClick={() => setRawExpanded(!rawExpanded)}
        className="flex items-center gap-1 mt-3 pt-2 border-t border-white/[0.04] text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors w-full"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${rawExpanded ? "rotate-180" : ""}`} />
        {rawExpanded ? "Hide" : "Show"} raw payload
      </button>
      {rawExpanded && (
        <pre className="text-xs font-mono text-muted-foreground/70 overflow-x-auto max-h-40 overflow-y-auto bg-black/20 rounded-md p-2 border border-white/[0.04] mt-2">
          {JSON.stringify(row.rawPayload, null, 2)}
        </pre>
      )}
    </GlassCard>
  );
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
  existingLead?: { id: string } | null;
  configuredProviders?: string[];
  providerResults?: Array<{
    provider: string;
    rawPayload: Record<string, unknown>;
    facts: Array<{
      fieldName: string;
      value: string | number | boolean | null;
      confidence: string;
    }>;
    cached: boolean;
    fetchedAt: string;
  }>;
  providerErrors?: Array<{ provider: string; code: string; message: string; retryable: boolean }>;
}

function formatAddress(p: NonNullable<LookupResponse["existingProperty"]>): string {
  const parts = [p.address, p.city, p.state, p.zip].filter(Boolean);
  return parts.length ? parts.join(", ") : p.id;
}
