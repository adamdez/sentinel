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
  Search,
  Scale,
  Globe,
  Users,
  FileText,
  Home,
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

interface DeepCrawlResult {
  categories: Record<string, Array<{ url: string; title: string; excerpt: string }>>;
  artifactCount: number;
  queriesRun: number;
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Scale }> = {
  court: { label: "Court Records", icon: Scale },
  foreclosure: { label: "Foreclosure Filings", icon: FileText },
  tax: { label: "Tax & Assessor", icon: Home },
  obituary: { label: "Obituary / Estates", icon: Users },
  social: { label: "Social Media", icon: Globe },
  social_x: { label: "X / Twitter", icon: Globe },
  news: { label: "News & Public Filings", icon: Search },
  property_condition: { label: "Property Condition", icon: Home },
};

function parseTopFacts(raw: unknown): Array<{ text: string; confidence?: string }> {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return { text: item };
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const text = (typeof o.fact === "string" && o.fact) || (typeof o.text === "string" && o.text) || JSON.stringify(item);
      const confidence = typeof o.confidence === "string" ? o.confidence : undefined;
      return { text, confidence };
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
        return item ? { item, verified: Boolean(o.verified) } : null;
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
        const url = typeof o.url === "string" ? o.url : "";
        return url ? { label: typeof o.label === "string" ? o.label : "Source", url } : null;
      }
      return null;
    })
    .filter(Boolean) as Array<{ label: string; url: string }>;
}

export function LeadDossierPanel({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [crawlResult, setCrawlResult] = useState<DeepCrawlResult | null>(null);
  const [crawlResultOpen, setCrawlResultOpen] = useState(true);

  const dossierQuery = useQuery({
    queryKey: ["dossier", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/dossiers/${leadId}`, { headers: await sentinelAuthHeaders(false) });
      if (!res.ok) throw new Error("Failed to load dossier");
      return ((await res.json()) as { dossier: DossierRow | null }).dossier;
    },
  });

  const proposedQuery = useQuery({
    queryKey: ["dossier-queue-proposed", leadId],
    queryFn: async () => {
      const res = await fetch("/api/dossiers/queue?status=proposed&limit=50", { headers: await sentinelAuthHeaders(false) });
      if (!res.ok) throw new Error("Failed");
      const match = ((await res.json()) as QueuePayload).items?.find((i) => i.lead_id === leadId && i.status === "proposed");
      return match ?? null;
    },
  });

  const artifactsQuery = useQuery({
    queryKey: ["dossier-artifacts", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/dossiers/${leadId}/artifacts`, { headers: await sentinelAuthHeaders(false) });
      if (!res.ok) throw new Error("Failed");
      return ((await res.json()) as { artifacts: ArtifactRow[] }).artifacts ?? [];
    },
  });

  const deepCrawlMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/deep-crawl`, {
        method: "POST",
        headers: await sentinelAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Deep crawl failed");
      return json as DeepCrawlResult;
    },
    onSuccess: (data) => {
      setCrawlResult(data);
      setCrawlResultOpen(true);
      toast.success(`Deep crawl complete — ${data.artifactCount} artifacts captured`);
      void qc.invalidateQueries({ queryKey: ["dossier-artifacts", leadId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Deep crawl failed"),
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
      if (!res.ok) throw new Error("Promote failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Dossier promoted to lead record");
      void qc.invalidateQueries({ queryKey: ["dossier", leadId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const loading = dossierQuery.isLoading || proposedQuery.isLoading;
  const active = dossierQuery.data;
  const proposed = proposedQuery.data;
  const display: DossierRow | null = proposed ?? active ?? null;
  const isProposed = Boolean(proposed);
  const topFacts = display ? parseTopFacts(display.top_facts) : [];
  const checklist = display ? parseChecklist(display.verification_checklist) : [];
  const links = display ? parseSourceLinks(display.source_links) : [];

  return (
    <div className="space-y-5">
      {/* ── Deep Crawl CTA ── */}
      <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Deep Intelligence Crawl</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Searches court records, tax, social media, news, obituaries, and property condition across 8 parallel queries.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 shrink-0 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25"
          disabled={deepCrawlMutation.isPending}
          onClick={() => deepCrawlMutation.mutate()}
        >
          {deepCrawlMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {deepCrawlMutation.isPending ? "Crawling..." : "Run Deep Crawl"}
        </Button>
      </div>

      {/* ── Deep Crawl Results ── */}
      {crawlResult && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setCrawlResultOpen((v) => !v)}
            className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            {crawlResultOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Deep Crawl Results ({crawlResult.artifactCount} artifacts from {crawlResult.queriesRun} queries)
          </button>
          {crawlResultOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(crawlResult.categories).map(([cat, results]) => {
                const meta = CATEGORY_META[cat] ?? { label: cat.replace(/_/g, " "), icon: Search };
                const CatIcon = meta.icon;
                if (results.length === 0) return null;
                return (
                  <div key={cat} className="rounded-[8px] border border-overlay-6 bg-overlay-2 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <CatIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">{meta.label}</span>
                      <Badge className="ml-auto text-[10px] h-4 border-overlay-10 bg-overlay-4 text-muted-foreground">{results.length}</Badge>
                    </div>
                    {results.map((r, i) => (
                      <div key={i} className="space-y-0.5">
                        <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-primary/80 hover:text-primary flex items-center gap-1 truncate">
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />{r.title || r.url}
                        </a>
                        {r.excerpt && <p className="text-xs text-muted-foreground/60 line-clamp-2">{r.excerpt}</p>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AI Dossier ── */}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />Loading intelligence…
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
          </div>

          {isProposed && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-1 bg-muted/90 hover:bg-muted" disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ dossier_id: display.id, status: "reviewed" })}>
                {reviewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}Approve
              </Button>
              <Button size="sm" variant="destructive" disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ dossier_id: display.id, status: "flagged" })}>
                {reviewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}Reject
              </Button>
            </div>
          )}

          {!isProposed && display.status === "reviewed" && active?.id && (
            <Button size="sm" className="gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25"
              disabled={promoteMutation.isPending} onClick={() => promoteMutation.mutate(active.id)}>
              {promoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Promote to Lead
            </Button>
          )}

          <div>
            <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-1">Situation Summary</h4>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{display.situation_summary ?? "—"}</p>
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
                {topFacts.slice(0, 8).map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/10 px-2.5 py-1 text-sm text-foreground max-w-full">
                    <span className="truncate">{f.text}</span>
                    {f.confidence && <span className="text-xs uppercase opacity-70 shrink-0">{f.confidence}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {checklist.length > 0 && (
            <div>
              <h4 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-2">Verification Checklist</h4>
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
                  <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary">
                    <ExternalLink className="h-3 w-3 shrink-0" />{l.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border border-overlay-6 bg-overlay-2 p-4 text-center">
          <Brain className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground/60">No AI dossier yet. Run a Deep Crawl to gather intelligence.</p>
        </div>
      )}

      {/* ── Raw Artifacts ── */}
      <button type="button" onClick={() => setArtifactsOpen((o) => !o)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        {artifactsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Raw Artifacts ({artifactsQuery.data?.length ?? 0})
      </button>
      {artifactsOpen && (
        <div className="rounded-lg border border-overlay-6 bg-black/20 divide-y divide-overlay-4 max-h-56 overflow-y-auto">
          {(artifactsQuery.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground/50">No artifacts captured yet.</p>
          ) : (
            (artifactsQuery.data ?? []).map((a) => (
              <div key={a.id} className="p-3 text-sm space-y-1">
                <p className="font-medium text-foreground/80">{a.source_label ?? a.source_type ?? "Evidence"}</p>
                {a.source_url && (
                  <a href={a.source_url} target="_blank" rel="noreferrer" className="text-primary/70 hover:text-primary break-all text-xs">{a.source_url}</a>
                )}
                {a.extracted_notes && <p className="text-xs text-muted-foreground/80 whitespace-pre-wrap line-clamp-3">{a.extracted_notes}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
