"use client";

/**
 * /settings/prompt-registry — Prompt Version Registry
 *
 * Adam-only admin surface. Shows all registered prompt versions grouped by
 * workflow, with status, description, and changelog. Adam can update status
 * and descriptions inline, and register new versions.
 *
 * Does NOT: deploy prompts, trigger rollbacks, route traffic between versions,
 * or manage model/provider assignments.
 */

import { useState } from "react";
import Link from "next/link";
import {
  BookMarked, ArrowLeft, Loader2, RefreshCw, Plus,
  CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { usePromptRegistry, type PromptRegistryRow } from "@/hooks/use-prompt-registry";
import { PromptVersionBadge } from "@/components/sentinel/prompt-version-badge";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "active",     label: "Active",     icon: CheckCircle2,  classes: "bg-muted/10 text-foreground border-border/20" },
  { value: "testing",    label: "Testing",    icon: Clock,         classes: "bg-muted/10 text-foreground border-border/20" },
  { value: "deprecated", label: "Deprecated", icon: AlertTriangle, classes: "bg-muted/10 text-foreground border-border/20" },
] as const;

// ── Single version row ────────────────────────────────────────────────────────

function VersionRow({
  row,
  onUpdate,
}: {
  row:      PromptRegistryRow;
  onUpdate: (workflow: string, version: string, patch: { status?: "active" | "testing" | "deprecated"; description?: string; changelog?: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [desc, setDesc]       = useState(row.description ?? "");
  const [log, setLog]         = useState(row.changelog ?? "");

  async function handleStatusChange(newStatus: "active" | "testing" | "deprecated") {
    setSaving(true);
    try { await onUpdate(row.workflow, row.version, { status: newStatus }); }
    finally { setSaving(false); }
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await onUpdate(row.workflow, row.version, {
        description: desc.trim() || undefined,
        changelog:   log.trim() || undefined,
      });
      setEditing(false);
    } finally { setSaving(false); }
  }

  const dateStr = new Date(row.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="py-3 border-b border-white/[0.04] last:border-0 space-y-2">
      {/* Header row */}
      <div className="flex items-start gap-3 flex-wrap">
        <PromptVersionBadge
          workflow={row.workflow}
          version={row.version}
          meta={{ workflow: row.workflow, version: row.version, status: row.status, description: row.description, changelog: row.changelog }}
        />
        <span className="text-xs text-muted-foreground/30 mt-0.5 ml-auto">{dateStr}</span>
      </div>

      {/* Status toggle */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => !saving && row.status !== opt.value && handleStatusChange(opt.value as "active" | "testing" | "deprecated")}
            disabled={saving || row.status === opt.value}
            className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
              row.status === opt.value
                ? opt.classes
                : "border-white/[0.06] text-muted-foreground/30 hover:border-white/[0.12] hover:text-muted-foreground/60"
            } ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {opt.label}
          </button>
        ))}
        {saving && <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/30" />}

        <button
          onClick={() => setEditing(e => !e)}
          className="text-xs text-muted-foreground/30 hover:text-muted-foreground/60 ml-2 transition-colors flex items-center gap-0.5"
        >
          {editing
            ? <><ChevronUp className="h-2.5 w-2.5" /> Collapse</>
            : <><ChevronDown className="h-2.5 w-2.5" /> Edit</>
          }
        </button>
      </div>

      {/* Description (read-only unless editing) */}
      {!editing && row.description && (
        <p className="text-sm text-muted-foreground/60 leading-snug">{row.description}</p>
      )}
      {!editing && row.changelog && (
        <p className="text-sm text-muted-foreground/40 italic leading-snug">
          Changed: {row.changelog}
        </p>
      )}

      {/* Edit form */}
      {editing && (
        <div className="space-y-2 pl-1 pt-1">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground/40 block mb-1">Description</label>
            <Textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="h-16 text-sm resize-none"
              placeholder="What this prompt does…"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground/40 block mb-1">What changed from prior version</label>
            <Textarea
              value={log}
              onChange={e => setLog(e.target.value)}
              className="h-12 text-sm resize-none"
              placeholder="Brief changelog…"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-6 text-sm px-2.5" onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-sm px-2" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Register form ─────────────────────────────────────────────────────────────

function RegisterForm({ onRegister }: { onRegister: (input: { workflow: string; version: string; status: "testing" | "active" | "deprecated"; description?: string; changelog?: string }) => Promise<void> }) {
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [workflow, setWorkflow] = useState("");
  const [version, setVersion]   = useState("");
  const [desc, setDesc]         = useState("");
  const [log, setLog]           = useState("");
  const [err, setErr]           = useState<string | null>(null);

  async function handleSubmit() {
    if (!workflow.trim() || !version.trim()) {
      setErr("Workflow and version are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onRegister({
        workflow: workflow.trim(),
        version:  version.trim(),
        status:   "testing" as const,
        description: desc.trim() || undefined,
        changelog:   log.trim() || undefined,
      });
      setWorkflow(""); setVersion(""); setDesc(""); setLog(""); setOpen(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to register");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-sm gap-1"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3" /> Register new version
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
      <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/50">Register new version</p>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground/40 uppercase tracking-wider block mb-1">Workflow</label>
          <Input value={workflow} onChange={e => setWorkflow(e.target.value)} placeholder="e.g. summarize" className="h-7 text-sm" />
        </div>
        <div className="w-28">
          <label className="text-xs text-muted-foreground/40 uppercase tracking-wider block mb-1">Version</label>
          <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 2.2.0" className="h-7 text-sm" />
        </div>
      </div>
      <Textarea value={desc} onChange={e => setDesc(e.target.value)} className="h-14 text-sm resize-none" placeholder="What this prompt does…" />
      <Textarea value={log} onChange={e => setLog(e.target.value)} className="h-10 text-sm resize-none" placeholder="What changed from prior version…" />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="h-6 text-sm px-2.5" onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Register (testing)"}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-sm px-2" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PromptRegistryPage() {
  const { versions, metaMap, loading, error, refetch, register, update } = usePromptRegistry();

  // Group by workflow
  const grouped: Record<string, PromptRegistryRow[]> = {};
  for (const v of versions) {
    if (!grouped[v.workflow]) grouped[v.workflow] = [];
    grouped[v.workflow].push(v);
  }
  const workflows = Object.keys(grouped).sort();

  async function handleUpdate(workflow: string, version: string, patch: { status?: "active" | "testing" | "deprecated"; description?: string; changelog?: string }) {
    await update(workflow, version, patch);
  }

  return (
    <PageShell
      title="Prompt Registry"
      description="Registered AI workflow prompts with version, status, and changelog. Adam-only."
    >
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to settings
            </Link>
            <div className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-primary/60" />
              <h1 className="text-xl font-semibold tracking-tight">Prompt Registry</h1>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0" onClick={refetch} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </Button>
        </div>

        {/* ── Explainer ── */}
        <GlassCard hover={false} className="!p-3">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <BookMarked className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/50" />
            <span>
              Each AI workflow invocation stores its <code className="font-mono text-sm text-foreground/60">workflow</code> and{" "}
              <code className="font-mono text-sm text-foreground/60">prompt_version</code> in{" "}
              <code className="font-mono text-sm text-foreground/60">dialer_ai_traces</code>.
              This registry maps those version strings to human-readable descriptions so you can tell what logic produced
              a flagged output. <strong className="text-foreground/80">Register here when you bump a version constant in code.</strong>{" "}
              Status updates here do not affect which version runs in production — that is controlled by the route constant.
            </span>
          </div>
        </GlassCard>

        {error && (
          <GlassCard hover={false} className="!p-3 border-destructive/30">
            <p className="text-xs text-destructive">{error}</p>
          </GlassCard>
        )}

        {loading && versions.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {/* ── Register new ── */}
        <RegisterForm onRegister={async (input) => { await register(input); }} />

        {/* ── Workflow groups ── */}
        {workflows.map(wf => (
          <GlassCard key={wf} hover={false} className="!p-0 overflow-hidden">
            {/* Workflow header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.01]">
              <span className="font-mono text-xs font-semibold text-foreground/80">{wf}</span>
              <Badge variant="secondary" className="text-xs h-4 px-1.5">
                {grouped[wf].length} version{grouped[wf].length !== 1 ? "s" : ""}
              </Badge>
            </div>
            {/* Version rows */}
            <div className="px-4">
              {grouped[wf].map(row => (
                <VersionRow
                  key={row.id}
                  row={row}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          </GlassCard>
        ))}

        {!loading && versions.length === 0 && (
          <GlassCard hover={false} className="!p-8">
            <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
              <BookMarked className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm">No prompt versions registered yet.</p>
              <p className="text-xs">Run the migration to seed the known versions, or register one above.</p>
            </div>
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}
