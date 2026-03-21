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
  return "border-white/15 bg-white/[0.04] text-muted-foreground";
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
    return (
      <div className="rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-6 text-center space-y-3">
        <Brain className="h-8 w-8 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          No intelligence dossier yet. Run Research Agent to generate one.
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
    );
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
        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Situation Summary</h4>
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {display.situation_summary ?? "—"}
        </p>
      </div>

      {display.recommended_call_angle ? (
        <div className="rounded-[10px] border border-primary/25 bg-primary/[0.06] px-3 py-2">
          <h4 className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold mb-1">Recommended Call Angle</h4>
          <p className="text-sm text-foreground/90">{display.recommended_call_angle}</p>
        </div>
      ) : null}

      {display.likely_decision_maker ? (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Likely Decision Maker
          </h4>
          <p className="text-sm">{display.likely_decision_maker}</p>
        </div>
      ) : null}

      {topFacts.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top Facts</h4>
          <div className="flex flex-wrap gap-2">
            {topFacts.slice(0, 8).map((f, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] max-w-full",
                  confidenceChipClass(f.confidence),
                )}
              >
                <span className="truncate">{f.text}</span>
                {f.confidence ? (
                  <span className="text-[9px] uppercase opacity-70 shrink-0">{f.confidence}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {checklist.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Verification Checklist
          </h4>
          <ul className="space-y-1.5">
            {checklist.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={c.verified} readOnly className="mt-0.5 rounded border-white/20" />
                <span>{c.item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {links.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Source Links</h4>
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
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {artifactsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Raw Artifacts ({artifactsQuery.data?.length ?? 0})
      </button>
      {artifactsOpen && (
        <div className="rounded-lg border border-white/[0.06] bg-black/20 divide-y divide-white/[0.04] max-h-56 overflow-y-auto">
          {(artifactsQuery.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground/50">No artifacts captured.</p>
          ) : (
            (artifactsQuery.data ?? []).map((a) => (
              <div key={a.id} className="p-3 text-[11px] space-y-1">
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
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {factsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Fact Assertions ({factsQuery.data?.length ?? 0})
      </button>
      {factsOpen && (
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left text-muted-foreground">
                <th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Value</th>
                <th className="px-2 py-1.5">Confidence</th>
                <th className="px-2 py-1.5">Review</th>
              </tr>
            </thead>
            <tbody>
              {(factsQuery.data ?? []).map((f) => (
                <tr key={f.id} className="border-b border-white/[0.04]">
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
