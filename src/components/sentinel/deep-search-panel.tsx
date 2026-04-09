"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Brain,
  ExternalLink,
  FileSearch,
  Gavel,
  Loader2,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import type {
  NextOfKinCandidate,
  PeopleIntelHighlight,
  UnifiedResearchStatusResponse,
} from "@/lib/research-run-types";

interface DeepSearchPanelProps {
  leadId: string;
  recommendProbatePack?: boolean;
}

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
  raw_excerpt?: string | null;
  created_at: string;
}

interface RecordedDocument {
  id: string;
  document_type: string;
  instrument_number: string | null;
  recording_date: string | null;
  grantor: string | null;
  grantee: string | null;
  amount: number | null;
  status: string;
  case_number: string | null;
  court_name: string | null;
  case_type: string | null;
  attorney_name: string | null;
  next_hearing_date: string | null;
  event_description: string | null;
  source: string;
  source_url: string | null;
  raw_excerpt?: string | null;
}

interface RawFinding {
  category: string;
  source: string;
  finding: string;
  confidence?: number;
  url?: string;
  date?: string;
}

interface LegalEvidenceRow {
  key: string;
  title: string;
  subtitle: string;
  link: { label: string; url: string } | null;
  notes: string | null;
  rawExcerpt: string | null;
  amount: number | null;
  caseNumber: string | null;
  dateLabel: string | null;
  statusLabel: string | null;
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return parsed.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "-";
  return `$${amount.toLocaleString()}`;
}

function parseTopFacts(raw: unknown): Array<{ text: string; source?: string; confidence?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return { text: item };
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = typeof row.fact === "string"
        ? row.fact.trim()
        : typeof row.text === "string"
          ? row.text.trim()
          : "";
      if (!text) return null;
      return {
        text,
        source: typeof row.source === "string" ? row.source : undefined,
        confidence: typeof row.confidence === "string" ? row.confidence : undefined,
      };
    })
    .filter(Boolean) as Array<{ text: string; source?: string; confidence?: string }>;
}

function parseChecklist(raw: unknown): Array<{ item: string; verified: boolean }> {
  if (!Array.isArray(raw)) return [];
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
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (typeof row.url !== "string" || !row.url.trim()) return null;
      return {
        label: typeof row.label === "string" && row.label.trim() ? row.label : "Source",
        url: row.url,
      };
    })
    .filter(Boolean) as Array<{ label: string; url: string }>;
}

function parsePeopleIntel(display: DossierRow | null): {
  highlights: PeopleIntelHighlight[];
  nextOfKin: NextOfKinCandidate[];
  rawFindings: RawFinding[];
} {
  const raw = display?.raw_ai_output;
  const researchRun = raw && typeof raw.research_run === "object"
    ? (raw.research_run as Record<string, unknown>)
    : null;
  const peopleIntel = researchRun?.people_intel && typeof researchRun.people_intel === "object"
    ? (researchRun.people_intel as Record<string, unknown>)
    : null;
  const rawFindings = Array.isArray(raw?.findings)
    ? (raw.findings as RawFinding[])
    : [];

  return {
    highlights: Array.isArray(peopleIntel?.highlights) ? (peopleIntel.highlights as PeopleIntelHighlight[]) : [],
    nextOfKin: Array.isArray(peopleIntel?.next_of_kin) ? (peopleIntel.next_of_kin as NextOfKinCandidate[]) : [],
    rawFindings,
  };
}

function sourceTitle(source: string): string {
  switch (source) {
    case "spokane_recorder":
      return "County Recorder";
    case "wa_courts":
      return "WA Courts";
    case "spokane_liens":
      return "County Liens";
    default:
      return source.replace(/_/g, " ");
  }
}

function trustTone(sourceType: string | null | undefined): {
  badge: string;
  className: string;
} {
  if (sourceType === "court_record" || sourceType === "assessor" || sourceType === "probate_filing") {
    return {
      badge: "Hard Record",
      className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    };
  }
  if (sourceType === "obituary" || sourceType === "social_media" || sourceType === "news") {
    return {
      badge: "Review Required",
      className: "border-amber-500/20 bg-amber-500/10 text-amber-100",
    };
  }
  return {
    badge: "Evidence",
    className: "border-border/30 bg-muted/10 text-muted-foreground",
  };
}

function docTypeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function normalizeEvidenceKey(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

function isLegalArtifact(artifact: ArtifactRow): boolean {
  const sourceType = (artifact.source_type ?? "").toLowerCase();
  const label = (artifact.source_label ?? "").toLowerCase();
  return sourceType === "court_record"
    || sourceType === "probate_filing"
    || sourceType === "assessor"
    || label.startsWith("legal:")
    || /\b(court|recorder|lien|judgment|probate|bankruptcy|foreclosure)\b/.test(label);
}

function parseArtifactCaseNumber(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/\bcase(?:\s+no\.?)?\s*[:#]?\s*([A-Z0-9-]{4,})/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseArtifactAmount(...values: Array<string | null | undefined>): number | null {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/\$([0-9][0-9,]*(?:\.\d{2})?)/);
    if (!match?.[1]) continue;
    const numeric = Number(match[1].replace(/,/g, ""));
    if (!Number.isNaN(numeric)) return numeric;
  }
  return null;
}

function parseArtifactDate(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const labeled = value.match(
      /\b(?:filed|filing date|date filed|recorded|recording date|hearing date|dated)\b[^\d]{0,20}(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    );
    const plain = value.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
    const raw = labeled?.[1] ?? plain?.[1];
    if (!raw) continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function isHelpfulSourceUrl(
  url: string | null | undefined,
  context?: { caseNumber?: string | null; instrumentNumber?: string | null },
): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const href = parsed.toString().toLowerCase();
    const fa = parsed.searchParams.get("fa")?.toLowerCase() ?? "";
    if ((parsed.pathname === "/" || parsed.pathname === "/index.cfm") && !parsed.search) {
      return false;
    }
    if (/dw\.courts\.wa\.gov$/i.test(parsed.hostname)) {
      if (fa === "home.namesearchresult" || fa === "home.namesearch" || fa === "home.casesearch" || fa === "home.caselist") {
        const caseNeedle = context?.caseNumber?.toLowerCase() ?? "";
        if (!caseNeedle || !href.includes(caseNeedle)) return false;
      }
    }
    if (/pacer|uscourts\.gov/i.test(parsed.hostname)) {
      const caseNeedle = context?.caseNumber?.toLowerCase() ?? "";
      if (!caseNeedle || !href.includes(caseNeedle)) return false;
    }
    if (/recording\.spokanecounty\.org/i.test(parsed.hostname)) {
      const searchType = parsed.searchParams.get("searchType")?.toLowerCase() ?? "";
      return Boolean(searchType || parsed.search);
    }
    return true;
  } catch {
    return false;
  }
}

function resolveFactLink(
  source: string | undefined,
  text: string,
  sourceLinks: Array<{ label: string; url: string }>,
  rawFindings: RawFinding[],
  artifacts: ArtifactRow[],
  documents: RecordedDocument[],
): { label: string; url: string } | null {
  const sourceNeedle = (source ?? "").toLowerCase();
  const textNeedle = text.toLowerCase();

  const findingMatch = rawFindings.find((finding) =>
    Boolean(finding.url)
    && (
      (sourceNeedle && finding.source.toLowerCase().includes(sourceNeedle))
      || finding.finding.toLowerCase().includes(textNeedle.slice(0, Math.min(textNeedle.length, 36)))
    ));
  if (findingMatch?.url) {
    return { label: findingMatch.source, url: findingMatch.url };
  }

  const artifactMatch = artifacts.find((artifact) =>
    Boolean(artifact.source_url)
    && (
      (sourceNeedle && `${artifact.source_label ?? ""} ${artifact.source_type ?? ""}`.toLowerCase().includes(sourceNeedle))
      || (artifact.extracted_notes?.toLowerCase().includes(textNeedle.slice(0, Math.min(textNeedle.length, 28))) ?? false)
    ));
  if (artifactMatch?.source_url) {
    return { label: artifactMatch.source_label ?? "Evidence", url: artifactMatch.source_url };
  }

  const documentMatch = documents.find((document) =>
    Boolean(document.source_url)
    && (
      (sourceNeedle && `${document.source} ${document.document_type}`.toLowerCase().includes(sourceNeedle))
      || `${document.grantor ?? ""} ${document.grantee ?? ""} ${document.event_description ?? ""}`
        .toLowerCase()
        .includes(textNeedle.slice(0, Math.min(textNeedle.length, 28)))
    ));
  if (documentMatch?.source_url) {
    return { label: sourceTitle(documentMatch.source), url: documentMatch.source_url };
  }

  const sourceLinkMatch = sourceLinks.find((link) =>
    sourceNeedle && link.label.toLowerCase().includes(sourceNeedle));
  return sourceLinkMatch ?? null;
}

function resolveCandidateLinks(
  candidate: NextOfKinCandidate,
  rawFindings: RawFinding[],
  artifacts: ArtifactRow[],
  sourceLinks: Array<{ label: string; url: string }>,
  documents: RecordedDocument[],
): Array<{ label: string; url: string }> {
  const nameNeedle = candidate.name.toLowerCase();
  const links = new Map<string, { label: string; url: string }>();

  for (const finding of rawFindings) {
    if (!finding.url) continue;
    const haystack = `${finding.finding} ${finding.source}`.toLowerCase();
    if (haystack.includes(nameNeedle) || (candidate.source && haystack.includes(candidate.source.toLowerCase()))) {
      links.set(finding.url, { label: finding.source, url: finding.url });
    }
  }

  for (const artifact of artifacts) {
    if (!artifact.source_url) continue;
    const haystack = `${artifact.source_label ?? ""} ${artifact.extracted_notes ?? ""} ${artifact.raw_excerpt ?? ""}`.toLowerCase();
    if (haystack.includes(nameNeedle)) {
      links.set(artifact.source_url, { label: artifact.source_label ?? "Evidence", url: artifact.source_url });
    }
  }

  for (const document of documents) {
    if (!document.source_url) continue;
    const haystack = `${document.grantor ?? ""} ${document.grantee ?? ""} ${document.attorney_name ?? ""} ${document.event_description ?? ""}`.toLowerCase();
    if (haystack.includes(nameNeedle)) {
      links.set(document.source_url, { label: sourceTitle(document.source), url: document.source_url });
    }
  }

  for (const link of sourceLinks) {
    if (candidate.source && link.label.toLowerCase().includes(candidate.source.toLowerCase())) {
      links.set(link.url, link);
    }
  }

  return Array.from(links.values()).slice(0, 3);
}

export function DeepSearchPanel({ leadId, recommendProbatePack = false }: DeepSearchPanelProps) {
  const queryClient = useQueryClient();

  const dossierQuery = useQuery({
    queryKey: ["dossier", leadId],
    queryFn: async () => {
      const response = await fetch(`/api/dossiers/${leadId}?include_proposed=true`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!response.ok) throw new Error("Failed to load deep search brief");
      return ((await response.json()) as { dossier: DossierRow | null }).dossier;
    },
  });

  const researchQuery = useQuery({
    queryKey: ["lead-research", leadId],
    queryFn: async () => {
      const response = await fetch(`/api/leads/${leadId}/research-run`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!response.ok) throw new Error("Failed to load research status");
      return (await response.json()) as UnifiedResearchStatusResponse;
    },
  });

  const artifactsQuery = useQuery({
    queryKey: ["dossier-artifacts", leadId],
    queryFn: async () => {
      const response = await fetch(`/api/dossiers/${leadId}/artifacts`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!response.ok) throw new Error("Failed to load evidence");
      return ((await response.json()) as { artifacts: ArtifactRow[] }).artifacts ?? [];
    },
  });

  const legalQuery = useQuery({
    queryKey: ["legal-search", leadId],
    queryFn: async () => {
      const response = await fetch(`/api/leads/${leadId}/legal-search`, {
        headers: await sentinelAuthHeaders(false),
      });
      if (!response.ok) throw new Error("Failed to load legal records");
      return (await response.json()) as {
        documents: RecordedDocument[];
        lastSearchedAt: string | null;
      };
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/leads/${leadId}/research-run`, {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Deep Search failed");
      }
      return (await response.json()) as UnifiedResearchStatusResponse;
    },
    onSuccess: () => {
      toast.success("Deep Search completed");
      void queryClient.invalidateQueries({ queryKey: ["dossier", leadId] });
      void queryClient.invalidateQueries({ queryKey: ["lead-research", leadId] });
      void queryClient.invalidateQueries({ queryKey: ["dossier-artifacts", leadId] });
      void queryClient.invalidateQueries({ queryKey: ["legal-search", leadId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Deep Search failed");
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (body: { dossier_id: string; status: "reviewed" | "flagged" }) => {
      const response = await fetch(`/api/dossiers/${leadId}/review`, {
        method: "PATCH",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Deep Search review failed");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Deep Search updated");
      void queryClient.invalidateQueries({ queryKey: ["dossier", leadId] });
      void queryClient.invalidateQueries({ queryKey: ["lead-research", leadId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Deep Search review failed");
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (dossierId: string) => {
      const response = await fetch(`/api/dossiers/${leadId}/promote`, {
        method: "POST",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify({ dossier_id: dossierId }),
      });
      if (!response.ok) throw new Error("Promote failed");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Deep Search promoted to lead record");
      void queryClient.invalidateQueries({ queryKey: ["dossier", leadId] });
      void queryClient.invalidateQueries({ queryKey: ["lead-research", leadId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Promote failed");
    },
  });

  const display = dossierQuery.data ?? null;
  const artifacts = useMemo(() => artifactsQuery.data ?? [], [artifactsQuery.data]);
  const documents = useMemo(() => legalQuery.data?.documents ?? [], [legalQuery.data?.documents]);
  const runMeta = researchQuery.data?.metadata ?? null;
  const topFacts = useMemo(() => parseTopFacts(display?.top_facts), [display?.top_facts]);
  const checklist = useMemo(() => parseChecklist(display?.verification_checklist), [display?.verification_checklist]);
  const sourceLinks = useMemo(() => parseSourceLinks(display?.source_links), [display?.source_links]);
  const peopleIntel = useMemo(() => parsePeopleIntel(display), [display]);
  const loading = dossierQuery.isLoading || researchQuery.isLoading || legalQuery.isLoading || artifactsQuery.isLoading;
  const isProposed = display?.status === "proposed";
  const legalErrors = runMeta?.legal.errors ?? [];
  const nextEvent = runMeta?.legal.next_upcoming_event ?? null;
  const legalEvidenceRows = useMemo(() => {
    const rows: LegalEvidenceRow[] = [];

    for (const document of documents) {
      const documentDateLabel = document.recording_date ? formatDate(document.recording_date) : "";
      rows.push({
        key: normalizeEvidenceKey([
          "doc",
          document.id,
          document.source_url,
          document.case_number,
          document.instrument_number,
        ]),
        title: `${docTypeLabel(document.document_type)}${document.instrument_number ? ` #${document.instrument_number}` : ""}`,
        subtitle: [sourceTitle(document.source), documentDateLabel, document.case_number].filter(Boolean).join(" - "),
        link: isHelpfulSourceUrl(document.source_url, {
          caseNumber: document.case_number,
          instrumentNumber: document.instrument_number,
        })
          ? { label: "Open Source", url: document.source_url! }
          : null,
        notes: document.event_description ?? ([document.grantor, document.grantee].filter(Boolean).join(" -> ") || null),
        rawExcerpt: document.raw_excerpt ?? null,
        amount: document.amount ?? null,
        caseNumber: document.case_number ?? null,
        dateLabel: document.recording_date ?? null,
        statusLabel: document.status ?? null,
      });
    }

    for (const artifact of artifacts.filter(isLegalArtifact)) {
      const artifactDate = parseArtifactDate(artifact.extracted_notes, artifact.raw_excerpt);
      rows.push({
        key: normalizeEvidenceKey([
          "artifact",
          artifact.source_label,
          artifact.source_url,
          artifact.extracted_notes,
        ]),
        title: artifact.source_label ?? artifact.source_type ?? "Legal evidence",
        subtitle: [
          artifact.source_type?.replace(/_/g, " "),
          artifactDate ? formatDate(artifactDate) : "",
        ].filter(Boolean).join(" - "),
        link: isHelpfulSourceUrl(artifact.source_url, {
          caseNumber: parseArtifactCaseNumber(artifact.extracted_notes, artifact.raw_excerpt, artifact.source_label),
        })
          ? { label: "Open Source", url: artifact.source_url! }
          : null,
        notes: artifact.extracted_notes ?? null,
        rawExcerpt: artifact.raw_excerpt ?? null,
        amount: parseArtifactAmount(artifact.extracted_notes, artifact.raw_excerpt),
        caseNumber: parseArtifactCaseNumber(artifact.extracted_notes, artifact.raw_excerpt, artifact.source_label),
        dateLabel: artifactDate,
        statusLabel: null,
      });
    }

    const seen = new Set<string>();
    return rows.filter((row) => {
      if (!row.key) return false;
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    });
  }, [artifacts, documents]);
  const legalRecordCount = Math.max(runMeta?.legal.documents_found ?? 0, legalEvidenceRows.length);
  const courtCaseCount = Math.max(
    runMeta?.legal.court_cases_found ?? 0,
    legalEvidenceRows.filter((row) => Boolean(row.caseNumber)).length,
  );
  const totalLienAmount = legalEvidenceRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const stagedSummary = runMeta
    ? runMeta.ai_provider === "fallback"
      ? `Last staged ${formatWhen(runMeta.staged_at)} using built-in fallback synthesis`
      : `Last staged ${formatWhen(runMeta.staged_at)} using ${runMeta.ai_provider} ${runMeta.ai_model}`
    : "Run one manual Deep Search pass for probate, legal, next of kin, and people intel.";

  const evidenceRows = useMemo(() => {
    const rows: Array<{
      key: string;
      title: string;
      subtitle: string;
      link: { label: string; url: string } | null;
      notes: string | null;
      rawExcerpt: string | null;
      trust: { badge: string; className: string };
    }> = [];

    for (const document of documents) {
      rows.push({
        key: `doc-${document.id}`,
        title: `${docTypeLabel(document.document_type)}${document.instrument_number ? ` #${document.instrument_number}` : ""}`,
        subtitle: [sourceTitle(document.source), formatDate(document.recording_date), document.case_number].filter(Boolean).join(" - "),
        link: document.source_url ? { label: "Open Source", url: document.source_url } : null,
        notes: document.event_description ?? ([document.grantor, document.grantee].filter(Boolean).join(" -> ") || null),
        rawExcerpt: document.raw_excerpt ?? null,
        trust: trustTone("court_record"),
      });
    }

    for (const artifact of artifacts) {
      rows.push({
        key: `artifact-${artifact.id}`,
        title: artifact.source_label ?? artifact.source_type ?? "Evidence",
        subtitle: [artifact.source_type?.replace(/_/g, " "), formatDate(artifact.created_at)].filter(Boolean).join(" - "),
        link: artifact.source_url ? { label: "Open Source", url: artifact.source_url } : null,
        notes: artifact.extracted_notes ?? null,
        rawExcerpt: artifact.raw_excerpt ?? null,
        trust: trustTone(artifact.source_type),
      });
    }

    for (const link of sourceLinks) {
      rows.push({
        key: `link-${link.url}`,
        title: link.label,
        subtitle: "Source Link",
        link,
        notes: null,
        rawExcerpt: null,
        trust: trustTone(null),
      });
    }

    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    });
  }, [artifacts, documents, sourceLinks]);

  if (loading && !display && documents.length === 0 && artifacts.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Deep Search...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
                <Brain className="h-3.5 w-3.5" />
                Deep Search
              </div>
              {recommendProbatePack && (
                <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-100">
                  Probate Pack Recommended
                </Badge>
              )}
              {display?.status && (
                <Badge className="border-border/40 bg-muted/10 text-foreground">
                  {display.status === "proposed"
                    ? "Pending Review"
                    : display.status === "promoted"
                      ? "Promoted"
                      : "Reviewed"}
                </Badge>
              )}
            </div>
            <p className="text-sm text-foreground/85">
              {stagedSummary}
            </p>
            <div className="flex flex-wrap gap-2">
              {(runMeta?.source_groups ?? ["deep_property", "legal", "people_intel"]).map((group) => (
                <Badge key={group} className="border-border/30 bg-muted/10 text-muted-foreground">
                  {group.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>

          <Button
            size="sm"
            className="gap-1.5 border border-primary/25 bg-primary/15 text-primary hover:bg-primary/25"
            disabled={runMutation.isPending}
            onClick={() => runMutation.mutate()}
          >
            {runMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {runMeta ? "Refresh Deep Search" : "Run Deep Search"}
          </Button>
        </div>

        {recommendProbatePack && (
          <div className="mt-4 rounded-[10px] border border-amber-500/20 bg-amber-500/8 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/80">
              Recommended Probate Pack
            </p>
            <p className="mt-1 text-sm text-amber-50/90">
              This file looks probate-leaning. Deep Search will prioritize recorder and court records, obituary lanes,
              next-of-kin discovery, and contact paths for the likely executor or estate decision-maker.
            </p>
          </div>
        )}
      </div>

      {legalErrors.length > 0 && (
        <div className="rounded-[12px] border border-amber-500/25 bg-amber-500/8 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-200" />
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                Research Hit An Upstream Issue
              </p>
              <p className="text-sm text-amber-50/90">{legalErrors[0]}</p>
              <p className="text-xs text-amber-100/65">
                Surviving evidence still appears below with hyperlinks. This is no longer shown as a fake empty result.
              </p>
            </div>
          </div>
        </div>
      )}

      {display && isProposed && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1 border border-border/30 bg-muted/90 hover:bg-muted"
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

      {display && !isProposed && display.status === "reviewed" && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5 border border-primary/25 bg-primary/15 text-primary hover:bg-primary/25"
            disabled={promoteMutation.isPending}
            onClick={() => promoteMutation.mutate(display.id)}
          >
            {promoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Promote to Lead
          </Button>
        </div>
      )}

      {!display && documents.length === 0 && artifacts.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-overlay-6 bg-overlay-2 p-10 text-center">
          <FileSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/70">No Deep Search results yet.</p>
          <p className="mt-1 text-xs text-muted-foreground/50">
            Run Deep Search to stage a probate-ready brief, legal evidence, people intel, and verification links.
          </p>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Brief</h3>
            </div>

            <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                  Situation Summary
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                  {display?.situation_summary ?? "Deep Search has not staged a written summary yet."}
                </p>
              </div>

              {display?.recommended_call_angle && (
                <div className="rounded-[10px] border border-primary/20 bg-primary/[0.06] px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Call Angle</p>
                  <p className="mt-1 text-sm text-foreground/90">{display.recommended_call_angle}</p>
                </div>
              )}

              {topFacts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                    Top Facts
                  </p>
                  <div className="space-y-2">
                    {topFacts.map((fact, index) => {
                      const link = resolveFactLink(
                        fact.source,
                        fact.text,
                        sourceLinks,
                        peopleIntel.rawFindings,
                        artifacts,
                        documents,
                      );
                      return (
                        <div key={`${fact.text}-${index}`} className="rounded-[10px] border border-overlay-6 bg-overlay-1 px-3 py-2">
                          <p className="text-sm text-foreground/90">{fact.text}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {fact.confidence && (
                              <Badge className="border-border/30 bg-muted/10 text-muted-foreground">
                                {fact.confidence}
                              </Badge>
                            )}
                            {fact.source && (
                              <span className="text-xs text-muted-foreground/60">{fact.source}</span>
                            )}
                            {link && (
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {link.label}
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Decision Maker / Next Of Kin
              </h3>
            </div>

            <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                  Best Current Decision Maker
                </p>
                <p className="mt-1 text-sm text-foreground/90">
                  {display?.likely_decision_maker ?? "No decision-maker has been staged yet."}
                </p>
              </div>

              {peopleIntel.nextOfKin.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {peopleIntel.nextOfKin.map((candidate) => {
                    const candidateLinks = resolveCandidateLinks(
                      candidate,
                      peopleIntel.rawFindings,
                      artifacts,
                      sourceLinks,
                      documents,
                    );
                    return (
                      <div key={`${candidate.name}-${candidate.role}`} className="rounded-[10px] border border-amber-500/20 bg-amber-500/[0.06] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{candidate.name}</p>
                          <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-100">
                            {candidate.role}
                          </Badge>
                          <Badge className="border-border/30 bg-muted/10 text-muted-foreground">
                            {Math.round(candidate.confidence * 100)}%
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-foreground/80">{candidate.summary}</p>
                        {(candidate.phones.length > 0 || candidate.emails.length > 0) && (
                          <p className="mt-2 text-xs text-muted-foreground/70">
                            {[...candidate.phones, ...candidate.emails].join(" | ")}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {candidateLinks.map((link) => (
                            <a
                              key={`${candidate.name}-${link.url}`}
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-muted/10 px-2.5 py-1 text-xs text-primary/80 hover:text-primary"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70">
                  No next-of-kin or estate contacts have been staged yet.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Legal / Recorder / Court
              </h3>
            </div>

            <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[10px] border border-overlay-6 bg-overlay-1 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">Legal Records</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{legalRecordCount}</p>
                </div>
                <div className="rounded-[10px] border border-overlay-6 bg-overlay-1 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">Court Cases</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{courtCaseCount}</p>
                </div>
                <div className="rounded-[10px] border border-overlay-6 bg-overlay-1 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">Amount Tracked</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(totalLienAmount)}</p>
                </div>
              </div>

              {nextEvent && (
                <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/[0.06] px-3 py-3">
                  <div className="flex items-start gap-2">
                    <Gavel className="mt-0.5 h-4 w-4 text-amber-100" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                        Next Event
                      </p>
                      <p className="mt-1 text-sm text-foreground/90">
                        {formatDate(nextEvent.date)} - {nextEvent.type ?? "Legal Event"}
                      </p>
                      {nextEvent.caseNumber && (
                        <p className="text-xs text-muted-foreground/70">Case {nextEvent.caseNumber}</p>
                      )}
                      {nextEvent.description && (
                        <p className="mt-1 text-xs text-muted-foreground/70">{nextEvent.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {legalEvidenceRows.length > 0 ? (
                <div className="space-y-3">
                  {legalEvidenceRows.map((row) => (
                    <div key={row.key} className="rounded-[10px] border border-overlay-6 bg-overlay-1 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{row.title}</p>
                            <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                              Hard Record
                            </Badge>
                            {row.dateLabel && (
                              <span className="text-xs text-muted-foreground/60">{formatDate(row.dateLabel)}</span>
                            )}
                            {row.caseNumber && (
                              <span className="text-xs text-muted-foreground/60">Case {row.caseNumber}</span>
                            )}
                          </div>
                          <p className="text-sm text-foreground/90">
                            {row.notes ?? "Legal record"}
                          </p>
                          <p className="text-xs text-muted-foreground/65">
                            {row.subtitle}
                          </p>
                        </div>

                        {row.link && (
                          <a
                            href={row.link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-muted/10 px-3 py-1.5 text-xs text-primary/80 hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {row.link.label}
                          </a>
                        )}
                      </div>

                      {(row.amount != null || row.statusLabel || row.rawExcerpt) && (
                        <div className="mt-3 space-y-2">
                          {(row.amount != null || row.statusLabel) && (
                            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground/70">
                              {row.amount != null && <span>Amount: {formatCurrency(row.amount)}</span>}
                              {row.statusLabel && <span>Status: {row.statusLabel}</span>}
                            </div>
                          )}
                          {row.rawExcerpt && (
                            <p className="rounded-[8px] border border-overlay-6 bg-black/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground/75">
                              {row.rawExcerpt}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70">
                  No legal evidence is staged yet.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                People Intel
              </h3>
            </div>

            <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
              {peopleIntel.highlights.length > 0 ? (
                peopleIntel.highlights.map((highlight, index) => (
                  <div key={`${highlight.source}-${index}`} className="rounded-[10px] border border-overlay-6 bg-overlay-1 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-100">
                        Review Required
                      </Badge>
                      <span className="text-xs text-muted-foreground/60">
                        {highlight.category.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        {Math.round(highlight.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-foreground/90">{highlight.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/65">
                      <span>{highlight.source}</span>
                      {highlight.date && <span>{formatDate(highlight.date)}</span>}
                      {highlight.url && (
                        <a
                          href={highlight.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary/80 hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open Source
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground/70">
                  No obituary, social, or news findings are staged yet.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Verification Checklist
              </h3>
            </div>

            <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4">
              {checklist.length > 0 ? (
                <div className="space-y-2">
                  {checklist.map((item, index) => (
                    <div key={`${item.item}-${index}`} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.verified}
                        readOnly
                        className="mt-0.5 rounded border-overlay-20"
                      />
                      <span className="text-foreground/85">{item.item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70">
                  No explicit verification checklist has been staged yet.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-muted-foreground/60" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Sources / Evidence
              </h3>
            </div>

            <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4">
              {evidenceRows.length > 0 ? (
                <div className="space-y-3">
                  {evidenceRows.map((row) => (
                    <div key={row.key} className="rounded-[10px] border border-overlay-6 bg-overlay-1 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{row.title}</p>
                            <Badge className={row.trust.className}>{row.trust.badge}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground/65">{row.subtitle}</p>
                        </div>
                        {row.link && (
                          <a
                            href={row.link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-muted/10 px-3 py-1.5 text-xs text-primary/80 hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {row.link.label}
                          </a>
                        )}
                      </div>
                      {row.notes && (
                        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{row.notes}</p>
                      )}
                      {row.rawExcerpt && (
                        <p className="mt-2 rounded-[8px] border border-overlay-6 bg-black/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground/75">
                          {row.rawExcerpt}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70">
                  No linked evidence has been staged yet.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
