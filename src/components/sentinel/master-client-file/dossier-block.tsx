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

export type LeadDossierType = "absentee_landlord" | "probate" | "generic";

interface DossierBlockProps {
  leadId: string;
  propertyId?: string | null;
  leadType?: LeadDossierType;
}

export function DossierBlock({ leadId, propertyId, leadType }: DossierBlockProps) {
  const { dossier, loading, error, refetch } = useDossier(leadId);

  useEffect(() => {
    if (leadId) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  return (
    <div className="space-y-2">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading intelligence...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive py-1">
          <AlertCircle className="h-3 w-3" />
          Could not load dossier: {error}
        </div>
      )}

      {!loading && dossier && <DossierRenderer dossier={dossier} leadType={leadType} onPromoted={refetch} />}

      {!loading && !error && !dossier && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50 py-2 px-1">
          <ShieldCheck className="h-3 w-3 shrink-0" />
          Intelligence report pending - run research to generate
        </div>
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

interface DossierRendererProps {
  dossier: DossierRow;
  leadType?: LeadDossierType;
  onPromoted: () => void;
}

function DossierRenderer({ dossier, leadType, onPromoted }: DossierRendererProps) {
  const rawType = dossier.raw_ai_output?.dossier_type as string | undefined;
  const resolvedType: LeadDossierType =
    leadType ?? (rawType === "absentee_landlord" ? "absentee_landlord" : "generic");

  if (resolvedType === "absentee_landlord") {
    const topFacts = Array.isArray(dossier.top_facts) ? dossier.top_facts : [];
    const pseudoArtifacts = topFacts.map((fact, index) => ({
      id: `tf-${index}`,
      source_type: "other" as const,
      source_label: fact.source ?? null,
      source_url: null,
      extracted_notes: fact.fact,
      captured_at: dossier.created_at,
    }));
    const brief = deriveAbsenteeDossierBrief(pseudoArtifacts);

    return <AbsenteeDossierBrief dossier={dossier} brief={brief} onPromoted={onPromoted} />;
  }

  return <DossierContent dossier={dossier} onPromoted={onPromoted} />;
}

interface DossierContentProps {
  dossier: DossierRow;
  onPromoted: () => void;
}

function DossierContent({ dossier, onPromoted }: DossierContentProps) {
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const reviewedDate = dossier.reviewed_at
    ? new Date(dossier.reviewed_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
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
    <div className="rounded-md border border-border bg-muted/50 dark:border-border/40 dark:bg-muted/20 p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium text-foreground dark:text-foreground">
          <ShieldCheck className="h-4 w-4" />
          Reviewed Intelligence
        </div>
        <Badge
          variant="outline"
          className="text-xs border-border text-foreground dark:border-border dark:text-foreground"
        >
          {dossier.status === "promoted" ? "Promoted to lead" : "Reviewed"}
        </Badge>
      </div>

      {dossier.situation_summary && (
        <p className="text-sm text-foreground leading-snug">{dossier.situation_summary}</p>
      )}

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

      {Array.isArray(dossier.top_facts) && dossier.top_facts.length > 0 && (
        <div className="flex items-start gap-2">
          <List className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
              Key facts
            </span>
            <ul className="space-y-1">
              {(dossier.top_facts as DossierTopFact[]).map((fact, index) => (
                <li key={index} className="text-sm leading-snug">
                  <span>{fact.fact}</span>
                  {fact.source && <span className="ml-1 text-xs text-muted-foreground">({fact.source})</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Separator />

      {Array.isArray(dossier.verification_checklist) && dossier.verification_checklist.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
            Verify before calling
          </span>
          <ul className="space-y-1.5">
            {(dossier.verification_checklist as DossierVerificationItem[]).map((item, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Checkbox checked={item.verified} disabled className="h-3.5 w-3.5 opacity-60" />
                <span className={item.verified ? "line-through text-muted-foreground" : ""}>{item.item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(dossier.source_links) && dossier.source_links.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Sources
          </span>
          <ul className="space-y-1">
            {(dossier.source_links as DossierSourceLink[]).map((link, index) => (
              <li key={index}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-foreground dark:text-foreground hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-foreground" />
          {reviewedDate ? `Reviewed ${reviewedDate}` : "Reviewed"}
        </div>

        {dossier.status === "reviewed" && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2 border-border text-foreground hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted"
              onClick={handlePromote}
              disabled={promoting}
            >
              {promoting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Flag className="h-3 w-3 mr-1" />}
              Promote to lead
            </Button>
            {promoteError && <span className="text-xs text-destructive">{promoteError}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
