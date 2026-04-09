"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import {
  type ImportTargetField,
  type MappingSuggestion,
  type NormalizationDefaults,
  type NormalizedImportRecord,
} from "@/lib/import-normalization";
import {
  NICHE_TAG_OPTIONS,
  OUTREACH_TYPE_OPTIONS,
  SKIP_TRACE_STATUS_OPTIONS,
  SOURCE_CHANNEL_OPTIONS,
  sourceChannelLabel,
  tagLabel,
} from "@/lib/prospecting";

type ImportStep = "upload" | "mapping" | "configure" | "importing" | "done";

type PreviewPayload = {
  workbook: {
    kind: string;
    fileName: string;
    chosenSheet: string;
    sheetNames: string[];
    sheets: Array<{ name: string; rowCount: number; headerRowIndex: number; headers: string[] }>;
  };
  mappingSuggestions: MappingSuggestion[];
  effectiveMapping: Partial<Record<ImportTargetField, string>>;
  unmappedHeaders: string[];
  lowConfidenceFields: ImportTargetField[];
  previewRows: NormalizedImportRecord[];
  reviewCounts: Record<string, number>;
  requiresReview: boolean;
  templateMatch: { id: string; name: string; score: number; autoApplied: boolean } | null;
  defaults: NormalizationDefaults;
};

type ImportResults = {
  success: boolean;
  batchId: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  imported: number;
  updated: number;
  duplicateReviewRows: number;
  skipped: number;
  errors: number;
  importedStatusCounts: Record<string, number>;
  warnings: string[];
  skippedRows: Array<{ rowNumber: number; status: string; reason: string }>;
  errorRows: Array<{ rowNumber: number; error: string }>;
};

type ImportHandoffPayload = {
  source: "skip_genie";
  fileName: string;
  fileType: string;
  dataUrl: string;
  defaults: NormalizationDefaults;
  createdAt: number;
};

const DEFAULTS: NormalizationDefaults = {
  sourceChannel: "csv_import",
  sourceVendor: "",
  sourceListName: "",
  sourcePullDate: "",
  county: "",
  nicheTag: "",
  importBatchId: "",
  outreachType: "cold_call",
  skipTraceStatus: "not_started",
  templateName: "",
  templateId: "",
};

const SKIP_GENIE_IMPORT_HANDOFF_KEY = "sentinel.skipgenie.import-handoff";

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired. Please sign in again.");
  return { Authorization: `Bearer ${session.access_token}` };
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-overlay-8 bg-overlay-3 px-3 py-2">
      <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground/55">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function ImportPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportTargetField, string>>>({});
  const [defaults, setDefaults] = useState<NormalizationDefaults>({ ...DEFAULTS });
  const [selectedSheet, setSelectedSheet] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "update_missing">("skip");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [ackReview, setAckReview] = useState(false);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lowConfCount = (preview?.mappingSuggestions ?? []).filter((s) => s.confidence < 0.6).length;
  const dupeCount = preview?.reviewCounts?.["duplicate_match"] ?? 0;
  useCoachSurface("import", {
    importCtx: {
      step,
      low_confidence_count: lowConfCount,
      duplicate_count: dupeCount,
    },
  });

  const selectedSheetMeta = preview?.workbook.sheets.find((sheet) => sheet.name === selectedSheet);
  const groupedSuggestions = useMemo(() => {
    const grouped = new Map<string, MappingSuggestion[]>();
    (preview?.mappingSuggestions ?? []).forEach((item) => {
      const bucket = grouped.get(item.group) ?? [];
      bucket.push(item);
      grouped.set(item.group, bucket);
    });
    return [...grouped.entries()];
  }, [preview]);

  const analyzeFile = useCallback(async (nextFile: File, nextSheet = selectedSheet, nextMapping = mapping, nextDefaults = defaults) => {
    setAnalyzing(true);
    try {
      const headers = await authHeaders();
      const formData = new FormData();
      formData.append("file", nextFile);
      if (nextSheet) formData.append("sheet_name", nextSheet);
      formData.append("mapping", JSON.stringify(nextMapping));
      formData.append("defaults", JSON.stringify(nextDefaults));
      const res = await fetch("/api/imports/preview", { method: "POST", headers, body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error((data.error as string | undefined) ?? `HTTP ${res.status}`);
      const payload = data as PreviewPayload;
      setPreview(payload);
      setMapping(payload.effectiveMapping);
      setDefaults(payload.defaults);
      setSelectedSheet(payload.workbook.chosenSheet);
      setStep("mapping");
      if (payload.templateMatch?.autoApplied) toast.success(`Applied template: ${payload.templateMatch.name}`);
    } catch (error) {
      toast.error("Import preview failed", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setAnalyzing(false);
    }
  }, [defaults, mapping, selectedSheet]);

  const handleFile = useCallback(async (nextFile: File, overrideDefaults?: Partial<NormalizationDefaults>) => {
    const batchName = nextFile.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
    const resolvedDefaults = {
      ...DEFAULTS,
      importBatchId: batchName,
      ...overrideDefaults,
      importBatchId: overrideDefaults?.importBatchId || batchName,
    };
    setFile(nextFile);
    setPreview(null);
    setResults(null);
    setMapping({});
    setDefaults(resolvedDefaults);
    setSelectedSheet("");
    setAckReview(false);
    await analyzeFile(nextFile, "", {}, resolvedDefaults);
  }, [analyzeFile]);

  useEffect(() => {
    const raw =
      sessionStorage.getItem(SKIP_GENIE_IMPORT_HANDOFF_KEY) ??
      localStorage.getItem(SKIP_GENIE_IMPORT_HANDOFF_KEY);

    if (!raw) {
      if (searchParams.get("skipgenie_review") === "1") {
        setHandoffNotice("Nothing has been imported yet. Please re-upload the Skip Genie file on this screen to continue.");
        toast.error("Skip Genie review handoff did not load. Nothing has been imported yet.");
      }
      return;
    }

    sessionStorage.removeItem(SKIP_GENIE_IMPORT_HANDOFF_KEY);
    localStorage.removeItem(SKIP_GENIE_IMPORT_HANDOFF_KEY);

    let handoff: ImportHandoffPayload;
    try {
      handoff = JSON.parse(raw) as ImportHandoffPayload;
    } catch {
      toast.error("Could not load the Skip Genie review handoff.");
      return;
    }

    const commaIndex = handoff.dataUrl.indexOf(",");
    if (commaIndex < 0) {
      toast.error("Could not load the Skip Genie review handoff.");
      return;
    }

    try {
      const base64 = handoff.dataUrl.slice(commaIndex + 1);
      const binary = window.atob(base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const reconstructedFile = new File([bytes], handoff.fileName, {
        type: handoff.fileType || "text/csv",
      });

      setDuplicateStrategy("update_missing");
      setHandoffNotice("Skip Genie file loaded for review. Nothing has been imported yet.");
      toast("Skip Genie review loaded", {
        description: "Nothing has been imported yet. Review the mapping, then run import.",
      });
      void handleFile(reconstructedFile, handoff.defaults);
    } catch {
      toast.error("Could not load the Skip Genie review handoff.");
    }
  }, [handleFile, searchParams]);

  const runImport = useCallback(async () => {
    if (!file || !preview) return;
    setImporting(true);
    setStep("importing");
    try {
      const headers = await authHeaders();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheet_name", selectedSheet || preview.workbook.chosenSheet);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("defaults", JSON.stringify(defaults));
      formData.append("duplicate_strategy", duplicateStrategy);
      formData.append("save_template", String(saveTemplate));
      formData.append("force_commit", String(ackReview));
      const res = await fetch("/api/imports/commit", { method: "POST", headers, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error as string | undefined) ?? `HTTP ${res.status}`);
      setResults(data as ImportResults);
      setStep("done");
      toast.success("Import complete", { description: `${data.imported} new records, ${data.updated} updates.` });
    } catch (error) {
      setStep("configure");
      toast.error("Import failed", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setImporting(false);
    }
  }, [ackReview, defaults, duplicateStrategy, file, mapping, preview, saveTemplate, selectedSheet]);

  return (
    <PageShell
      title="Import Normalization"
      description="Review-first CSV/XLSX intake for outside prospect lists. Sentinel infers mappings, flags uncertainty, and audits every batch."
      actions={<div className="flex items-center gap-2">{file ? <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}><RefreshCw className="h-4 w-4" />Replace File</Button> : null}<CoachToggle /></div>}
    >
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(event) => {
        const nextFile = event.target.files?.[0];
        if (nextFile) void handleFile(nextFile);
      }} />

      {handoffNotice ? (
        <GlassCard className="mb-4 border-primary/30 bg-primary/[0.04]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Skip Genie review required</p>
              <p className="text-sm text-muted-foreground/75">{handoffNotice}</p>
            </div>
          </div>
        </GlassCard>
      ) : null}

      {step === "upload" ? (
        <GlassCard>
          <div
            className={cn(
              "cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all",
              dragOver ? "border-primary/50 bg-primary/[0.04]" : "border-overlay-8 hover:border-primary/30 hover:bg-primary/[0.02]",
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const nextFile = event.dataTransfer.files?.[0];
              if (nextFile) void handleFile(nextFile);
            }}
          >
            <Upload className="mx-auto mb-4 h-12 w-12 text-primary/60" />
            <h3 className="text-lg font-semibold text-foreground">Drop a CSV or XLSX file here</h3>
            <p className="mt-2 text-sm text-muted-foreground/70">Sentinel will inspect sheet structure, guess mappings, and stop for review if confidence is weak.</p>
          </div>
        </GlassCard>
      ) : null}

      {step === "mapping" && preview ? (
        <div className="space-y-4">
          <GlassCard>
            <div className="flex flex-wrap items-start gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{preview.workbook.fileName}</p>
                <p className="text-xs text-muted-foreground/60">{preview.workbook.kind.toUpperCase()} · {selectedSheetMeta?.rowCount ?? 0} rows · header row {(selectedSheetMeta?.headerRowIndex ?? 0) + 1}</p>
              </div>
              {preview.workbook.sheetNames.length > 1 ? (
                <select value={selectedSheet} onChange={(event) => {
                  const nextSheet = event.target.value;
                  setSelectedSheet(nextSheet);
                  if (file) void analyzeFile(file, nextSheet, mapping, defaults);
                }} className="rounded-lg border border-overlay-8 bg-overlay-4 px-2 py-1.5 text-xs text-foreground">
                  {preview.workbook.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              ) : null}
            </div>
          </GlassCard>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <GlassCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Field Mapping</p>
                  <p className="text-xs text-muted-foreground/60">Map only what you trust. Everything else stays in raw row payload.</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => file && void analyzeFile(file, selectedSheet, mapping, defaults)} disabled={analyzing}>
                  {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Refresh
                </Button>
              </div>
              {groupedSuggestions.map(([group, items]) => (
                <div key={group} className="space-y-2">
                  <p className="text-sm uppercase tracking-[0.18em] text-primary/65">{group}</p>
                  {items.map((suggestion) => (
                    <div key={suggestion.field} className="grid gap-2 rounded-xl border border-overlay-6 bg-overlay-2 p-3 lg:grid-cols-[160px_1fr_90px]">
                      <div>
                        <p className="text-xs font-medium text-foreground">{suggestion.label}</p>
                        <p className="text-sm text-muted-foreground/55">{suggestion.reason}</p>
                      </div>
                      <select
                        value={mapping[suggestion.field] ?? ""}
                        onChange={(event) => setMapping((prev) => ({ ...prev, [suggestion.field]: event.target.value || undefined }))}
                        className="rounded-lg border border-overlay-8 bg-overlay-4 px-2 py-1.5 text-xs text-foreground"
                      >
                        <option value="">Skip</option>
                        {selectedSheetMeta?.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                      </select>
                      <div className="text-right">
                        <Badge variant="outline" className={cn(
                          suggestion.confidenceLabel === "high" && "border-border/20 text-foreground",
                          suggestion.confidenceLabel === "medium" && "border-border/20 text-foreground",
                          suggestion.confidenceLabel === "low" && "border-border/20 text-foreground",
                        )}>{suggestion.confidenceLabel}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex justify-end">
                <Button onClick={() => setStep("configure")}>Next: Review</Button>
              </div>
            </GlassCard>

            <div className="space-y-4">
              <GlassCard>
                <p className="text-sm font-semibold text-foreground">Preview Snapshot</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Stat label="Preview Rows" value={preview.previewRows.length} />
                  <Stat label="Unmapped" value={preview.unmappedHeaders.length} />
                  <Stat label="Low Confidence" value={preview.lowConfidenceFields.length} />
                  <Stat label="Duplicates" value={preview.previewRows.filter((row) => row.duplicate.level !== "none").length} />
                </div>
              </GlassCard>
              {preview.requiresReview ? (
                <GlassCard className="border-border/20">
                  <div className="flex gap-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 text-foreground" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Review required</p>
                      <p className="mt-1 text-xs text-muted-foreground/70">Low-confidence mappings or risky rows were found. Sentinel will not pretend those are certain.</p>
                    </div>
                  </div>
                </GlassCard>
              ) : null}
              <GlassCard>
                <p className="text-sm font-semibold text-foreground">Sample Rows</p>
                <div className="mt-3 space-y-2">
                  {preview.previewRows.slice(0, 6).map((row) => (
                    <div key={row.rowNumber} className="rounded-xl border border-overlay-6 bg-overlay-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium">{row.ownerName ?? "Unknown owner"}</p>
                          <p className="text-sm text-muted-foreground/60">{row.propertyAddress ?? "Missing address"}</p>
                        </div>
                        <Badge variant="outline">{tagLabel(row.reviewStatus)}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.distressTags.slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="text-sm">{tagLabel(tag)}</Badge>)}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      ) : null}

      {step === "configure" && preview ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <GlassCard className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Import Defaults</p>
              <p className="text-xs text-muted-foreground/60">Set source/category once. Each row keeps raw payload and explicit warnings.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">Source Category</span><select value={defaults.sourceChannel} onChange={(event) => setDefaults((prev) => ({ ...prev, sourceChannel: event.target.value }))} className="w-full rounded-lg border border-overlay-8 bg-overlay-4 px-2 py-2 text-sm text-foreground">{SOURCE_CHANNEL_OPTIONS.map((option) => <option key={option} value={option}>{sourceChannelLabel(option)}</option>)}</select></label>
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">List Category</span><select value={defaults.nicheTag} onChange={(event) => setDefaults((prev) => ({ ...prev, nicheTag: event.target.value }))} className="w-full rounded-lg border border-overlay-8 bg-overlay-4 px-2 py-2 text-sm text-foreground"><option value="">Mixed / none</option>{NICHE_TAG_OPTIONS.map((option) => <option key={option} value={option}>{tagLabel(option)}</option>)}</select></label>
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">Source Vendor</span><Input value={defaults.sourceVendor} onChange={(event) => setDefaults((prev) => ({ ...prev, sourceVendor: event.target.value }))} placeholder="County export, PropStream, BatchData…" /></label>
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">List Name</span><Input value={defaults.sourceListName} onChange={(event) => setDefaults((prev) => ({ ...prev, sourceListName: event.target.value }))} placeholder="Spokane absentee pull" /></label>
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">County</span><Input value={defaults.county} onChange={(event) => setDefaults((prev) => ({ ...prev, county: event.target.value }))} placeholder="spokane" /></label>
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">Pull Date</span><Input type="date" value={defaults.sourcePullDate} onChange={(event) => setDefaults((prev) => ({ ...prev, sourcePullDate: event.target.value }))} /></label>
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">Import Batch ID</span><Input value={defaults.importBatchId} onChange={(event) => setDefaults((prev) => ({ ...prev, importBatchId: event.target.value }))} placeholder="batch_spokane_2026_03_11" /></label>
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">Outreach Type</span><select value={defaults.outreachType} onChange={(event) => setDefaults((prev) => ({ ...prev, outreachType: event.target.value }))} className="w-full rounded-lg border border-overlay-8 bg-overlay-4 px-2 py-2 text-sm text-foreground">{OUTREACH_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{tagLabel(option)}</option>)}</select></label>
              <label className="space-y-1.5 text-xs"><span className="text-muted-foreground/70">Skip Trace Status</span><select value={defaults.skipTraceStatus} onChange={(event) => setDefaults((prev) => ({ ...prev, skipTraceStatus: event.target.value }))} className="w-full rounded-lg border border-overlay-8 bg-overlay-4 px-2 py-2 text-sm text-foreground">{SKIP_TRACE_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{tagLabel(option)}</option>)}</select></label>
            </div>
            <div className="rounded-2xl border border-overlay-6 bg-overlay-2 p-4">
              <p className="text-xs font-semibold text-foreground">High-confidence duplicates</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant={duplicateStrategy === "skip" ? "default" : "outline"} size="sm" onClick={() => setDuplicateStrategy("skip")}>Skip duplicates</Button>
                <Button type="button" variant={duplicateStrategy === "update_missing" ? "default" : "outline"} size="sm" onClick={() => setDuplicateStrategy("update_missing")}>Update missing fields</Button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground/60">Possible duplicates still stay in review instead of being auto-merged.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveTemplate} onChange={(event) => setSaveTemplate(event.target.checked)} className="h-4 w-4" />Save or update a reusable template</label>
            {saveTemplate ? <Input value={defaults.templateName} onChange={(event) => setDefaults((prev) => ({ ...prev, templateName: event.target.value }))} placeholder="Spokane county absentee export" /> : null}
            {(preview.requiresReview || preview.lowConfidenceFields.length > 0) ? <label className="flex items-start gap-2 rounded-2xl border border-border/20 bg-muted/[0.05] p-4 text-sm"><input type="checkbox" checked={ackReview} onChange={(event) => setAckReview(event.target.checked)} className="mt-0.5 h-4 w-4" /><span className="text-muted-foreground/75">I reviewed the low-confidence mappings and want to proceed anyway.</span></label> : null}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("mapping")}>Back</Button>
              <Button onClick={() => void runImport()} disabled={importing || (preview.requiresReview && !ackReview)}>{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Run Import</Button>
            </div>
          </GlassCard>
          <div className="space-y-4">
            <GlassCard>
              <p className="text-sm font-semibold text-foreground">Preview Mix</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Stat label="Rows Previewed" value={preview.previewRows.length} />
                <Stat label="Possible Duplicates" value={preview.previewRows.filter((row) => row.duplicate.level === "possible").length} />
                <Stat label="Exact Duplicates" value={preview.previewRows.filter((row) => row.duplicate.level === "high").length} />
                <Stat label="Needs Review" value={preview.previewRows.filter((row) => row.reviewStatus === "needs_review").length} />
              </div>
            </GlassCard>
            <GlassCard>
              <p className="text-sm font-semibold text-foreground">Preview Statuses</p>
              <div className="mt-3 space-y-2">
                {Object.entries(preview.reviewCounts).map(([status, count]) => <div key={status} className="flex items-center justify-between rounded-xl border border-overlay-6 bg-overlay-2 px-3 py-2"><span className="text-xs">{tagLabel(status)}</span><Badge variant="outline">{count}</Badge></div>)}
              </div>
            </GlassCard>
            {preview.unmappedHeaders.length > 0 ? (
              <GlassCard>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Unmapped columns</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {preview.unmappedHeaders.map((header) => <Badge key={header} variant="outline" className="text-sm">{header}</Badge>)}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "importing" ? (
        <GlassCard className="py-12 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 text-lg font-semibold">Importing into Sentinel</p>
          <p className="mt-2 text-sm text-muted-foreground/65">Normalizing rows, checking duplicates, and writing auditable intake records.</p>
        </GlassCard>
      ) : null}

      {step === "done" && results ? (
        <div className="space-y-4">
          <GlassCard>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-foreground" />
              <div>
                <p className="text-sm font-semibold text-foreground">Import complete</p>
                <p className="text-xs text-muted-foreground/60">Batch &ldquo;{results.batchId}&rdquo; from {results.fileName} ({results.sheetName})</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Rows" value={results.totalRows} />
              <Stat label="Imported" value={results.imported} />
              <Stat label="Updated" value={results.updated} />
              <Stat label="Review Duplicates" value={results.duplicateReviewRows} />
              <Stat label="Skipped" value={results.skipped} />
              <Stat label="Errors" value={results.errors} />
            </div>
          </GlassCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <p className="text-sm font-semibold text-foreground">Imported status mix</p>
              <div className="mt-3 space-y-2">
                {Object.entries(results.importedStatusCounts).length > 0 ? Object.entries(results.importedStatusCounts).map(([status, count]) => <div key={status} className="flex items-center justify-between rounded-xl border border-overlay-6 bg-overlay-2 px-3 py-2"><span className="text-xs">{tagLabel(status)}</span><Badge variant="outline">{count}</Badge></div>) : <p className="text-xs text-muted-foreground/60">No new prospects were created from this file.</p>}
              </div>
            </GlassCard>
            <GlassCard>
              <p className="text-sm font-semibold text-foreground">Warnings and held rows</p>
              <div className="mt-3 space-y-2">
                {results.warnings.slice(0, 8).map((warning) => <div key={warning} className="rounded-xl border border-overlay-6 bg-overlay-2 px-3 py-2 text-xs text-muted-foreground/70">{warning}</div>)}
                {results.skippedRows.slice(0, 6).map((row) => <div key={`${row.rowNumber}-${row.status}`} className="rounded-xl border border-overlay-6 bg-overlay-2 px-3 py-2 text-xs text-muted-foreground/70">Row {row.rowNumber}: {tagLabel(row.status)} · {row.reason}</div>)}
                {results.errorRows.slice(0, 6).map((row) => <div key={`${row.rowNumber}-${row.error}`} className="rounded-xl border border-border/15 bg-muted/[0.03] px-3 py-2 text-xs text-foreground/80">Row {row.rowNumber}: {row.error}</div>)}
              </div>
            </GlassCard>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => {
              setStep("upload");
              setFile(null);
              setPreview(null);
              setResults(null);
              setMapping({});
              setDefaults({ ...DEFAULTS });
              setSelectedSheet("");
              setSaveTemplate(false);
              setAckReview(false);
            }}>Import Another File</Button>
            <Button variant="outline" onClick={() => setStep("configure")}>Back to Review</Button>
          </div>
        </div>
      ) : null}
      <CoachPanel />
    </PageShell>
  );
}
