"use client";

import { useId, useMemo, useState } from "react";
import { CheckCircle2, FileUp, Loader2, ShieldAlert, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTinaDraft } from "@/tina/hooks/use-tina-draft";
import { buildTinaGuidedShellContract } from "@/tina/lib/guided-shell";

export function TinaGuidedShell() {
  const {
    draft,
    hydrated,
    syncStatus,
    importReviewerTrafficBatch,
  } = useTinaDraft();
  const contract = useMemo(() => buildTinaGuidedShellContract(draft), [draft]);
  const importId = useId();
  const [importState, setImportState] = useState<"idle" | "running" | "error" | "done">("idle");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [reviewerBatchText, setReviewerBatchText] = useState("");

  async function importReviewerBatchFile(file: File) {
    setImportState("running");
    setImportWarnings([]);
    setImportMessage(`Tina is reading ${file.name}...`);

    try {
      const content = await file.text();
      const imported = importReviewerTrafficBatch({
        content,
        format: file.name.toLowerCase().endsWith(".csv") ? "csv" : "json",
        defaultDecidedBy: "imported-review-batch",
      });

      setImportWarnings(imported.warnings);
      setImportState("done");
      setImportMessage(
        `Tina imported ${imported.outcomes.length} outcome${
          imported.outcomes.length === 1 ? "" : "s"
        } and ${imported.overrides.length} override${
          imported.overrides.length === 1 ? "" : "s"
        }.`
      );
    } catch {
      setImportState("error");
      setImportMessage("Tina could not import that review batch yet. Try a CSV or JSON export.");
    }
  }

  function importPastedBatch() {
    if (reviewerBatchText.trim().length === 0) {
      setImportState("error");
      setImportMessage("Paste a CSV or JSON reviewer batch first.");
      return;
    }

    try {
      const imported = importReviewerTrafficBatch({
        content: reviewerBatchText,
        defaultDecidedBy: "pasted-review-batch",
      });
      setImportWarnings(imported.warnings);
      setImportState("done");
      setImportMessage(
        `Tina imported ${imported.outcomes.length} outcome${
          imported.outcomes.length === 1 ? "" : "s"
        } and ${imported.overrides.length} override${
          imported.overrides.length === 1 ? "" : "s"
        }.`
      );
    } catch {
      setImportState("error");
      setImportMessage("Tina could not read that pasted reviewer batch.");
    }
  }

  if (!hydrated) {
    return (
      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl">
        <CardContent className="flex items-center gap-3 p-6 text-zinc-200">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading Tina's simple shell...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Simple shell</p>
          <CardTitle className="text-white">Tina in simple mode</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">{contract.summary}</p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Do this now</p>
            <div className="mt-3 space-y-3">
              {contract.needsNow.length > 0 ? (
                contract.needsNow.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="text-sm leading-6 text-zinc-400">{item.summary}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-zinc-400">Tina has the main inputs she needs for the next step.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">What Tina knows</p>
            <div className="mt-3 grid gap-2">
              {contract.knownNow.length > 0 ? (
                contract.knownNow.map((fact) => (
                  <div key={fact.label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{fact.label}</p>
                    <p className="mt-1 text-sm text-white">{fact.value}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-zinc-400">Tina still needs more facts before she can simplify this file.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">What is blocked</p>
            <div className="mt-3 space-y-3">
              {contract.blocked.length > 0 ? (
                contract.blocked.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="text-sm leading-6 text-zinc-400">{item.summary}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-zinc-400">Tina does not see a hard blocker right now.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Human answers</p>
            <div className="mt-3 space-y-3">
              {contract.humanQuestions.length > 0 ? (
                contract.humanQuestions.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="text-sm leading-6 text-zinc-400">{item.summary}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-zinc-400">Tina does not have a special human question queued right now.</p>
              )}
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Safe to send to CPA</p>
              <p className="mt-1 text-sm text-white">
                {contract.safeToSendToCpa ? "Yes" : "No"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Reviewer loop</p>
          <CardTitle className="text-white">Import CPA review traffic</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            When you have a real CPA review export, drop it here as CSV or JSON so Tina can learn from accepted, revised, and rejected outcomes.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              id={importId}
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await importReviewerBatchFile(file);
                event.currentTarget.value = "";
              }}
            />
            <Button asChild>
              <label htmlFor={importId} className="cursor-pointer">
                {importState === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                Upload reviewer batch
              </label>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={importPastedBatch}
              disabled={importState === "running"}
            >
              {importState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              Import pasted batch
            </Button>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
              Sync: {syncStatus.replace(/_/g, " ")}
            </div>
          </div>

          <Textarea
            value={reviewerBatchText}
            onChange={(event) => setReviewerBatchText(event.target.value)}
            placeholder="Paste a real CPA review CSV or JSON export here when you have one."
            className="min-h-[160px] border-white/10 bg-black/15 text-zinc-100 placeholder:text-zinc-500"
          />

          {importMessage ? (
            <div
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm leading-6",
                importState === "error"
                  ? "border-amber-300/14 bg-amber-300/8 text-amber-50"
                  : "border-white/10 bg-black/15 text-zinc-200"
              )}
            >
              <div className="flex items-start gap-2">
                {importState === "error" ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-200" />
                )}
                <span>{importMessage}</span>
              </div>
              {importWarnings.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-zinc-300">
                  {importWarnings.map((warning) => (
                    <li key={warning}>- {warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
