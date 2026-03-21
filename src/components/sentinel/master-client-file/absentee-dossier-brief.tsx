"use client";

/**
 * AbsenteeDossierBrief
 *
 * Lead-type-aware dossier renderer for absentee-landlord leads.
 * Shown in place of generic DossierContent when:
 *   dossier.raw_ai_output?.dossier_type === "absentee_landlord"
 *
 * Renders:
 *   - Mailing mismatch flag (confirmed vs probable)
 *   - Ownership tenure estimate
 *   - Tenant / occupancy context
 *   - Management fatigue indicators
 *   - Financial / burden signals (tax delinquency, etc.)
 *   - Suggested call angle
 *   - Verification checklist
 *   - Source links
 *   - Promote to lead button (Adam-only, reviewed dossiers)
 *
 * Design rules:
 *   - Confidence labels tied to source quality (not AI-assigned)
 *   - Each section only renders when data is present
 *   - "Verified" / "Confirmed" = operator-captured public record
 *   - "Probable" / "Possible" = keyword match from notes — labeled as such
 *   - Read-only; no CRM writes except through the existing promote path
 */

import { useState } from "react";
import {
  MapPin, Home, Users, TrendingDown, AlertTriangle,
  Lightbulb, CheckCircle2, ExternalLink, ShieldCheck,
  Loader2, Flag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { promoteDossier } from "@/hooks/use-dossier";
import type { DossierRow } from "@/hooks/use-dossier";
import {
  ABSENTEE_CONFIDENCE_DISPLAY,
  type AbsenteeDossierBrief as AbsenteeBrief,
  type AbsenteeDossierSignal,
} from "@/lib/absentee-dossier";

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfBadge({ confidence }: { confidence: AbsenteeDossierSignal["confidence"] }) {
  const d = ABSENTEE_CONFIDENCE_DISPLAY[confidence];
  return (
    <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${d.className}`}>
      {d.label}
    </span>
  );
}

// ── Signal row ────────────────────────────────────────────────────────────────

function SignalRow({ signal, icon: Icon }: {
  signal: AbsenteeDossierSignal;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/50 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-foreground/75">{signal.label}</span>
          <ConfBadge confidence={signal.confidence} />
        </div>
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed mt-0.5">{signal.detail}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[9px] text-muted-foreground/30 italic">{signal.sourceLabel}</span>
          {signal.sourceUrl && (
            <a
              href={signal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[9px] text-primary/40 hover:text-primary/70"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          {title}
        </span>
      </div>
      <div className="pl-5 space-y-1.5">{children}</div>
    </div>
  );
}

// ── AbsenteeDossierBrief ──────────────────────────────────────────────────────

interface AbsenteeDossierBriefProps {
  dossier:     DossierRow;
  brief:       AbsenteeBrief;
  isAdminView: boolean;
  onPromoted:  () => void;
}

export function AbsenteeDossierBrief({
  dossier,
  brief,
  isAdminView,
  onPromoted,
}: AbsenteeDossierBriefProps) {
  const [promoting,    setPromoting]    = useState(false);
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

  const hasFatigue = brief.fatigueIndicators.length > 0;
  const hasBurden  = brief.burdenContext.length > 0;

  return (
    <div className="rounded-md border border-border bg-muted/30 dark:border-border/30 dark:bg-muted/10 p-3 space-y-3 text-sm">

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium text-foreground dark:text-foreground">
          <ShieldCheck className="h-4 w-4" />
          Absentee-Landlord Brief
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-xs border-border text-foreground dark:border-border dark:text-foreground"
          >
            {dossier.status === "promoted" ? "Promoted to lead" : "Reviewed"}
          </Badge>
          <Badge
            variant="outline"
            className="text-[9px] border-white/10 text-muted-foreground/40"
          >
            {brief.sourceArtifactCount} artifact{brief.sourceArtifactCount !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Mailing mismatch */}
      {brief.mailingMismatch && (
        <Section title="Out-of-area ownership" icon={MapPin}>
          <SignalRow signal={brief.mailingMismatch} />
        </Section>
      )}

      {/* Ownership tenure */}
      {brief.ownershipTenure && (
        <Section title="Ownership tenure" icon={Home}>
          <SignalRow signal={brief.ownershipTenure} />
        </Section>
      )}

      {/* Tenant context */}
      {brief.tenantContext && (
        <Section title="Occupancy / tenant context" icon={Users}>
          <SignalRow signal={brief.tenantContext} />
        </Section>
      )}

      {/* Fatigue indicators */}
      {hasFatigue && (
        <Section title="Management fatigue signals" icon={TrendingDown}>
          {brief.fatigueIndicators.map((sig, i) => (
            <SignalRow key={i} signal={sig} />
          ))}
        </Section>
      )}

      {/* Burden context */}
      {hasBurden && (
        <Section title="Financial / burden context" icon={AlertTriangle}>
          {brief.burdenContext.map((sig, i) => (
            <SignalRow key={i} signal={sig} />
          ))}
        </Section>
      )}

      {/* Call angle */}
      {brief.callAngle && (
        <Section title="Suggested call approach" icon={Lightbulb}>
          <p className="text-[11px] text-foreground/65 leading-relaxed">{brief.callAngle}</p>
        </Section>
      )}

      <Separator />

      {/* Verification checklist */}
      {brief.verificationChecklist.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
            Verify before calling
          </span>
          <ul className="space-y-1.5 pl-0.5">
            {brief.verificationChecklist.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Checkbox checked={false} disabled className="h-3.5 w-3.5 mt-0.5 opacity-50" />
                <span>
                  {v.item}
                  <span className="ml-1.5 text-xs text-muted-foreground/50 italic">({v.sourceLabel})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source links from dossier record (assessor, mailing, etc.) */}
      {Array.isArray(dossier.source_links) && (dossier.source_links as Array<{ label: string; url: string }>).length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Sources
          </span>
          <ul className="space-y-1 pl-0.5">
            {(dossier.source_links as Array<{ label: string; url: string }>).map((link, i) => (
              <li key={i}>
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

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-foreground" />
          {reviewedDate ? `Reviewed ${reviewedDate}` : "Reviewed"}
          <span className="ml-1 text-[9px] text-muted-foreground/30 italic">
            — confidence labels based on source type, not AI scoring
          </span>
        </div>

        {isAdminView && dossier.status === "reviewed" && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2 border-border text-foreground hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted"
              onClick={handlePromote}
              disabled={promoting}
            >
              {promoting
                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                : <Flag className="h-3 w-3 mr-1" />}
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
