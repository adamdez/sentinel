"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import type { NextOfKinCandidate, PeopleIntelHighlight, UnifiedResearchStatusResponse } from "@/lib/research-run-types";

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
  raw_ai_output?: Record<string, unknown> | null;
  reviewed_at?: string | null;
}

interface ArtifactRow {
  id: string;
  source_label: string | null;
  source_url: string | null;
  source_type: string | null;
  extracted_notes: string | null;
  created_at: string;
}

function parseTopFacts(raw: unknown): Array<{ text: string; confidence?: string }> {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return { text: item };
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const text = (typeof row.fact === "string" && row.fact)
        || (typeof row.text === "string" && row.text)
        || JSON.stringify(item);
      return {
        text,
        confidence: typeof row.confidence === "string" ? row.confidence : undefined,
      };
    }
    return { text: String(item) };
  });
}

function parseChecklist(raw: unknown): Array<{ item: string; verified: boolean }> {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (typeof row.item !== "string" || !row.item.trim()) return null;
      return {
        item: row.item.trim(),
        verified: Boolean(row.verified),
      };
    })
    .filter(Boolean) as Array<{ item: string; verified: boolean }>;
}

function parseSourceLinks(raw: unknown): Array<{ label: string; url: string }> {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (typeof row.url !== "string" || !row.url.trim()) return null;
      return {
        label: typeof row.label === "string" ? row.label : "Source",
        url: row.url,
      };
    })
    .filter(Boolean) as Array<{ label: string; url: string }>;
}

function parsePeopleIntel(display: DossierRow | null): {
  highlights: PeopleIntelHighlight[];
  nextOfKin: NextOfKinCandidate[];
} {
  const raw = display?.raw_ai_output;
  const researchRun = raw && typeof raw.research_run === "object"
    ? raw.research_run as Record<string, unknown>
    : null;
  const peopleIntel = researchRun?.people_intel && typeof researchRun.people_intel === "object"
    ? researchRun.people_intel as Record<string, unknown>
    : null;

  return {
    highlights: Array.isArray(peopleIntel?.highlights) ? peopleIntel?.highlights as PeopleIntelHighlight[] : [],
    nextOfKin: Array.isArray(peopleIntel?.next_of_kin) ? peopleIntel?.next_of_kin as NextOfKinCandidate[] : [],
  };
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return parsed.toLocaleString();
}

export function LeadDossierPanel({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [artifactsOpen, setArtifactsOpen] = useState(false);

  const dossierQuery = useQuery({
    queryKey: ["dossier", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/dossiers/${leadId}?include_proposed=true`, { headers: await sentinelAuthHeaders(false) });
      if (!res.ok) throw new Error("Failed to load dossier");
      return ((await res.json()) as { dossier: DossierRow | null }).dossier;
    },
  });

  const researchQuery = useQuery({
    queryKey: ["lead-research", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/research-run`, { headers: await sentinelAuthHeaders(false) });
      if (!res.ok) throw new Error("Failed to load research status");
      return (await res.json()) as UnifiedResearchStatusResponse;
    },
  });

  const artifactsQuery = useQuery({
    queryKey: ["dossier-artifacts", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/dossiers/${leadId}/artifacts`, { headers: await sentinelAuthHeaders(false) });
      if (!res.ok) throw new Error("Failed to load artifacts");
      return ((await res.json()) as { artifacts: ArtifactRow[] }).artifacts ?? [];
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/research-run`, {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Research run failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Research run completed");
      void qc.invalidateQueries({ queryKey: ["dossier", leadId] });
      void qc.invalidateQueries({ queryKey: ["lead-research", leadId] });
      void qc.invalidateQueries({ queryKey: ["dossier-artifacts", leadId] });
      void qc.invalidateQueries({ queryKey: ["legal-search", leadId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Research run failed"),
  });

  const reviewMutation = useMutation({
    mutationFn: async (body: { dossier_id: string; status: "reviewed" | "flagged" }) => {
      const res = await fetch(`/api/dossiers/${leadId}/review`, {
        method: "PATCH",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Review failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Dossier updated");
      void qc.invalidateQueries({ queryKey: ["dossier", leadId] });
      void qc.invalidateQueries({ queryKey: ["lead-research", leadId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed"),
  });

  const promoteMutation = useMutation({
    mutationFn: async (dossierId: string) => {
      const res = await fetch(`/api/dossiers/${leadId}/promote`, {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({ dossier_id: dossierId }),
      });
      if (!res.ok) throw new Error("Promote failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Dossier promoted to lead record");
      void qc.invalidateQueries({ queryKey: ["dossier", leadId] });
      void qc.invalidateQueries({ queryKey: ["lead-research", leadId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed"),
  });

  const display = dossierQuery.data ?? null;
  const topFacts = useMemo(() => parseTopFacts(display?.top_facts), [display?.top_facts]);
  const checklist = useMemo(() => parseChecklist(display?.verification_checklist), [display?.verification_checklist]);
  const links = useMemo(() => parseSourceLinks(display?.source_links), [display?.source_links]);
  const peopleIntel = useMemo(() => parsePeopleIntel(display), [display]);
  const runMeta = researchQuery.data?.metadata ?? null;
  const loading = dossierQuery.isLoading || researchQuery.isLoading;
  const isProposed = display?.status === "proposed";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-overlay-6 bg-overlay-2 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Research Run</p>
          <p className="text-sm text-foreground/85">
            {runMeta
              ? `Last staged ${formatWhen(runMeta.staged_at)} using ${runMeta.ai_provider} ${runMeta.ai_model}`
              : "Run one reviewed research pass for dossier, legal, and people intel."}
          </p>
          {runMeta?.legal.status === "unsupported" && (
            <p className="text-xs text-amber-300/80 mt-1">
              Legal is partial here because {runMeta.legal.county || "this county"} is not on the supported adapter yet.
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25"
          disabled={runMutation.isPending}
          onClick={() => runMutation.mutate()}
        >
          {runMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {runMeta ? "Refresh Research" : "Run Research"}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading intelligence...
        </div>
      ) : display ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {isProposed ? (
              <Badge className="border-border/40 bg-muted/15 text-foreground">Pending Review</Badge>
            ) : display.status === "promoted" ? (
              <Badge className="border-border/40 bg-muted/15 text-foreground">Promoted</Badge>
            ) : (
              <Badge className="border-border/40 bg-muted/15 text-foreground">Reviewed</Badge>
            )}
            {runMeta?.source_groups?.map((group) => (
              <Badge key={group} className="border-border/30 bg-muted/10 text-muted-foreground">
                {group.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>

          {isProposed && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1 bg-muted/90 hover:bg-muted"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ dossier_id: display.id, status: "reviewed" })}
              >
                {reviewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ dossier_id: display.id, status: "flagged" })}
              >
                {reviewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
                Reject
              </Button>
            </div>
          )}

          {!isProposed && display.status === "reviewed" && (
            <Button
              size="sm"
              className="gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25"
              disabled={promoteMutation.isPending}
              onClick={() => promoteMutation.mutate(display.id)}
            >
              {promoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Promote to Lead
            </Button>
          )}

          <div>
            <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-1">Situation Summary</h4>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{display.situation_summary ?? "-"}</p>
          </div>

          {display.recommended_call_angle && (
            <div className="rounded-[10px] border border-primary/25 bg-primary/[0.06] px-3 py-2">
              <h4 className="text-sm uppercase tracking-wider text-primary/80 font-semibold mb-1">Recommended Call Angle</h4>
              <p className="text-sm text-foreground/90">{display.recommended_call_angle}</p>
            </div>
          )}

          {display.likely_decision_maker && (
            <div>
              <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-1">Likely Decision Maker</h4>
              <p className="text-sm">{display.likely_decision_maker}</p>
            </div>
          )}

          {topFacts.length > 0 && (
            <div>
              <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top Facts</h4>
              <div className="flex flex-wrap gap-2">
                {topFacts.map((fact, index) => (
                  <span key={index} className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/10 px-2.5 py-1 text-sm text-foreground max-w-full">
                    <span className="truncate">{fact.text}</span>
                    {fact.confidence && <span className="text-xs uppercase opacity-70 shrink-0">{fact.confidence}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {peopleIntel.nextOfKin.length > 0 && (
            <div className="rounded-[10px] border border-amber-500/25 bg-amber-500/[0.06] px-3 py-3">
              <h4 className="text-sm uppercase tracking-wider text-amber-200 font-semibold mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Next Of Kin / Estate Contacts
              </h4>
              <div className="space-y-2">
                {peopleIntel.nextOfKin.map((person) => (
                  <div key={`${person.name}-${person.role}`} className="text-sm text-foreground/90">
                    <p className="font-medium">{person.name} <span className="text-xs uppercase text-amber-100/70">{person.role}</span></p>
                    <p className="text-xs text-muted-foreground/80 mt-0.5">{person.summary}</p>
                    {(person.phones.length > 0 || person.emails.length > 0) && (
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {[...person.phones, ...person.emails].join(" • ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {peopleIntel.highlights.length > 0 && (
            <div>
              <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">People Intel</h4>
              <div className="space-y-2">
                {peopleIntel.highlights.map((highlight, index) => (
                  <div key={`${highlight.source}-${index}`} className="rounded-[10px] border border-overlay-6 bg-overlay-2 px-3 py-2">
                    <p className="text-sm text-foreground/90">{highlight.summary}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      {highlight.source} · {highlight.category.replace(/_/g, " ")} · confidence {Math.round(highlight.confidence * 100)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {checklist.length > 0 && (
            <div>
              <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">Verification Checklist</h4>
              <ul className="space-y-1.5">
                {checklist.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={item.verified} readOnly className="mt-0.5 rounded border-overlay-20" />
                    <span>{item.item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {links.length > 0 && (
            <div>
              <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">Source Links</h4>
              <div className="flex flex-col gap-1">
                {links.map((link, index) => (
                  <a key={index} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border border-overlay-6 bg-overlay-2 p-4 text-center">
          <Brain className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground/60">No staged research brief yet.</p>
          <p className="text-xs text-muted-foreground/45 mt-1">Run Research to gather legal records, people intel, and a review-ready operator brief.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setArtifactsOpen((open) => !open)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {artifactsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Raw Artifacts ({artifactsQuery.data?.length ?? 0})
      </button>

      {artifactsOpen && (
        <div className="rounded-lg border border-overlay-6 bg-black/20 divide-y divide-overlay-4 max-h-56 overflow-y-auto">
          {(artifactsQuery.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground/50">No artifacts captured yet.</p>
          ) : (
            (artifactsQuery.data ?? []).map((artifact) => (
              <div key={artifact.id} className="p-3 text-sm space-y-1">
                <p className="font-medium text-foreground/80">{artifact.source_label ?? artifact.source_type ?? "Evidence"}</p>
                {artifact.source_url && (
                  <a href={artifact.source_url} target="_blank" rel="noreferrer" className="text-primary/70 hover:text-primary break-all text-xs">
                    {artifact.source_url}
                  </a>
                )}
                {artifact.extracted_notes && <p className="text-xs text-muted-foreground/80 whitespace-pre-wrap line-clamp-3">{artifact.extracted_notes}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
