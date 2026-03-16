"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  ExternalLink,
  Flag,
  Loader2,
  ShieldCheck,
  User,
  Lightbulb,
  List,
  AlertCircle,
} from "lucide-react";
import {
  useDossier,
  promoteDossier,
  DossierRow,
  DossierTopFact,
  DossierVerificationItem,
  DossierSourceLink,
} from "@/hooks/use-dossier";
import { EvidenceCapturePanel } from "./evidence-capture-panel";
import { ContradictionFlagsPanel } from "@/components/sentinel/contradiction-flags-panel";
import { AbsenteeDossierBrief } from "./absentee-dossier-brief";
import { deriveAbsenteeDossierBrief } from "@/lib/absentee-dossier";

// ── Props ─────────────────────────────────────────────────────────────────────

export type LeadDossierType = "absentee_landlord" | "probate" | "generic";

interface DossierBlockProps {
  leadId: string;
  propertyId?: string | null;
  isAdminView?: boolean;
  /** Hint to select evidence source types and dossier renderer. Detected from dossier.raw_ai_output as fallback. */
  leadType?: LeadDossierType;
}

// ── DossierBlock ──────────────────────────────────────────────────────────────
// Read-only. Renders ONLY when a reviewed/promoted dossier exists.
// Does not render for proposed or flagged dossiers.
// Proposed dossiers are visible only to Adam in the future review queue.

export function DossierBlock({ leadId, propertyId, isAdminView = false, leadType }: DossierBlockProps) {
  const { dossier, loading, error, refetch } = useDossier(leadId);

  useEffect(() => {
    if (leadId) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // For non-admin: render nothing unless a reviewed dossier exists
  if (!isAdminView) {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading intelligence…
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex items-center gap-2 text-xs text-destructive py-1">
          <AlertCircle className="h-3 w-3" />
          Could not load dossier: {error}
        </div>
      );
    }
    if (!dossier) return null;
    return <DossierRenderer dossier={dossier} leadType={leadType} isAdminView={false} onPromoted={refetch} />;
  }

  // Admin view: always render — shows reviewed dossier (if any) + evidence capture panel
  return (
    <div className="space-y-2">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading intelligence…
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive py-1">
          <AlertCircle className="h-3 w-3" />
          Could not load dossier: {error}
        </div>
      )}
      {!loading && dossier && (
        <DossierRenderer dossier={dossier} leadType={leadType} isAdminView={true} onPromoted={refetch} />
      )}
      <ContradictionFlagsPanel leadId={leadId} />
      <EvidenceCapturePanel
        leadId={leadId}
        propertyId={propertyId}
        onDossierCompiled={refetch}
        leadType={leadType}
      />
    </div>
  );
}

// ── DossierRenderer — routes to the right renderer based on dossier_type ─────

interface DossierRendererProps {
  dossier:     DossierRow;
  leadType?:   LeadDossierType;
  isAdminView: boolean;
  onPromoted:  () => void;
}

function DossierRenderer({ dossier, leadType, isAdminView, onPromoted }: DossierRendererProps) {
  // Detect type: explicit prop takes precedence, then raw_ai_output.dossier_type, then generic
  const rawType = dossier.raw_ai_output?.dossier_type as string | undefined;
  const resolvedType: LeadDossierType =
    leadType ?? (rawType === "absentee_landlord" ? "absentee_landlord" : "generic");

  if (resolvedType === "absentee_landlord") {
    // Derive brief from the dossier's top_facts (which come from artifact extracted_notes)
    // We pass empty artifacts here since the brief is derived at compile time and
    // re-derived from top_facts for display. Real artifacts aren't re-fetched for rendering.
    const topFacts = Array.isArray(dossier.top_facts) ? dossier.top_facts : [];
    // Reconstruct minimal artifact inputs from top_facts for re-derivation
    const pseudoArtifacts = topFacts.map((f, i) => ({
      id:              `tf-${i}`,
      source_type:     "other" as const,
      source_label:    f.source ?? null,
      source_url:      null,
      extracted_notes: f.fact,
      captured_at:     dossier.created_at,
    }));
    const brief = deriveAbsenteeDossierBrief(pseudoArtifacts);
    return (
      <AbsenteeDossierBrief
        dossier={dossier}
        brief={brief}
        isAdminView={isAdminView}
        onPromoted={onPromoted}
      />
    );
  }

  return <DossierContent dossier={dossier} isAdminView={isAdminView} onPromoted={onPromoted} />;
}

// ── DossierContent ────────────────────────────────────────────────────────────

interface DossierContentProps {
  dossier: DossierRow;
  isAdminView: boolean;
  onPromoted: () => void;
}

function DossierContent({ dossier, isAdminView, onPromoted }: DossierContentProps) {
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const reviewedDate = dossier.reviewed_at
    ? new Date(dossier.reviewed_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  async function handlePromote() {
    setPromoting(true);
    setPromoteError(null);
    try {
      await promoteDossier(dossier.lead_id, dossier.id);
      onPromoted();
    } catch (err: unknown) {
      setPromoteError(err instanceof Error ? err.message : "Promotion failed");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 p-3 space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
          <ShieldCheck className="h-4 w-4" />
          Reviewed Intelligence
        </div>
        <Badge
          variant="outline"
          className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
        >
          {dossier.status === "promoted" ? "Promoted to lead" : "Reviewed"}
        </Badge>
      </div>

      {/* Situation summary */}
      {dossier.situation_summary && (
        <p className="text-sm text-foreground leading-snug">{dossier.situation_summary}</p>
      )}

      {/* Decision-maker */}
      {dossier.likely_decision_maker && (
        <div className="flex items-start gap-2">
          <User className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Likely decision-maker
            </span>
            <p className="text-sm">{dossier.likely_decision_maker}</p>
          </div>
        </div>
      )}

      {/* Call angle */}
      {dossier.recommended_call_angle && (
        <div className="flex items-start gap-2">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recommended approach
            </span>
            <p className="text-sm">{dossier.recommended_call_angle}</p>
          </div>
        </div>
      )}

      {/* Top facts */}
      {Array.isArray(dossier.top_facts) && dossier.top_facts.length > 0 && (
        <div className="flex items-start gap-2">
          <List className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
              Key facts
            </span>
            <ul className="space-y-1">
              {(dossier.top_facts as DossierTopFact[]).map((f, i) => (
                <li key={i} className="text-sm leading-snug">
                  <span>{f.fact}</span>
                  {f.source && (
                    <span className="ml-1 text-xs text-muted-foreground">({f.source})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Separator />

      {/* Verification checklist — read-only visual */}
      {Array.isArray(dossier.verification_checklist) && dossier.verification_checklist.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
            Verify before calling
          </span>
          <ul className="space-y-1.5">
            {(dossier.verification_checklist as DossierVerificationItem[]).map((v, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Checkbox checked={v.verified} disabled className="h-3.5 w-3.5 opacity-60" />
                <span className={v.verified ? "line-through text-muted-foreground" : ""}>
                  {v.item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source links */}
      {Array.isArray(dossier.source_links) && dossier.source_links.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Sources
          </span>
          <ul className="space-y-1">
            {(dossier.source_links as DossierSourceLink[]).map((link, i) => (
              <li key={i}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer — makes human review visible */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-green-600" />
          {reviewedDate ? `Reviewed ${reviewedDate}` : "Reviewed"}
        </div>

        {/* Promote button — Adam-only, only when status is 'reviewed' */}
        {isAdminView && dossier.status === "reviewed" && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2 border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
              onClick={handlePromote}
              disabled={promoting}
            >
              {promoting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Flag className="h-3 w-3 mr-1" />
              )}
              Promote to lead
            </Button>
            {promoteError && (
              <span className="text-xs text-destructive">{promoteError}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
