"use client";

import { useState } from "react";
import {
  MapPin,
  Home,
  Users,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Loader2,
  Flag,
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

function ConfBadge({ confidence }: { confidence: AbsenteeDossierSignal["confidence"] }) {
  const display = ABSENTEE_CONFIDENCE_DISPLAY[confidence];
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${display.className}`}
    >
      {display.label}
    </span>
  );
}

function SignalRow({
  signal,
  icon: Icon,
}: {
  signal: AbsenteeDossierSignal;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/50 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground/75">{signal.label}</span>
          <ConfBadge confidence={signal.confidence} />
        </div>
        <p className="text-sm text-muted-foreground/60 leading-relaxed mt-0.5">{signal.detail}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground/30 italic">{signal.sourceLabel}</span>
          {signal.sourceUrl && (
            <a
              href={signal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-xs text-primary/40 hover:text-primary/70"
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

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/50">{title}</span>
      </div>
      <div className="pl-5 space-y-1.5">{children}</div>
    </div>
  );
}

interface AbsenteeDossierBriefProps {
  dossier: DossierRow;
  brief: AbsenteeBrief;
  onPromoted: () => void;
}

export function AbsenteeDossierBrief({ dossier, brief, onPromoted }: AbsenteeDossierBriefProps) {
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

  const hasFatigue = brief.fatigueIndicators.length > 0;
  const hasBurden = brief.burdenContext.length > 0;

  return (
    <div className="rounded-md border border-border bg-muted/30 dark:border-border/30 dark:bg-muted/10 p-3 space-y-3 text-sm">
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
          <Badge variant="outline" className="text-xs border-overlay-10 text-muted-foreground/40">
            {brief.sourceArtifactCount} artifact{brief.sourceArtifactCount !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {brief.mailingMismatch && (
        <Section title="Out-of-area ownership" icon={MapPin}>
          <SignalRow signal={brief.mailingMismatch} />
        </Section>
      )}

      {brief.ownershipTenure && (
        <Section title="Ownership tenure" icon={Home}>
          <SignalRow signal={brief.ownershipTenure} />
        </Section>
      )}

      {brief.tenantContext && (
        <Section title="Occupancy / tenant context" icon={Users}>
          <SignalRow signal={brief.tenantContext} />
        </Section>
      )}

      {hasFatigue && (
        <Section title="Management fatigue signals" icon={TrendingDown}>
          {brief.fatigueIndicators.map((signal, index) => (
            <SignalRow key={index} signal={signal} />
          ))}
        </Section>
      )}

      {hasBurden && (
        <Section title="Financial / burden context" icon={AlertTriangle}>
          {brief.burdenContext.map((signal, index) => (
            <SignalRow key={index} signal={signal} />
          ))}
        </Section>
      )}

      {brief.callAngle && (
        <Section title="Suggested call approach" icon={Lightbulb}>
          <p className="text-sm text-foreground/65 leading-relaxed">{brief.callAngle}</p>
        </Section>
      )}

      <Separator />

      {brief.verificationChecklist.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
            Verify before calling
          </span>
          <ul className="space-y-1.5 pl-0.5">
            {brief.verificationChecklist.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <Checkbox checked={false} disabled className="h-3.5 w-3.5 mt-0.5 opacity-50" />
                <span>
                  {item.item}
                  <span className="ml-1.5 text-xs text-muted-foreground/50 italic">({item.sourceLabel})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(dossier.source_links) &&
        (dossier.source_links as Array<{ label: string; url: string }>).length > 0 && (
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
              Sources
            </span>
            <ul className="space-y-1 pl-0.5">
              {(dossier.source_links as Array<{ label: string; url: string }>).map((link, index) => (
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
          <span className="ml-1 text-xs text-muted-foreground/30 italic">
            - confidence labels based on source type, not AI scoring
          </span>
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
