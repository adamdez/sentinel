"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Upload,
  AlertTriangle,
  Home,
  DollarSign,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { cn } from "@/lib/utils";

interface DossierRow {
  id: string;
  lead_id: string;
  status: string;
  situation_summary: string | null;
  likely_decision_maker: string | null;
  top_facts: unknown;
  recommended_call_angle: string | null;
  verification_checklist: unknown;
  source_links: unknown;
  reviewed_at?: string | null;
}

interface FactRow {
  id: string;
  fact_type: string;
  fact_value: string;
  confidence: string;
  review_status: string;
  created_at: string;
}

interface ArtifactRow {
  id: string;
  source_label: string | null;
  source_url: string | null;
  source_type: string | null;
  extracted_notes: string | null;
  created_at: string;
}

interface QueuePayload {
  items: Array<DossierRow & { leads?: unknown }>;
}

function parseTopFacts(raw: unknown): Array<{ text: string; confidence?: string; source?: string }> {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return { text: item };
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const text =
        (typeof o.fact === "string" && o.fact) ||
        (typeof o.text === "string" && o.text) ||
        (typeof o.summary === "string" && o.summary) ||
        JSON.stringify(item);
      const confidence = typeof o.confidence === "string" ? o.confidence : undefined;
      const source = typeof o.source === "string" ? o.source : undefined;
      return { text, confidence, source };
    }
    return { text: String(item) };
  });
}

function parseChecklist(raw: unknown): Array<{ item: string; verified: boolean }> {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        const item = typeof o.item === "string" ? o.item : "";
        const verified = Boolean(o.verified);
        return item ? { item, verified } : null;
      }
      return null;
    })
    .filter(Boolean) as Array<{ item: string; verified: boolean }>;
}

function parseSourceLinks(raw: unknown): Array<{ label: string; url: string }> {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        const label = typeof o.label === "string" ? o.label : "Source";
        const url = typeof o.url === "string" ? o.url : "";
        return url ? { label, url } : null;
      }
      return null;
    })
    .filter(Boolean) as Array<{ label: string; url: string }>;
}

function confidenceChipClass(c?: string): string {
  const x = (c ?? "").toLowerCase();
  if (x === "high") return "border-border/40 bg-muted/10 text-foreground";
  if (x === "medium") return "border-border/40 bg-muted/10 text-foreground";
  if (x === "low" || x === "unverified") return "border-border/35 bg-muted/10 text-foreground/90";
  return "border-overlay-15 bg-overlay-4 text-muted-foreground";
}

export function LeadDossierPanel({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);

  const dossierQuery = useQuery({
    queryKey: ["dossier", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/dossiers/${leadId}`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!res.ok) throw new Error("Failed to load dossier");
      const json = (await res.json()) as { dossier: DossierRow | null };
      return json.dossier;
    },
  });

  const proposedQuery = useQuery({
    queryKey: ["dossier-queue-proposed", leadId],
    queryFn: async () => {
      const res = await fetch("/api/dossiers/queue?status=proposed&limit=50", {
        headers: await sentinelAuthHeaders(false),
      });
      if (!res.ok) throw new Error("Failed to load proposed dossiers");
      const json = (await res.json()) as QueuePayload;
      const match = (json.items ?? []).find((i) => i.lead_id === leadId && i.status === "proposed");
      return match ?? null;
    },
  });

  const factsQuery = useQuery({
    queryKey: ["dossier-facts", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/dossiers/${leadId}/facts?limit=100`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!res.ok) throw new Error("Failed to load facts");
      const json = (await res.json()) as { facts: FactRow[] };
      return json.facts ?? [];
    },
  });

  const artifactsQuery = useQuery({
    queryKey: ["dossier-artifacts", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/dossiers/${leadId}/artifacts`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!res.ok) throw new Error("Failed to load artifacts");
      const json = (await res.json()) as { artifacts: ArtifactRow[] };
      return json.artifacts ?? [];
    },
  });

  const researchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/agents/research", {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({ leadId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Research request failed");
      return json as { ok?: boolean; runId?: string };
    },
    onSuccess: () => {
      toast.success("Research agent started");
      void qc.invalidateQueries({ queryKey: ["dossier-queue-proposed", leadId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const reviewMutation = useMutation({
    mutationFn: async (body: { dossier_id: string; status: "reviewed" | "flagged"; review_notes?: string }) => {
      const res = await fetch(`/api/dossiers/${leadId}/review`, {
        method: "PATCH",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Review failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Dossier updated");
      void qc.invalidateQueries({ queryKey: ["dossier", leadId] });
      void qc.invalidateQueries({ queryKey: ["dossier-queue-proposed", leadId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const promoteMutation = useMutation({
    mutationFn: async (dossier_id: string) => {
      const res = await fetch(`/api/dossiers/${leadId}/promote`, {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({ dossier_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Promote failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Dossier promoted to lead record");
      void qc.invalidateQueries({ queryKey: ["dossier", leadId] });
      void qc.invalidateQueries({ queryKey: ["dossier-queue-proposed", leadId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const loading =
    dossierQuery.isLoading || proposedQuery.isLoading;

  const active = dossierQuery.data;
  const proposed = proposedQuery.data;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading intelligence…
      </div>
    );
  }

  if (!active && !proposed) {
    return <DossierEmptyState leadId={leadId} researchMutation={researchMutation} />;
  }

  const display: DossierRow | null = proposed ?? active ?? null;
  if (!display) return null;

  const isProposed = Boolean(proposed);
  const status = display.status;
  const topFacts = parseTopFacts(display.top_facts);
  const checklist = parseChecklist(display.verification_checklist);
  const links = parseSourceLinks(display.source_links);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isProposed ? (
          <Badge className="border-border/40 bg-muted/15 text-foreground">Pending Review</Badge>
        ) : status === "promoted" ? (
          <Badge className="border-border/40 bg-muted/15 text-foreground">Promoted</Badge>
        ) : (
          <Badge className="border-border/40 bg-muted/15 text-foreground">Reviewed</Badge>
        )}
      </div>

      {isProposed && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1 bg-muted/90 hover:bg-muted"
            disabled={reviewMutation.isPending}
            onClick={() =>
              reviewMutation.mutate({ dossier_id: display.id, status: "reviewed" })
            }
          >
            {reviewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={reviewMutation.isPending}
            onClick={() =>
              reviewMutation.mutate({ dossier_id: display.id, status: "flagged" })
            }
          >
            {reviewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
            Reject
          </Button>
        </div>
      )}

      {!isProposed && status === "reviewed" && active?.id && (
        <Button
          size="sm"
          className="gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25"
          disabled={promoteMutation.isPending}
          onClick={() => promoteMutation.mutate(active.id)}
        >
          {promoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Promote to Lead
        </Button>
      )}

      <div>
        <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-1">Situation Summary</h4>
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {display.situation_summary ?? "—"}
        </p>
      </div>

      {display.recommended_call_angle ? (
        <div className="rounded-[10px] border border-primary/25 bg-primary/[0.06] px-3 py-2">
          <h4 className="text-sm uppercase tracking-wider text-primary/80 font-semibold mb-1">Recommended Call Angle</h4>
          <p className="text-sm text-foreground/90">{display.recommended_call_angle}</p>
        </div>
      ) : null}

      {display.likely_decision_maker ? (
        <div>
          <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Likely Decision Maker
          </h4>
          <p className="text-sm">{display.likely_decision_maker}</p>
        </div>
      ) : null}

      {topFacts.length > 0 && (
        <div>
          <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top Facts</h4>
          <div className="flex flex-wrap gap-2">
            {topFacts.slice(0, 8).map((f, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm max-w-full",
                  confidenceChipClass(f.confidence),
                )}
              >
                <span className="truncate">{f.text}</span>
                {f.confidence ? (
                  <span className="text-xs uppercase opacity-70 shrink-0">{f.confidence}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {checklist.length > 0 && (
        <div>
          <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Verification Checklist
          </h4>
          <ul className="space-y-1.5">
            {checklist.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={c.verified} readOnly className="mt-0.5 rounded border-overlay-20" />
                <span>{c.item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {links.length > 0 && (
        <div>
          <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">Source Links</h4>
          <div className="flex flex-col gap-1">
            {links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setArtifactsOpen((o) => !o)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {artifactsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Raw Artifacts ({artifactsQuery.data?.length ?? 0})
      </button>
      {artifactsOpen && (
        <div className="rounded-lg border border-overlay-6 bg-black/20 divide-y divide-overlay-4 max-h-56 overflow-y-auto">
          {(artifactsQuery.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground/50">No artifacts captured.</p>
          ) : (
            (artifactsQuery.data ?? []).map((a) => (
              <div key={a.id} className="p-3 text-sm space-y-1">
                <p className="font-medium text-foreground/80">{a.source_label ?? a.source_type ?? "Evidence"}</p>
                {a.source_url ? (
                  <a href={a.source_url} target="_blank" rel="noreferrer" className="text-primary/70 hover:text-primary break-all">
                    {a.source_url}
                  </a>
                ) : null}
                {a.extracted_notes ? (
                  <p className="text-muted-foreground/80 whitespace-pre-wrap">{a.extracted_notes}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setFactsOpen((o) => !o)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {factsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Fact Assertions ({factsQuery.data?.length ?? 0})
      </button>
      {factsOpen && (
        <div className="overflow-x-auto rounded-lg border border-overlay-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-overlay-6 bg-overlay-2 text-left text-muted-foreground">
                <th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Value</th>
                <th className="px-2 py-1.5">Confidence</th>
                <th className="px-2 py-1.5">Review</th>
              </tr>
            </thead>
            <tbody>
              {(factsQuery.data ?? []).map((f) => (
                <tr key={f.id} className="border-b border-overlay-4">
                  <td className="px-2 py-1.5 whitespace-nowrap">{f.fact_type}</td>
                  <td className="px-2 py-1.5 max-w-[220px] truncate" title={f.fact_value}>
                    {f.fact_value}
                  </td>
                  <td className="px-2 py-1.5">{f.confidence}</td>
                  <td className="px-2 py-1.5">{f.review_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Empty State with Property/Distress Context ──────────────────────────────

interface PropertyContext {
  address?: string;
  city?: string;
  state?: string;
  estimated_value?: number;
  equity_percent?: number;
  year_built?: number;
  property_type?: string;
}

interface DistressRow {
  id: string;
  event_type: string;
  severity: number;
  status: string;
  event_date: string | null;
}

function DossierEmptyState({
  leadId,
  researchMutation,
}: {
  leadId: string;
  researchMutation: ReturnType<typeof useMutation<{ ok?: boolean; runId?: string }, Error, void>>;
}) {
  const propertyQuery = useQuery({
    queryKey: ["dossier-empty-property", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/property`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { property?: PropertyContext | null };
      return json.property ?? null;
    },
  });

  const distressQuery = useQuery({
    queryKey: ["dossier-empty-distress", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/distress-events?limit=5`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { events?: DistressRow[] };
      return json.events ?? [];
    },
  });

  const prop = propertyQuery.data;
  const distress = distressQuery.data ?? [];
  const hasContext = prop || distress.length > 0;

  return (
    <div className="space-y-4">
      {/* CTA */}
      <div className="rounded-[12px] border border-overlay-8 bg-overlay-2 p-5 text-center space-y-3">
        <Brain className="h-7 w-7 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          {hasContext
            ? "No AI dossier yet. Property context shown below."
            : "No intelligence dossier yet."}
        </p>
        <Button
          size="sm"
          className="gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25"
          disabled={researchMutation.isPending}
          onClick={() => researchMutation.mutate()}
        >
          {researchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
          Request Research
        </Button>
      </div>

      {/* Property basics */}
      {prop && (
        <div className="rounded-[10px] border border-overlay-6 bg-overlay-2 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Home className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Property</span>
          </div>
          {prop.address && (
            <p className="text-sm text-foreground/80">
              {prop.address}{prop.city ? `, ${prop.city}` : ""}{prop.state ? ` ${prop.state}` : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {prop.estimated_value != null && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <DollarSign className="h-2.5 w-2.5" />
                AVM: ${(prop.estimated_value / 1000).toFixed(0)}k
              </span>
            )}
            {prop.equity_percent != null && (
              <span className="text-muted-foreground">
                Equity: {prop.equity_percent}%
              </span>
            )}
            {prop.year_built != null && (
              <span className="text-muted-foreground">Built: {prop.year_built}</span>
            )}
            {prop.property_type && (
              <span className="text-muted-foreground">{prop.property_type}</span>
            )}
          </div>
        </div>
      )}

      {/* Distress events */}
      {distress.length > 0 && (
        <div className="rounded-[10px] border border-overlay-6 bg-overlay-2 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-foreground/60" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground/60">Distress Signals</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {distress.map((d) => (
              <span
                key={d.id}
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                  d.status === "active"
                    ? "border-border/30 bg-muted/15 text-foreground/80"
                    : "border-border/20 bg-muted/5 text-muted-foreground/60",
                )}
              >
                {d.event_type.replace(/_/g, " ")}
                {d.severity > 0 && (
                  <span className="ml-1 opacity-50">S{d.severity}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
