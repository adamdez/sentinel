"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSearch,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  ShieldAlert,
} from "lucide-react";
import {
  useDossierArtifacts,
  SOURCE_TYPE_LABELS,
  CLIENT_SOURCE_POLICIES,
  POLICY_BADGE,
} from "@/hooks/use-dossier-artifacts";
import type {
  ArtifactSourceType,
  ArtifactRow,
} from "@/hooks/use-dossier-artifacts";
import type { LeadDossierType } from "./dossier-block";
import { FactAssertionsPanel } from "./fact-assertions-panel";
import { RunHistoryStrip } from "./run-history-strip";
import { useResearchRuns } from "@/hooks/use-research-runs";

// ── Props ─────────────────────────────────────────────────────────────────────

interface EvidenceCaptureProps {
  leadId: string;
  propertyId?: string | null;
  onDossierCompiled?: () => void;
  leadType?: LeadDossierType;
}

// ── Source type options ───────────────────────────────────────────────────────

const PROBATE_SOURCE_TYPES: { value: ArtifactSourceType; label: string }[] = [
  { value: "probate_filing",  label: "Probate filing" },
  { value: "obituary",        label: "Obituary" },
  { value: "assessor",        label: "Assessor / tax record" },
  { value: "court_record",    label: "Court record" },
  { value: "news",            label: "News / media" },
  { value: "other",           label: "Other" },
];

const ABSENTEE_SOURCE_TYPES: { value: ArtifactSourceType; label: string }[] = [
  { value: "mailing_address_mismatch",   label: "Mailing address mismatch" },
  { value: "assessor",                   label: "Assessor / tax record" },
  { value: "rental_listing",             label: "Rental listing" },
  { value: "property_management_record", label: "Property management record" },
  { value: "tax_delinquency",            label: "Tax delinquency record" },
  { value: "court_record",               label: "Court record" },
  { value: "other",                      label: "Other" },
];

// Fall-through for unknown/generic leads — show all types
const ALL_SOURCE_TYPES: { value: ArtifactSourceType; label: string }[] = [
  { value: "mailing_address_mismatch",   label: "Mailing address mismatch" },
  { value: "assessor",                   label: "Assessor / tax record" },
  { value: "probate_filing",             label: "Probate filing" },
  { value: "obituary",                   label: "Obituary" },
  { value: "rental_listing",             label: "Rental listing" },
  { value: "property_management_record", label: "Property management record" },
  { value: "tax_delinquency",            label: "Tax delinquency record" },
  { value: "court_record",               label: "Court record" },
  { value: "news",                       label: "News / media" },
  { value: "other",                      label: "Other" },
];

function getSourceTypes(leadType?: LeadDossierType) {
  if (leadType === "absentee_landlord") return ABSENTEE_SOURCE_TYPES;
  if (leadType === "probate") return PROBATE_SOURCE_TYPES;
  return ALL_SOURCE_TYPES;
}

// ── EvidenceCapturePanel ──────────────────────────────────────────────────────
// Adam-only panel that lets operator capture public-source evidence for a lead
// and compile it into a proposed dossier for review.

export function EvidenceCapturePanel({
  leadId,
  propertyId,
  onDossierCompiled,
  leadType,
}: EvidenceCaptureProps) {
  const availableSourceTypes = getSourceTypes(leadType);
  const { artifacts, loading, error, refetch, addArtifact, deleteArtifact, compileDossier } =
    useDossierArtifacts(leadId);

  const {
    runs,
    activeRun,
    loading: runsLoading,
    refetch: refetchRuns,
    startRun,
    closeRun,
    markCompiled,
  } = useResearchRuns(leadId);

  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<ArtifactSourceType>("probate_filing");
  const [sourceLabel, setSourceLabel] = useState("");
  const [extractedNotes, setExtractedNotes] = useState("");

  // Compile state
  const [compileBusy, setCompileBusy] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileSuccess, setCompileSuccess] = useState<string | null>(null);
  const [compilePolicyFlags, setCompilePolicyFlags] = useState<Array<{ source_type: string; policy: string }>>([]);
  const [situationSummary, setSituationSummary] = useState("");

  // Capture-time policy warning (shown after adding a source)
  const [captureWarning, setCaptureWarning] = useState<{ policy: string; label: string; description: string } | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (leadId && expanded) {
      refetch();
      refetchRuns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, expanded]);

  function resetForm() {
    setSourceUrl("");
    setSourceType("probate_filing");
    setSourceLabel("");
    setExtractedNotes("");
    setFormError(null);
    setShowForm(false);
  }

  async function handleAddArtifact() {
    if (!sourceUrl.trim() && !extractedNotes.trim()) {
      setFormError("Enter a source URL, extracted notes, or both.");
      return;
    }
    setFormBusy(true);
    setFormError(null);
    setCaptureWarning(null);
    try {
      const result = await addArtifact({
        source_url: sourceUrl.trim() || undefined,
        source_type: sourceType,
        source_label: sourceLabel.trim() || undefined,
        extracted_notes: extractedNotes.trim() || undefined,
        property_id: propertyId ?? undefined,
        run_id: activeRun?.id ?? null,
      });
      // Surface policy warning from server (authoritative) if present,
      // otherwise fall back to client-side static map.
      if (result.policy_warning) {
        setCaptureWarning(result.policy_warning);
      }
      resetForm();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteArtifact(id);
    } catch {
      // ignore — artifact stays in list on error
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCompile() {
    setCompileBusy(true);
    setCompileError(null);
    setCompileSuccess(null);
    setCompilePolicyFlags([]);
    try {
      const runId = activeRun?.id ?? null;
      const result = await compileDossier({
        situation_summary: situationSummary.trim() || undefined,
        property_id: propertyId ?? undefined,
        run_id: runId,
        // Tag dossier type so renderer picks the right brief layout
        dossier_type: leadType === "absentee_landlord" ? "absentee_landlord" : undefined,
      });
      // Close the active run and link to the new dossier
      if (runId && result.dossier_id) {
        try { await markCompiled(runId, result.dossier_id); }
        catch { /* best-effort — don't block success message */ }
      }
      setCompilePolicyFlags(result.policy_flags ?? []);
      const excludedNote = result.excluded_blocked > 0
        ? ` (${result.excluded_blocked} blocked source${result.excluded_blocked !== 1 ? "s" : ""} excluded)`
        : "";
      setCompileSuccess(
        `Proposed dossier created from ${result.compiled_from} source${result.compiled_from !== 1 ? "s" : ""}${excludedNote}. Go to Dossier Review to approve it.`
      );
      setSituationSummary("");
      onDossierCompiled?.();
    } catch (err: unknown) {
      setCompileError(err instanceof Error ? err.message : "Compile failed");
    } finally {
      setCompileBusy(false);
    }
  }

  const artifactCount = artifacts.length;

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 overflow-hidden">
      {/* ── Header ── */}
      <button
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <FileSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-muted-foreground">
            Research Evidence
          </span>
          {artifactCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {artifactCount}
            </Badge>
          )}
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
        }
      </button>

      {/* ── Run history strip ── */}
      {expanded && (
        <RunHistoryStrip
          runs={runs}
          activeRun={activeRun}
          loading={runsLoading}
          onStartRun={async () => {
            await startRun();
          }}
          onCloseRun={async (runId) => {
            await closeRun(runId, "closed");
          }}
        />
      )}

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-border">
          {/* Artifacts list */}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading sources…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {error}
            </div>
          )}

          {!loading && !error && artifactCount === 0 && !showForm && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No sources captured yet. Add a probate filing, obituary, or assessor record.
            </div>
          )}

          {artifacts.map((artifact: ArtifactRow) => (
            <ArtifactRowItem
              key={artifact.id}
              artifact={artifact}
              deleting={deletingId === artifact.id}
              onDelete={handleDelete}
            />
          ))}

          {/* Capture-time policy warning */}
          {captureWarning && (
            <div className={`mx-3 mb-2 flex items-start gap-2 rounded-[8px] border px-2.5 py-2 text-xs ${
              captureWarning.policy === "blocked"
                ? "border-border/20 bg-muted/[0.04] text-foreground/80"
                : "border-border/20 bg-muted/[0.04] text-foreground/80"
            }`}>
              {captureWarning.policy === "blocked"
                ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              }
              <div className="min-w-0">
                <p className="font-medium">{captureWarning.label} source added</p>
                <p className="text-[10px] opacity-80 mt-0.5">{captureWarning.description}</p>
              </div>
              <button
                onClick={() => setCaptureWarning(null)}
                className="ml-auto text-[10px] opacity-50 hover:opacity-90 shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {/* Add source form */}
          {showForm && (
            <div className="px-3 py-3 space-y-2 border-t border-border bg-muted/10">
              <p className="text-xs font-medium text-muted-foreground mb-1">Add source</p>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Input
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="Source URL (e.g. spokane courts probate link)"
                    className="h-7 text-xs"
                  />
                </div>
                <select
                  value={sourceType}
                  onChange={e => setSourceType(e.target.value as ArtifactSourceType)}
                  className="h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {availableSourceTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <Input
                  value={sourceLabel}
                  onChange={e => setSourceLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="h-7 text-xs"
                />
                <div className="col-span-2">
                  <Textarea
                    value={extractedNotes}
                    onChange={e => setExtractedNotes(e.target.value)}
                    placeholder="Key facts extracted from this source (e.g. 'Filed 2025-01-12, estate case #24-4-00123-32, petitioner: Jane Smith')"
                    className="text-xs min-h-[60px]"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs text-destructive">{formError}</p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={handleAddArtifact}
                  disabled={formBusy}
                >
                  {formBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Save source
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={resetForm}
                  disabled={formBusy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ── Fact assertions (Adam-only — grouped by artifact) ── */}
          {artifactCount > 0 && (
            <div className="px-3 py-2.5 border-t border-border bg-muted/5">
              <FactAssertionsPanel leadId={leadId} artifacts={artifacts} />
            </div>
          )}

          {/* Action strip */}
          <div className="border-t border-border px-3 py-2.5 space-y-2 bg-muted/10">
            {!showForm && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2"
                onClick={() => setShowForm(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add source
              </Button>
            )}

            {artifactCount > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Situation summary (optional — you can edit in review)
                    </label>
                    <Textarea
                      value={situationSummary}
                      onChange={e => setSituationSummary(e.target.value)}
                      placeholder="Brief summary of the situation based on your research…"
                      className="text-xs min-h-[48px]"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-muted hover:bg-muted text-white w-full"
                    onClick={handleCompile}
                    disabled={compileBusy}
                  >
                    {compileBusy
                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      : <BookOpen className="h-3 w-3 mr-1" />
                    }
                    Compile to proposed dossier ({artifactCount} source{artifactCount !== 1 ? "s" : ""})
                  </Button>
                  {compileError && (
                    <p className="text-xs text-destructive">{compileError}</p>
                  )}
                  {compileSuccess && (
                    <div className="flex items-start gap-1.5 text-xs text-foreground dark:text-foreground">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                      {compileSuccess}
                    </div>
                  )}
                  {compilePolicyFlags.length > 0 && (
                    <div className="rounded-[8px] border border-border/20 bg-muted/[0.04] px-2.5 py-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-foreground/80 font-medium">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {compilePolicyFlags.length} source{compilePolicyFlags.length !== 1 ? "s" : ""} need review attention
                      </div>
                      {compilePolicyFlags.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                          <span className={`font-medium ${f.policy === "blocked" ? "text-foreground/70" : "text-foreground/60"}`}>
                            {f.policy === "blocked" ? "Blocked" : "Review required"}:
                          </span>
                          {SOURCE_TYPE_LABELS[f.source_type as ArtifactSourceType] ?? f.source_type}
                        </div>
                      ))}
                      <p className="text-[9px] text-muted-foreground/40 pt-0.5">
                        These sources are flagged in the dossier record. Review carefully before promoting.
                      </p>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">
                    Compiling creates a <strong>proposed</strong> dossier — it must be reviewed and approved before it updates the lead record.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ArtifactRowItem ───────────────────────────────────────────────────────────

function ArtifactRowItem({
  artifact,
  deleting,
  onDelete,
}: {
  artifact: ArtifactRow;
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  const label = artifact.source_label ?? SOURCE_TYPE_LABELS[artifact.source_type] ?? artifact.source_type;
  const capturedDate = new Date(artifact.captured_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });

  // Client-side policy badge (static defaults — authoritative values in source_policies table)
  const clientPolicy = CLIENT_SOURCE_POLICIES[artifact.source_type] ?? "review_required";
  const policyBadge  = POLICY_BADGE[clientPolicy];

  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border/50 last:border-0 group">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
            {SOURCE_TYPE_LABELS[artifact.source_type] ?? artifact.source_type}
          </Badge>
          {clientPolicy !== "approved" && (
            <Badge variant="outline" className={`text-[9px] h-3.5 px-1 shrink-0 ${policyBadge.className}`}>
              {policyBadge.label}
            </Badge>
          )}
          <span className="text-xs font-medium truncate">{label}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{capturedDate}</span>
        </div>
        {artifact.extracted_notes && (
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
            {artifact.extracted_notes}
          </p>
        )}
        {artifact.source_url && (
          <a
            href={artifact.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] text-foreground dark:text-foreground hover:underline"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            View source
          </a>
        )}
        {artifact.dossier_id && (
          <span className="text-[10px] text-foreground dark:text-foreground">
            ✓ Compiled into dossier
          </span>
        )}
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 hover:text-destructive"
        onClick={() => onDelete(artifact.id)}
        disabled={deleting}
        title="Remove source"
      >
        {deleting
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <Trash2 className="h-3 w-3" />
        }
      </button>
    </div>
  );
}
