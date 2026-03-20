"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Search, ArrowRight } from "lucide-react";
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
        <Link href="/leads" className="text-[11px] text-muted-foreground hover:text-cyan transition-colors">
          ← Back to leads
        </Link>
      </div>

      <GlassCard hover={false} className="mb-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-cyan" />
          Search
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase text-muted-foreground">Address</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Spokane"
              className="mt-1 bg-white/[0.03] border-white/[0.08]"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">APN</label>
            <Input value={apn} onChange={(e) => setApn(e.target.value)} className="mt-1 bg-white/[0.03] border-white/[0.08]" />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">County</label>
            <Input value={county} onChange={(e) => setCounty(e.target.value)} className="mt-1 bg-white/[0.03] border-white/[0.08]" />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">State</label>
            <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="WA" className="mt-1 bg-white/[0.03] border-white/[0.08]" />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">ZIP</label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} className="mt-1 bg-white/[0.03] border-white/[0.08]" />
          </div>
        </div>
        <Button
          className="mt-4 gap-2 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25"
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
              <span className="text-[10px] uppercase text-muted-foreground mr-1">Sources</span>
              {lookupResult.configuredProviders.map((p) => (
                <Badge key={p} variant="outline" className="text-[9px]">
                  {p}
                </Badge>
              ))}
            </div>
          )}

          {lookupResult.existingProperty && (
            <GlassCard hover={false} className="border-cyan/20">
              <p className="text-xs font-semibold text-cyan mb-1">Already in Sentinel</p>
              <p className="text-sm">{formatAddress(lookupResult.existingProperty)}</p>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">Property ID: {lookupResult.existingProperty.id}</p>
            </GlassCard>
          )}

          {lookupResult.existingLead && (
            <GlassCard hover={false} className="border-emerald-500/20">
              <Badge className="mb-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-200">Existing Lead</Badge>
              <p className="text-sm font-mono text-xs">Lead ID: {lookupResult.existingLead.id}</p>
              <Link href="/leads" className="inline-flex items-center gap-1 text-xs text-cyan mt-2 hover:underline">
                Open Leads <ArrowRight className="h-3 w-3" />
              </Link>
            </GlassCard>
          )}

          {(lookupResult.providerResults ?? []).map((row) => (
            <GlassCard key={`${row.provider}-${row.fetchedAt}`} hover={false}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold capitalize">{row.provider}</h4>
                {row.cached ? (
                  <Badge variant="outline" className="text-[9px]">
                    cached
                  </Badge>
                ) : null}
              </div>
              {row.facts && row.facts.length > 0 ? (
                <ul className="text-[11px] space-y-1 mb-2">
                  {row.facts.slice(0, 12).map((f, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="text-foreground/80">{f.fieldName}:</span> {String(f.value)}
                      <span className="text-[9px] opacity-50 ml-1">({f.confidence})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <pre className="text-[10px] font-mono text-muted-foreground/90 overflow-x-auto max-h-40 overflow-y-auto bg-black/20 rounded-md p-2 border border-white/[0.04]">
                {JSON.stringify(row.rawPayload, null, 2)}
              </pre>
            </GlassCard>
          ))}

          {lookupResult.providerErrors && lookupResult.providerErrors.length > 0 && (
            <GlassCard hover={false} className="border-amber-500/25">
              <p className="text-xs font-semibold text-amber-200 mb-2">Provider errors</p>
              <ul className="text-[11px] text-muted-foreground space-y-1">
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
                  <label className="text-[10px] uppercase text-muted-foreground">Next action *</label>
                  <Input
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="e.g. Call seller — verify motivation"
                    className="mt-1 mb-2 bg-white/[0.03] border-white/[0.08]"
                  />
                  <label className="text-[10px] uppercase text-muted-foreground">Owner name (optional)</label>
                  <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1 mb-2 bg-white/[0.03] border-white/[0.08]" />
                  <label className="text-[10px] uppercase text-muted-foreground">Notes (optional)</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 mb-3 bg-white/[0.03] border-white/[0.08]" />
                  <div className="flex gap-2">
                    <Button
                      disabled={!nextAction.trim() || promoteMutation.isPending}
                      className="gap-2 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25"
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
