"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Loader2,
  Zap,
  BarChart3,
  Users,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { cn } from "@/lib/utils";
import {
  autoMapColumns,
  ALL_SENTINEL_FIELDS,
  type SentinelField,
  type ColumnMapping,
} from "@/lib/csv-column-map";
import type { DistressType } from "@/lib/types";
import Papa from "papaparse";

// ── Distress type options for the selector ────────────────────────────

const DISTRESS_OPTIONS: { value: DistressType; label: string; weight: number }[] = [
  { value: "probate", label: "Probate / Deceased", weight: 28 },
  { value: "pre_foreclosure", label: "Pre-Foreclosure", weight: 26 },
  { value: "tax_lien", label: "Tax Lien / Delinquent", weight: 22 },
  { value: "water_shutoff", label: "Water Shut-Off", weight: 35 },
  { value: "code_violation", label: "Code Violation", weight: 14 },
  { value: "condemned", label: "Condemned", weight: 20 },
  { value: "divorce", label: "Divorce", weight: 20 },
  { value: "bankruptcy", label: "Bankruptcy", weight: 24 },
  { value: "inherited", label: "Inherited", weight: 25 },
  { value: "vacant", label: "Vacant", weight: 12 },
  { value: "absentee", label: "Absentee Owner", weight: 22 },
  { value: "fsbo", label: "FSBO", weight: 16 },
];

// ── Step definitions ──────────────────────────────────────────────────

type ImportStep = "upload" | "mapping" | "config" | "importing" | "done";

interface ImportResults {
  success: boolean;
  total: number;
  processed: number;
  upserted: number;
  eventsCreated: number;
  eventsDeduped: number;
  scored: number;
  promoted: number;
  skipped: number;
  errors: number;
  elapsed_ms: number;
  errorDetails: string[];
}

export default function CsvImportPage() {
  // ── State ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [editedMapping, setEditedMapping] = useState<Partial<Record<SentinelField, string>>>({});
  const [selectedTypes, setSelectedTypes] = useState<DistressType[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [defaultCounty, setDefaultCounty] = useState("");
  const [defaultState, setDefaultState] = useState("WA");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ────────────────────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    setFile(f);

    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      preview: 6, // parse first 6 rows for preview
      transformHeader: (h: string) => h.trim(),
      complete: (result) => {
        const hdrs = result.meta.fields ?? [];
        setHeaders(hdrs);
        setPreviewRows(result.data.slice(0, 5));

        // Auto-map columns
        const mapping = autoMapColumns(hdrs);
        setColumnMapping(mapping);
        setEditedMapping({ ...mapping.mapped });

        // Auto-detect source label from filename
        const baseName = f.name.replace(/\.(csv|txt|tsv)$/i, "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        setSourceLabel(baseName);

        setStep("mapping");
      },
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && (f.name.endsWith(".csv") || f.name.endsWith(".tsv") || f.name.endsWith(".txt"))) {
        handleFile(f);
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  // ── Column mapping edit ──────────────────────────────────────────────
  const updateMapping = useCallback((sentinelField: SentinelField, csvCol: string) => {
    setEditedMapping((prev) => {
      const next = { ...prev };
      if (csvCol === "") {
        delete next[sentinelField];
      } else {
        next[sentinelField] = csvCol;
      }
      return next;
    });
  }, []);

  // ── Distress type toggle ─────────────────────────────────────────────
  const toggleType = useCallback((type: DistressType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  // ── Import execution ─────────────────────────────────────────────────
  const runImport = useCallback(async () => {
    if (!file || selectedTypes.length === 0) return;

    setStep("importing");
    setImporting(true);
    setProgress(10);

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "meta",
      JSON.stringify({
        source: sourceLabel || "csv_import",
        distressTypes: selectedTypes,
        columnMapping: editedMapping,
        defaultCounty: defaultCounty || undefined,
        defaultState: defaultState || undefined,
      })
    );

    // Simulate progress while waiting for API
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 2, 90));
    }, 500);

    try {
      const res = await fetch("/api/ingest/csv-upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await res.json();

      setResults({
        success: data.success ?? false,
        total: data.total ?? 0,
        processed: data.processed ?? 0,
        upserted: data.upserted ?? 0,
        eventsCreated: data.eventsCreated ?? 0,
        eventsDeduped: data.eventsDeduped ?? 0,
        scored: data.scored ?? 0,
        promoted: data.promoted ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? 0,
        elapsed_ms: data.elapsed_ms ?? 0,
        errorDetails: data.errorDetails ?? [],
      });

      setStep("done");
    } catch (err) {
      clearInterval(progressInterval);
      setResults({
        success: false,
        total: 0,
        processed: 0,
        upserted: 0,
        eventsCreated: 0,
        eventsDeduped: 0,
        scored: 0,
        promoted: 0,
        skipped: 0,
        errors: 1,
        elapsed_ms: 0,
        errorDetails: [err instanceof Error ? err.message : "Network error"],
      });
      setStep("done");
    } finally {
      setImporting(false);
    }
  }, [file, selectedTypes, editedMapping, sourceLabel, defaultCounty, defaultState]);

  // ── Reset ────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setColumnMapping(null);
    setEditedMapping({});
    setSelectedTypes([]);
    setSourceLabel("");
    setDefaultCounty("");
    setDefaultState("WA");
    setImporting(false);
    setProgress(0);
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Step indicator ───────────────────────────────────────────────────
  const steps: { id: ImportStep; label: string }[] = [
    { id: "upload", label: "Upload" },
    { id: "mapping", label: "Map Columns" },
    { id: "config", label: "Configure" },
    { id: "importing", label: "Import" },
    { id: "done", label: "Results" },
  ];

  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <PageShell
      title="Import Data"
      description="Upload CSV files from any data vendor — auto-mapped, scored, and promoted through the full Sentinel pipeline."
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
                i < stepIndex
                  ? "bg-cyan/15 text-cyan border border-cyan/30"
                  : i === stepIndex
                    ? "bg-cyan/10 text-cyan border border-cyan/40 shadow-[0_0_8px_rgba(0,229,255,0.2)]"
                    : "bg-white/[0.03] text-muted-foreground/50 border border-white/[0.06]"
              )}
            >
              {i < stepIndex && <CheckCircle2 className="h-3 w-3" />}
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── STEP 1: Upload ─────────────────────────────────────── */}
        {step === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <GlassCard>
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer",
                  dragOver
                    ? "border-cyan/50 bg-cyan/[0.04]"
                    : "border-white/[0.08] hover:border-cyan/30 hover:bg-cyan/[0.02]"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={handleFileInput}
                />
                <Upload className="h-12 w-12 mx-auto text-cyan/50 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Drop your CSV file here
                </h3>
                <p className="text-sm text-muted-foreground/70 mb-4">
                  or click to browse. Supports .csv, .tsv, .txt
                </p>
                <p className="text-xs text-muted-foreground/50">
                  Works with RealSuperMarket, ListSource, PropStream, BatchLeads, county exports, or any CSV
                </p>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* ── STEP 2: Column Mapping ────────────────────────────── */}
        {step === "mapping" && (
          <motion.div
            key="mapping"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* File info */}
            <GlassCard>
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-cyan" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{file?.name}</p>
                  <p className="text-xs text-muted-foreground/60">
                    {headers.length} columns detected &middot; {previewRows.length}+ rows previewed
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </GlassCard>

            {/* Column mapping grid */}
            <GlassCard>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan" />
                Column Mapping
                <span className="text-xs text-muted-foreground/50 font-normal">
                  Auto-detected — adjust if needed
                </span>
              </h3>

              <div className="grid grid-cols-2 gap-3">
                {ALL_SENTINEL_FIELDS.map(({ field, label }) => (
                  <div key={field} className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground/70 w-28 shrink-0 text-right">
                      {label}
                    </label>
                    <select
                      value={editedMapping[field] ?? ""}
                      onChange={(e) => updateMapping(field, e.target.value)}
                      className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-foreground focus:border-cyan/40 focus:outline-none transition-colors"
                    >
                      <option value="">— skip —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Preview table */}
            {previewRows.length > 0 && (
              <GlassCard>
                <h3 className="text-sm font-semibold mb-3">Preview (first 5 rows)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {headers.slice(0, 10).map((h) => (
                          <th key={h} className="text-left px-2 py-1.5 text-muted-foreground/60 font-medium">
                            {h}
                          </th>
                        ))}
                        {headers.length > 10 && (
                          <th className="text-left px-2 py-1.5 text-muted-foreground/40">
                            +{headers.length - 10} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-white/[0.03]">
                          {headers.slice(0, 10).map((h) => (
                            <td key={h} className="px-2 py-1.5 text-foreground/80 max-w-[150px] truncate">
                              {row[h] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setStep("config")}
                className="flex items-center gap-2 px-4 py-2 bg-cyan/10 hover:bg-cyan/20 border border-cyan/30 rounded-lg text-sm font-medium text-cyan transition-all"
              >
                Next: Configure Import
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 3: Configure ─────────────────────────────────── */}
        {step === "config" && (
          <motion.div
            key="config"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Distress type selector */}
            <GlassCard>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-cyan" />
                Distress Signal Type(s)
                <span className="text-xs text-muted-foreground/50 font-normal">
                  What type of distress does this data represent?
                </span>
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {DISTRESS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => toggleType(opt.value)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                      selectedTypes.includes(opt.value)
                        ? "bg-cyan/10 border-cyan/40 text-cyan"
                        : "bg-white/[0.03] border-white/[0.06] text-muted-foreground/70 hover:border-white/[0.12]"
                    )}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] opacity-50">{opt.weight}pt</span>
                  </button>
                ))}
              </div>
              {selectedTypes.length === 0 && (
                <p className="text-xs text-amber-400/70 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Select at least one distress type
                </p>
              )}
            </GlassCard>

            {/* Source label + defaults */}
            <GlassCard>
              <h3 className="text-sm font-semibold mb-3">Import Settings</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground/70 block mb-1">
                    Source Label
                  </label>
                  <input
                    value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                    placeholder="e.g. realsupermarket"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-cyan/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground/70 block mb-1">
                    Default County (if not in CSV)
                  </label>
                  <input
                    value={defaultCounty}
                    onChange={(e) => setDefaultCounty(e.target.value)}
                    placeholder="e.g. Spokane"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-cyan/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground/70 block mb-1">
                    Default State
                  </label>
                  <input
                    value={defaultState}
                    onChange={(e) => setDefaultState(e.target.value)}
                    placeholder="WA"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-cyan/40 focus:outline-none"
                  />
                </div>
              </div>
            </GlassCard>

            {/* Summary before import */}
            <GlassCard glow>
              <h3 className="text-sm font-semibold mb-2">Ready to Import</h3>
              <div className="grid grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground/60">File</p>
                  <p className="text-foreground font-medium">{file?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground/60">Mapped Fields</p>
                  <p className="text-foreground font-medium">
                    {Object.keys(editedMapping).length} / {ALL_SENTINEL_FIELDS.length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground/60">Distress Types</p>
                  <p className="text-foreground font-medium">
                    {selectedTypes.length > 0
                      ? selectedTypes.map((t) => DISTRESS_OPTIONS.find((o) => o.value === t)?.label ?? t).join(", ")
                      : "None selected"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground/60">Source</p>
                  <p className="text-foreground font-medium">{sourceLabel || "csv_import"}</p>
                </div>
              </div>
            </GlassCard>

            <div className="flex justify-between">
              <button
                onClick={() => setStep("mapping")}
                className="px-4 py-2 text-sm text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={runImport}
                disabled={selectedTypes.length === 0 || importing}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  selectedTypes.length > 0
                    ? "bg-cyan/20 hover:bg-cyan/30 border border-cyan/40 text-cyan shadow-[0_0_12px_rgba(0,229,255,0.15)]"
                    : "bg-white/[0.04] border border-white/[0.08] text-muted-foreground/40 cursor-not-allowed"
                )}
              >
                <Zap className="h-4 w-4" />
                Run Import Pipeline
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 4: Importing ─────────────────────────────────── */}
        {step === "importing" && (
          <motion.div
            key="importing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <GlassCard glow>
              <div className="text-center py-8">
                <Loader2 className="h-10 w-10 mx-auto text-cyan animate-spin mb-4" />
                <h3 className="text-lg font-semibold mb-2">Processing Import</h3>
                <p className="text-sm text-muted-foreground/70 mb-6">
                  Running full Sentinel pipeline: upsert &rarr; score &rarr; predict &rarr; promote
                </p>

                {/* Progress bar */}
                <div className="max-w-md mx-auto">
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan/60 to-cyan rounded-full"
                      style={{ boxShadow: "0 0 8px rgba(0,229,255,0.4)" }}
                      initial={{ width: "0%" }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/50 mt-2">
                    {progress}% complete
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* ── STEP 5: Results ───────────────────────────────────── */}
        {step === "done" && results && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Summary card */}
            <GlassCard glow={results.success} glowStrong={results.promoted > 0}>
              <div className="flex items-center gap-3 mb-4">
                {results.success ? (
                  <CheckCircle2 className="h-6 w-6 text-cyan" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-amber-400" />
                )}
                <h3 className="text-lg font-semibold">
                  {results.success ? "Import Complete" : "Import Failed"}
                </h3>
                <span className="text-xs text-muted-foreground/50 ml-auto">
                  {(results.elapsed_ms / 1000).toFixed(1)}s
                </span>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <StatCard
                  icon={FileSpreadsheet}
                  label="Total Rows"
                  value={results.total}
                  color="text-foreground"
                />
                <StatCard
                  icon={BarChart3}
                  label="Properties Upserted"
                  value={results.upserted}
                  color="text-cyan"
                />
                <StatCard
                  icon={Zap}
                  label="Events Created"
                  value={results.eventsCreated}
                  sub={results.eventsDeduped > 0 ? `${results.eventsDeduped} deduped` : undefined}
                  color="text-emerald-400"
                />
                <StatCard
                  icon={Users}
                  label="Promoted to Leads"
                  value={results.promoted}
                  sub={`of ${results.scored} scored`}
                  color="text-amber-400"
                />
              </div>

              {results.skipped > 0 && (
                <p className="text-xs text-muted-foreground/50 mt-3">
                  {results.skipped} rows skipped (missing address/APN)
                </p>
              )}
            </GlassCard>

            {/* Errors */}
            {results.errorDetails.length > 0 && (
              <GlassCard>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  Errors ({results.errors})
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {results.errorDetails.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground/60 font-mono">
                      {err}
                    </p>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={reset}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-sm text-muted-foreground/70 hover:text-foreground transition-all"
              >
                <RefreshCw className="h-4 w-4" />
                Import Another File
              </button>
              <a
                href="/sales-funnel/prospects"
                className="flex items-center gap-2 px-4 py-2 bg-cyan/10 hover:bg-cyan/20 border border-cyan/30 rounded-lg text-sm font-medium text-cyan transition-all"
              >
                <Users className="h-4 w-4" />
                View Prospects
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}

// ── Stat card component ──────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className={cn("text-xl font-bold", color)}>{value.toLocaleString()}</p>
      {sub && <p className="text-[10px] text-muted-foreground/40 mt-0.5">{sub}</p>}
    </div>
  );
}
