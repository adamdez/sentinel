"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileUp, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { buildTinaChecklist } from "@/tina/lib/checklist";
import {
  analyzeTinaClientIntakeFiles,
  buildTinaClientIntakeBatchReview,
  buildTinaClientIntakeProfilePatch,
  resolveTinaClientIntakeCandidates,
  TINA_CLIENT_INTAKE_REQUEST_OPTIONS,
  type TinaClientIntakeBatchReview,
  type TinaClientIntakeRequestId,
} from "@/tina/lib/client-intake-import";
import { buildTinaClientIntakeReviewReport } from "@/tina/lib/client-intake-review";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { useTinaDraft } from "@/tina/hooks/use-tina-draft";
import { buildTinaGuidedShellContract } from "@/tina/lib/guided-shell";
import { deriveCurrentFileTags } from "@/tina/lib/live-acceptance";
import { buildTinaReviewerCorrectionTargets } from "@/tina/lib/reviewer-correction-capture";
import type {
  TinaDocumentReading,
  TinaReviewerOutcomePhase,
  TinaReviewerOutcomeVerdict,
  TinaReviewerOverrideSeverity,
  TinaStoredDocument,
} from "@/tina/types";

type ImportFormat = "csv" | "json" | "auto";

function inferFormatFromName(name: string): ImportFormat {
  if (name.toLowerCase().endsWith(".json")) return "json";
  if (name.toLowerCase().endsWith(".csv")) return "csv";
  return "auto";
}

function getStatusTone(status: "blocked" | "needs_input" | "ready_to_send") {
  if (status === "ready_to_send") {
    return "border-emerald-300/20 bg-emerald-300/10 text-emerald-50";
  }

  if (status === "blocked") {
    return "border-rose-300/20 bg-rose-300/10 text-rose-50";
  }

  return "border-amber-300/20 bg-amber-300/10 text-amber-50";
}

export function TinaSimpleWorkspace() {
  const {
    draft,
    hydrated,
    captureReviewerCorrection,
    importReviewerTrafficBatch,
    ingestDocumentWithReading,
    syncStatus,
    updateProfile,
  } = useTinaDraft();
  const guidedShell = useMemo(() => buildTinaGuidedShellContract(draft), [draft]);
  const currentTags = useMemo(() => deriveCurrentFileTags(draft), [draft]);
  const correctionTargets = useMemo(() => buildTinaReviewerCorrectionTargets(draft), [draft]);
  const intakeReport = useMemo(() => buildTinaClientIntakeReviewReport(draft), [draft]);
  const checklist = useMemo(
    () => buildTinaChecklist(draft, recommendTinaFilingLane(draft.profile)),
    [draft]
  );
  const [intakeReview, setIntakeReview] = useState<TinaClientIntakeBatchReview | null>(null);
  const [intakeFiles, setIntakeFiles] = useState<File[]>([]);
  const [intakeOverrides, setIntakeOverrides] = useState<Partial<Record<string, TinaClientIntakeRequestId>>>({});
  const [isAnalyzingIntake, setIsAnalyzingIntake] = useState(false);
  const [isImportingIntake, setIsImportingIntake] = useState(false);
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);
  const [cpaDownloadState, setCpaDownloadState] = useState<"idle" | "running" | "error">("idle");
  const [cpaDownloadMessage, setCpaDownloadMessage] = useState<string | null>(null);
  const [importContent, setImportContent] = useState("");
  const [importFormat, setImportFormat] = useState<ImportFormat>("auto");
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [decidedBy, setDecidedBy] = useState("");
  const [importSummary, setImportSummary] = useState<{
    overrides: number;
    outcomes: number;
    warnings: string[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [correctionTargetValue, setCorrectionTargetValue] = useState("");
  const [correctionPhase, setCorrectionPhase] = useState<TinaReviewerOutcomePhase>("package");
  const [correctionVerdict, setCorrectionVerdict] = useState<TinaReviewerOutcomeVerdict>("revised");
  const [correctionSummary, setCorrectionSummary] = useState("");
  const [correctionLessons, setCorrectionLessons] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionBeforeState, setCorrectionBeforeState] = useState("");
  const [correctionAfterState, setCorrectionAfterState] = useState("");
  const [correctionSeverity, setCorrectionSeverity] =
    useState<TinaReviewerOverrideSeverity>("material");
  const [correctionDecidedBy, setCorrectionDecidedBy] = useState("");
  const [correctionSummaryCard, setCorrectionSummaryCard] = useState<{
    targetLabel: string;
    verdict: TinaReviewerOutcomeVerdict;
    overrideSaved: boolean;
  } | null>(null);

  useEffect(() => {
    if (correctionTargets.length === 0) {
      setCorrectionTargetValue("");
      return;
    }

    if (!correctionTargets.some((target) => target.value === correctionTargetValue)) {
      setCorrectionTargetValue(correctionTargets[0].value);
    }
  }, [correctionTargets, correctionTargetValue]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportContent(text);
    setImportFileName(file.name);
    setImportFormat(inferFormatFromName(file.name));
    setImportSummary(null);
  }

  async function handleIntakeFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setIsAnalyzingIntake(true);
    setIntakeMessage(`Tina is reviewing ${files.length} client file${files.length === 1 ? "" : "s"}...`);

    try {
      const review = await analyzeTinaClientIntakeFiles(files);
      setIntakeFiles(files);
      setIntakeReview(review);
      setIntakeOverrides({});
      setIntakeMessage(review.summary);
    } catch {
      setIntakeFiles([]);
      setIntakeReview(null);
      setIntakeOverrides({});
      setIntakeMessage("Tina could not analyze that intake batch yet. Try PDF, CSV, or spreadsheet files.");
    } finally {
      setIsAnalyzingIntake(false);
      input.value = "";
    }
  }

  async function handleIntakeImport() {
    if (!intakeReview || intakeFiles.length === 0) return;

    setIsImportingIntake(true);
    setIntakeMessage("Tina is importing the client intake packet into this workspace...");

    try {
      const resolvedCandidates = resolveTinaClientIntakeCandidates({
        review: intakeReview,
        overrides: intakeOverrides,
      });
      let importedCount = 0;

      for (const file of intakeFiles) {
        const candidate = resolvedCandidates.find((item) => item.fileName === file.name);
        if (!candidate) continue;

        const headers = await sentinelAuthHeaders(false);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", candidate.category);
        formData.append("taxYear", draft.profile.taxYear || candidate.taxYearHint || "unknown-year");
        if (candidate.requestId !== "unclassified") {
          formData.append("requestId", candidate.requestId);
          formData.append("requestLabel", candidate.requestLabel);
        }

        const uploadRes = await fetch("/api/tina/documents", {
          method: "POST",
          headers,
          body: formData,
        });
        if (!uploadRes.ok) {
          throw new Error(`upload failed for ${file.name}`);
        }

        const uploadPayload = (await uploadRes.json()) as { document?: TinaStoredDocument };
        if (!uploadPayload.document) {
          throw new Error(`missing uploaded document for ${file.name}`);
        }

        const readHeaders = await sentinelAuthHeaders();
        const readRes = await fetch("/api/tina/documents/read", {
          method: "POST",
          headers: readHeaders,
          body: JSON.stringify({ document: uploadPayload.document }),
        });
        if (!readRes.ok) {
          throw new Error(`read failed for ${file.name}`);
        }

        const readPayload = (await readRes.json()) as { reading?: TinaDocumentReading };
        if (!readPayload.reading) {
          throw new Error(`missing document reading for ${file.name}`);
        }

        ingestDocumentWithReading(uploadPayload.document, readPayload.reading, candidate.markAsPriorReturn);
        importedCount += 1;
      }

      const patch = buildTinaClientIntakeProfilePatch(resolvedCandidates);
      if (patch.businessName && draft.profile.businessName.trim().length === 0) {
        updateProfile("businessName", patch.businessName);
      }
      if (patch.taxYear && draft.profile.taxYear.trim().length === 0) {
        updateProfile("taxYear", patch.taxYear);
      }
      if (patch.entityType && draft.profile.entityType === "unsure") {
        updateProfile("entityType", patch.entityType);
      }
      if (patch.hasPayroll && !draft.profile.hasPayroll) {
        updateProfile("hasPayroll", true);
      }
      if (patch.paysContractors && !draft.profile.paysContractors) {
        updateProfile("paysContractors", true);
      }
      if (patch.hasFixedAssets && !draft.profile.hasFixedAssets) {
        updateProfile("hasFixedAssets", true);
      }
      if (patch.hasInventory && !draft.profile.hasInventory) {
        updateProfile("hasInventory", true);
      }
      if (patch.collectsSalesTax && !draft.profile.collectsSalesTax) {
        updateProfile("collectsSalesTax", true);
      }

      setIntakeMessage(
        `Tina imported ${importedCount} client file${
          importedCount === 1 ? "" : "s"
        } into the workspace.`
      );
      setIntakeReview(buildTinaClientIntakeBatchReview(resolvedCandidates));
      setIntakeFiles([]);
    } catch {
      setIntakeMessage("Tina could not import that intake batch yet.");
    } finally {
      setIsImportingIntake(false);
    }
  }

  function clearIntakeBatch() {
    setIntakeFiles([]);
    setIntakeReview(null);
    setIntakeOverrides({});
    setIntakeMessage(null);
  }

  async function downloadCpaPacket() {
    setCpaDownloadState("running");
    setCpaDownloadMessage("Tina is packaging her work for CPA review...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/cpa-packet/export", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("packet export failed");

      const payload = (await res.json()) as {
        fileName?: string;
        mimeType?: string;
        contents?: string;
      };

      if (!payload.fileName || !payload.mimeType || typeof payload.contents !== "string") {
        throw new Error("missing export payload");
      }

      const blob = new Blob([payload.contents], { type: payload.mimeType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setCpaDownloadState("idle");
      setCpaDownloadMessage("Tina downloaded her CPA review packet.");
    } catch {
      setCpaDownloadState("error");
      setCpaDownloadMessage("Tina could not download the CPA packet yet. Try again in a moment.");
    }
  }

  function openFullWorkspace() {
    window.location.href = "/tina";
  }

  function handleImport() {
    if (importContent.trim().length === 0) return;

    setIsImporting(true);

    try {
      const imported = importReviewerTrafficBatch({
        content: importContent,
        format: importFormat === "auto" ? undefined : importFormat,
        defaultDecidedBy: decidedBy.trim().length > 0 ? decidedBy.trim() : null,
      });

      setImportSummary({
        overrides: imported.overrides.length,
        outcomes: imported.outcomes.length,
        warnings: imported.warnings,
      });
    } finally {
      setIsImporting(false);
    }
  }

  function clearImport() {
    setImportContent("");
    setImportFileName(null);
    setImportFormat("auto");
    setDecidedBy("");
    setImportSummary(null);
  }

  function handleCaptureCorrection() {
    const target = correctionTargets.find((item) => item.value === correctionTargetValue);
    if (!target) return;

    const captured = captureReviewerCorrection({
      targetType: target.targetType,
      targetId: target.targetId,
      targetLabel: target.label,
      phase: correctionPhase,
      verdict: correctionVerdict,
      summary: correctionSummary,
      lessons: correctionLessons
        .split(/\r?\n|[|;]/)
        .map((lesson) => lesson.trim())
        .filter((lesson) => lesson.length > 0),
      caseTags: currentTags,
      decidedBy: correctionDecidedBy.trim().length > 0 ? correctionDecidedBy.trim() : null,
      sourceDocumentIds: target.sourceDocumentIds,
      beforeState: correctionBeforeState,
      afterState: correctionAfterState,
      reason: correctionReason,
      overrideSeverity: correctionSeverity,
    });

    setCorrectionSummaryCard({
      targetLabel: target.label,
      verdict: captured.outcome.verdict,
      overrideSaved: captured.override !== null,
    });
    setCorrectionSummary("");
    setCorrectionLessons("");
    setCorrectionReason("");
    setCorrectionBeforeState("");
    setCorrectionAfterState("");
  }

  return (
    <div className="space-y-5">
      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusTone(guidedShell.status)}`}>
                  {guidedShell.status === "ready_to_send"
                    ? "Ready to send"
                    : guidedShell.status === "blocked"
                      ? "Blocked"
                      : "Needs input"}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
                  Sync: {syncStatus.replace(/_/g, " ")}
                </span>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white">
                What Tina needs right now
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-zinc-300">{guidedShell.summary}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Next step
              </div>
              <div className="mt-2 max-w-xs leading-6">{guidedShell.nextStep}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/10 bg-black/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Needs now</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {guidedShell.needsNow.length > 0 ? (
                  guidedShell.needsNow.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-sm font-medium text-white">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-zinc-300">{item.summary}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-zinc-300">Tina has the core inputs she needs right now.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-black/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Already knows</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {guidedShell.knownNow.length > 0 ? (
                  guidedShell.knownNow.map((fact) => (
                    <div key={fact.label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        {fact.label}
                      </div>
                      <div className="mt-1 text-sm text-zinc-100">{fact.value}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-zinc-300">Tina has not collected enough facts yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-black/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Blocked</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {guidedShell.blocked.length > 0 ? (
                  guidedShell.blocked.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-rose-300/15 bg-rose-300/5 p-3">
                      <div className="text-sm font-medium text-rose-50">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-zinc-300">{item.summary}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-zinc-300">No true blockers are active right now.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-black/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Human answers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {guidedShell.humanQuestions.length > 0 ? (
                  guidedShell.humanQuestions.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-3">
                      <div className="text-sm font-medium text-amber-50">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-zinc-300">{item.summary}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-zinc-300">No open human questions are surfaced right now.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
            {guidedShell.safeToSendToCpa ? (
              <>
                <ShieldCheck className="h-4 w-4 text-emerald-200" />
                <span>This packet is currently safe to send to a CPA reviewer.</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-200" />
                <span>This packet is not safe to send yet. Tina still needs the blockers and review calls cleared.</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Download Tina&apos;s work for CPA review</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is the main handoff action. Tina will export the packet you can print, email, or hand to a CPA reviewer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-zinc-200">
            {guidedShell.safeToSendToCpa
              ? "Tina believes this packet is currently safe to send to a CPA reviewer."
              : "Tina can still export her current work, but she does not think the packet is fully safe to send yet."}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={downloadCpaPacket} disabled={cpaDownloadState === "running"}>
              {cpaDownloadState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download Tina&apos;s work for CPA review
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={openFullWorkspace}
            >
              <ExternalLink className="h-4 w-4" />
              Open full Tina workspace
            </Button>
          </div>

          {cpaDownloadMessage ? (
            <p className={`text-sm ${cpaDownloadState === "error" ? "text-amber-200" : "text-zinc-300"}`}>
              {cpaDownloadMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Current intake review</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            Tina's packet-level read on the current file before deeper prep continues.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                intakeReport.status === "ready"
                  ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                  : intakeReport.status === "blocked"
                    ? "border-rose-300/20 bg-rose-300/10 text-rose-50"
                    : "border-amber-300/20 bg-amber-300/10 text-amber-50"
              }`}
            >
              {intakeReport.status === "ready"
                ? "Ready"
                : intakeReport.status === "blocked"
                  ? "Blocked"
                  : "Needs input"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-300">
              Profile lane: {intakeReport.laneTitle}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-300">
              Document lane: {intakeReport.likelyLaneByDocuments === "unknown" ? "unknown" : intakeReport.likelyLaneByDocuments.replace(/_/g, " ")}
            </span>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
            <div>{intakeReport.summary}</div>
            <div className="mt-2 text-zinc-400">Next: {intakeReport.nextStep}</div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Blockers
              </div>
              {intakeReport.blockers.length > 0 ? (
                intakeReport.blockers.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-rose-300/15 bg-rose-300/5 p-3">
                    <div className="text-sm font-medium text-rose-50">{item.title}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-300">{item.summary}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-zinc-300">No true intake blockers are active right now.</p>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Missing support
              </div>
              {intakeReport.missingRequired.length > 0 || intakeReport.missingRecommended.length > 0 ? (
                <>
                  {intakeReport.missingRequired.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-3">
                      <div className="text-sm font-medium text-amber-50">{item.label}</div>
                      <div className="mt-1 text-sm leading-6 text-zinc-300">{item.reason}</div>
                    </div>
                  ))}
                  {intakeReport.missingRecommended.slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-sm font-medium text-white">{item.label}</div>
                      <div className="mt-1 text-sm leading-6 text-zinc-300">{item.reason}</div>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm leading-6 text-zinc-300">Tina does not see missing intake support right now.</p>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Messy signals
              </div>
              {intakeReport.messySignals.length > 0 ? (
                intakeReport.messySignals.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-sm font-medium text-white">{item.title}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-300">{item.summary}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-zinc-300">Tina has not found major messy-signal families yet.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Client intake batch import</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            Drop a normal client-to-CPA spreadsheet packet here. Tina will map each file using filename,
            columns, and sample rows, then ask for approval when a mapping is not strong enough to trust blindly.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleIntakeFileChange}
              className="max-w-xl border-white/10 bg-black/20 text-zinc-200 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-300/15 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-50"
            />
            <Button
              onClick={handleIntakeImport}
              disabled={!intakeReview || isAnalyzingIntake || isImportingIntake || !hydrated}
              className="bg-emerald-300 text-zinc-950 hover:bg-emerald-200"
            >
              {isImportingIntake ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing intake
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Import intake
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={clearIntakeBatch}
              disabled={isAnalyzingIntake || isImportingIntake}
              className="text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              Clear
            </Button>
          </div>

          {intakeMessage ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-200">
              {intakeMessage}
            </div>
          ) : null}

          {intakeReview ? (
            <>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      intakeReview.unsupportedLane
                        ? "border-amber-300/20 bg-amber-300/10 text-amber-50"
                        : "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                    }`}
                  >
                    {intakeReview.likelyLane === "1120_s"
                      ? "Likely 1120-S"
                      : intakeReview.likelyLane === "1065"
                        ? "Likely 1065"
                        : intakeReview.likelyLane === "schedule_c_single_member_llc"
                          ? "Likely Schedule C"
                          : intakeReview.likelyLane === "mixed"
                            ? "Mixed lane clues"
                            : "Lane still unclear"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-300">
                    {intakeReview.approvalCount} approval{intakeReview.approvalCount === 1 ? "" : "s"} needed
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-200">{intakeReview.summary}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{intakeReview.nextStep}</p>
              </div>

              <div className="space-y-3">
                {intakeReview.candidates.map((candidate) => (
                  <div
                    key={candidate.fileName}
                    className={`rounded-2xl border px-4 py-4 ${
                      candidate.approvalNeeded
                        ? "border-amber-300/20 bg-amber-300/5"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{candidate.fileName}</span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          candidate.confidence === "high"
                            ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                            : candidate.confidence === "medium"
                              ? "border-amber-300/20 bg-amber-300/10 text-amber-50"
                              : "border-rose-300/20 bg-rose-300/10 text-rose-50"
                        }`}
                      >
                        {candidate.confidence}
                      </span>
                      {candidate.approvalNeeded ? (
                        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-50">
                          Approval needed
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Why Tina mapped it this way
                        </div>
                        <ul className="space-y-1 text-sm leading-6 text-zinc-300">
                          {candidate.reasons.map((reason) => (
                            <li key={reason}>- {reason}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Mapped to
                          </label>
                          <select
                            value={intakeOverrides[candidate.fileName] ?? candidate.requestId}
                            onChange={(event) =>
                              setIntakeOverrides((current) => ({
                                ...current,
                                [candidate.fileName]: event.target.value as TinaClientIntakeRequestId,
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
                          >
                            {TINA_CLIENT_INTAKE_REQUEST_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {candidate.laneHints.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Lane hints
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {candidate.laneHints.map((hint) => (
                                <span
                                  key={`${candidate.fileName}-${hint}`}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200"
                                >
                                  {hint.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Client upload checklist</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is the concrete file list Tina wants from the customer before a CPA review starts.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {checklist.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    item.priority === "required"
                      ? "border-rose-300/20 bg-rose-300/10 text-rose-50"
                      : item.priority === "recommended"
                        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                        : "border-white/10 bg-white/5 text-zinc-200"
                  }`}
                >
                  {item.priority}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    item.status === "covered"
                      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                      : "border-amber-300/20 bg-amber-300/10 text-amber-50"
                  }`}
                >
                  {item.status === "covered" ? "covered" : "needed"}
                </span>
                <span className="text-sm font-medium text-white">{item.label}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{item.reason}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Reviewer correction capture</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            Use this when the CPA changes Tina's packet. Tina saves the override trail and the learning outcome together so the same mistake does not stay invisible.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200">Target in the current packet</label>
                <select
                  value={correctionTargetValue}
                  onChange={(event) => setCorrectionTargetValue(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
                >
                  {correctionTargets.length > 0 ? (
                    correctionTargets.map((target) => (
                      <option key={target.value} value={target.value}>
                        {target.label}
                      </option>
                    ))
                  ) : (
                    <option value="">No current packet targets yet</option>
                  )}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-200">Phase</label>
                  <select
                    value={correctionPhase}
                    onChange={(event) => setCorrectionPhase(event.target.value as TinaReviewerOutcomePhase)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="intake">Intake</option>
                    <option value="cleanup">Cleanup</option>
                    <option value="tax_review">Tax review</option>
                    <option value="package">Package</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-200">Verdict</label>
                  <select
                    value={correctionVerdict}
                    onChange={(event) => setCorrectionVerdict(event.target.value as TinaReviewerOutcomeVerdict)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="accepted">Accepted</option>
                    <option value="revised">Revised</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-200">Override severity</label>
                  <select
                    value={correctionSeverity}
                    onChange={(event) => setCorrectionSeverity(event.target.value as TinaReviewerOverrideSeverity)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value="minor">Minor</option>
                    <option value="material">Material</option>
                    <option value="blocking">Blocking</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200">What changed</label>
                <Textarea
                  value={correctionSummary}
                  onChange={(event) => setCorrectionSummary(event.target.value)}
                  placeholder="Example: CPA moved shareholder-paid phone charges out of expenses and into distributions."
                  className="min-h-[100px] border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-200">Before state</label>
                  <Textarea
                    value={correctionBeforeState}
                    onChange={(event) => setCorrectionBeforeState(event.target.value)}
                    placeholder="What Tina said before review"
                    className="min-h-[96px] border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-200">After state</label>
                  <Textarea
                    value={correctionAfterState}
                    onChange={(event) => setCorrectionAfterState(event.target.value)}
                    placeholder="What the CPA changed it to"
                    className="min-h-[96px] border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200">Why the reviewer changed it</label>
                <Textarea
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  placeholder="Example: officer-paid item was personal and should not stay inside deductible expenses."
                  className="min-h-[88px] border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-200">Lessons Tina should remember</label>
                  <Textarea
                    value={correctionLessons}
                    onChange={(event) => setCorrectionLessons(event.target.value)}
                    placeholder="One lesson per line. Example: Shareholder-paid personal charges should default to distribution review, not operating expense."
                    className="min-h-[96px] border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-200">Reviewed by</label>
                  <Input
                    value={correctionDecidedBy}
                    onChange={(event) => setCorrectionDecidedBy(event.target.value)}
                    placeholder="CPA reviewer name"
                    className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <Button
                onClick={handleCaptureCorrection}
                disabled={!hydrated || correctionTargets.length === 0 || correctionSummary.trim().length === 0}
                className="bg-emerald-300 text-zinc-950 hover:bg-emerald-200"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Save reviewer correction
              </Button>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Current file case tags
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentTags.length > 0 ? (
                    currentTags.map((tag) => (
                      <span
                        key={`capture-${tag}`}
                        className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-50"
                      >
                        {tag.replace(/_/g, " ")}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-zinc-300">No case tags inferred yet.</span>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Latest saved correction
                </div>
                {correctionSummaryCard ? (
                  <div className="mt-3 space-y-2 text-sm text-zinc-200">
                    <div className="flex items-center gap-2 text-emerald-100">
                      <CheckCircle2 className="h-4 w-4" />
                      Saved {correctionSummaryCard.verdict} feedback for {correctionSummaryCard.targetLabel}.
                    </div>
                    <div>
                      Override trail: {correctionSummaryCard.overrideSaved ? "saved" : "not needed"}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-zinc-300">
                    No manual reviewer correction has been saved in this session yet.
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  What this does
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                  <li>- Saves the exact packet target the reviewer changed.</li>
                  <li>- Records the before/after state when the packet was revised.</li>
                  <li>- Feeds the lesson into Tina's reviewer-memory loop for future files.</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Reviewer batch import</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            Drop a real CPA review export here as CSV or JSON. Tina will ingest the outcomes and
            use the current file's case tags when the batch does not provide them.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Current file case tags
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {currentTags.length > 0 ? (
                currentTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-50"
                  >
                    {tag.replace(/_/g, " ")}
                  </span>
                ))
              ) : (
                <span className="text-sm text-zinc-300">No cohort tags inferred yet.</span>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-zinc-200">
                Paste reviewer export
              </label>
              <Textarea
                value={importContent}
                onChange={(event) => setImportContent(event.target.value)}
                placeholder='Paste JSON or CSV here. Example columns: recordType,targetType,targetId,phase,verdict,summary,lessons,caseTags,decidedAt'
                className="min-h-[240px] border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200">Upload file</label>
                <Input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={handleFileChange}
                  className="border-white/10 bg-black/20 text-zinc-200 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-300/15 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-50"
                />
                {importFileName ? (
                  <div className="text-sm text-zinc-300">Loaded: {importFileName}</div>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200">Format</label>
                <select
                  value={importFormat}
                  onChange={(event) => setImportFormat(event.target.value as ImportFormat)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200">Default decided by</label>
                <Input
                  value={decidedBy}
                  onChange={(event) => setDecidedBy(event.target.value)}
                  placeholder="CPA reviewer name"
                  className="border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleImport}
                  disabled={isImporting || importContent.trim().length === 0 || !hydrated}
                  className="bg-emerald-300 text-zinc-950 hover:bg-emerald-200"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing
                    </>
                  ) : (
                    <>
                      <UploadCloud className="mr-2 h-4 w-4" />
                      Import batch
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearImport}
                  className="border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Current reviewer memory
              </div>
              <div className="mt-3 space-y-2 text-sm text-zinc-200">
                <div>Overrides: {draft.reviewerOutcomeMemory.overrides.length}</div>
                <div>Outcomes: {draft.reviewerOutcomeMemory.outcomes.length}</div>
                <div>Trust level: {draft.reviewerOutcomeMemory.scorecard.trustLevel.replace(/_/g, " ")}</div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Last import
              </div>
              {importSummary ? (
                <div className="mt-3 space-y-3 text-sm text-zinc-200">
                  <div className="flex items-center gap-2 text-emerald-100">
                    <CheckCircle2 className="h-4 w-4" />
                    Imported {importSummary.overrides} overrides and {importSummary.outcomes} outcomes.
                  </div>
                  {importSummary.warnings.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-3">
                      <div className="flex items-center gap-2 text-amber-100">
                        <AlertTriangle className="h-4 w-4" />
                        Warnings
                      </div>
                      <ul className="space-y-1 text-zinc-300">
                        {importSummary.warnings.slice(0, 6).map((warning) => (
                          <li key={warning}>- {warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="text-zinc-300">No warnings on the last import.</div>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                  <FileUp className="h-4 w-4" />
                  No reviewer batch has been imported in this session yet.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
