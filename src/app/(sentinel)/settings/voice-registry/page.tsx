"use client";

/**
 * /settings/voice-registry — Voice Script & Handoff Rule Registry
 *
 * Shared registry surface. Shows all registered voice scripts and handoff rules
 * grouped by workflow, with status, description, and changelog. Operators can
 * update status and descriptions inline, and register new versions.
 *
 * Does NOT: deploy scripts live, trigger Twilio routing changes,
 * auto-run A/B tests, or route calls between versions.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Radio, ArrowLeft, Loader2, RefreshCw, Plus,
  CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp,
  Settings2, FileCode2,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  useVoiceRegistry,
  type VoiceRegistryRow,
  type VoiceRegistryType,
  type VoiceRegistryStatus,
} from "@/hooks/use-voice-registry";
import { VOICE_WORKFLOW_LABELS } from "@/lib/voice-registry";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "active",     label: "Active",     icon: CheckCircle2,  classes: "bg-muted/10 text-foreground border-border/20" },
  { value: "testing",    label: "Testing",    icon: Clock,         classes: "bg-muted/10 text-foreground border-border/20" },
  { value: "deprecated", label: "Deprecated", icon: AlertTriangle, classes: "bg-muted/10 text-foreground border-border/20" },
] as const;

function StatusBadge({ status }: { status: VoiceRegistryStatus }) {
  const opt = STATUS_OPTIONS.find(o => o.value === status) ?? STATUS_OPTIONS[2];
  const Icon = opt.icon;
  return (
    <Badge variant="outline" className={`text-xs px-1.5 py-0 font-medium ${opt.classes}`}>
      <Icon className="h-2.5 w-2.5 mr-1" />
      {opt.label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: VoiceRegistryType }) {
  if (type === "handoff_rule") {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 bg-muted/10 text-foreground border-border/20">
        <Settings2 className="h-2.5 w-2.5 mr-1" />
        Rule
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
      <FileCode2 className="h-2.5 w-2.5 mr-1" />
      Script
    </Badge>
  );
}

// ── Version row ───────────────────────────────────────────────────────────────

function VersionRow({
  row,
  onUpdate,
}: {
  row:      VoiceRegistryRow;
  onUpdate: (
    workflow: string, version: string, registryType: VoiceRegistryType,
    patch: { status?: VoiceRegistryStatus; description?: string; changelog?: string; rule_config?: object | null }
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [desc, setDesc]       = useState(row.description ?? "");
  const [log,  setLog]        = useState(row.changelog   ?? "");
  const [ruleJson, setRuleJson] = useState(
    row.rule_config ? JSON.stringify(row.rule_config, null, 2) : ""
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      let parsedConfig: object | null | undefined = undefined;
      if (row.registry_type === "handoff_rule") {
        if (ruleJson.trim()) {
          try {
            parsedConfig = JSON.parse(ruleJson);
          } catch {
            setJsonError("Invalid JSON in rule config");
            return;
          }
        } else {
          parsedConfig = null;
        }
        setJsonError(null);
      }
      await onUpdate(row.workflow, row.version, row.registry_type, {
        description: desc,
        changelog:   log,
        ...(parsedConfig !== undefined ? { rule_config: parsedConfig } : {}),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-overlay-6 bg-overlay-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <code className="text-sm font-mono text-foreground/70 shrink-0">v{row.version}</code>
        <StatusBadge status={row.status} />
        <TypeBadge   type={row.registry_type} />
        <div className="flex gap-1 ml-auto">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded px-1.5 py-0.5 border border-transparent hover:border-overlay-6"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Status quick-set buttons */}
      {!editing && (
        <div className="px-3 pb-2 flex gap-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              disabled={row.status === opt.value}
              onClick={() => onUpdate(row.workflow, row.version, row.registry_type, { status: opt.value as VoiceRegistryStatus })}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors
                ${row.status === opt.value
                  ? `${opt.classes} cursor-default`
                  : "border-overlay-6 text-muted-foreground/30 hover:text-muted-foreground/60 hover:border-overlay-10"
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Description (read mode) */}
      {!editing && row.description && (
        <div className="px-3 pb-2">
          <p className="text-sm text-foreground/55 leading-relaxed whitespace-pre-line line-clamp-3">
            {row.description}
          </p>
        </div>
      )}

      {/* Rule config (read mode) */}
      {!editing && row.registry_type === "handoff_rule" && row.rule_config && (
        <div className="px-3 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/40 mb-1">
            Active thresholds
          </p>
          <div className="space-y-0.5">
            {Object.entries(row.rule_config as Record<string, unknown>).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground/40 font-mono">{k}</span>
                <span className="text-foreground/50 font-mono">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Changelog (read mode) */}
      {!editing && row.changelog && (
        <div className="px-3 pb-2">
          <p className="text-xs text-muted-foreground/30 italic">{row.changelog}</p>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="px-3 pb-3 space-y-2 border-t border-overlay-4 pt-2">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground/40">
              {row.registry_type === "handoff_rule" ? "Description / summary" : "Script copy / talking points"}
            </label>
            <Textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={4}
              className="mt-1 text-sm min-h-[80px]"
              placeholder={row.registry_type === "handoff_rule" ? "Summary of thresholds…" : "Script talking points…"}
            />
          </div>
          {row.registry_type === "handoff_rule" && (
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground/40">
                Rule config (JSON)
              </label>
              <Textarea
                value={ruleJson}
                onChange={e => { setRuleJson(e.target.value); setJsonError(null); }}
                rows={8}
                className="mt-1 text-sm font-mono min-h-[120px]"
                placeholder='{ "transfer_requires_warm_ready": true, … }'
              />
              {jsonError && (
                <p className="text-xs text-foreground mt-0.5">{jsonError}</p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground/40">Changelog</label>
            <Input
              value={log}
              onChange={e => setLog(e.target.value)}
              className="mt-1 text-sm"
              placeholder="What changed…"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-sm h-7"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEditing(false); setDesc(row.description ?? ""); setLog(row.changelog ?? ""); }}
              className="text-sm h-7"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Workflow group ────────────────────────────────────────────────────────────

function WorkflowGroup({
  workflow,
  rows,
  onUpdate,
}: {
  workflow: string;
  rows:     VoiceRegistryRow[];
  onUpdate: (
    workflow: string, version: string, registryType: VoiceRegistryType,
    patch: { status?: VoiceRegistryStatus; description?: string; changelog?: string; rule_config?: object | null }
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const label = (VOICE_WORKFLOW_LABELS as Record<string, string>)[workflow] ?? workflow;
  const activeCount = rows.filter(r => r.status === "active").length;

  return (
    <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-overlay-2 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-sm font-semibold text-foreground/80">{label}</span>
        <span className="text-xs text-muted-foreground/30 font-mono">{workflow}</span>
        {activeCount > 0 && (
          <Badge variant="outline" className="ml-1 text-xs px-1 py-0 bg-muted/10 text-foreground border-border/20">
            {activeCount} active
          </Badge>
        )}
        <span className="text-xs text-muted-foreground/25 ml-auto">{rows.length} version{rows.length !== 1 ? "s" : ""}</span>
        {open
          ? <ChevronUp className="h-3 w-3 text-muted-foreground/30 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-overlay-4">
          {rows.map(row => (
            <VersionRow key={`${row.workflow}-${row.version}-${row.registry_type}`} row={row} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Register form ─────────────────────────────────────────────────────────────

function RegisterForm({
  onRegister,
}: {
  onRegister: (input: {
    workflow: string;
    registry_type: VoiceRegistryType;
    version: string;
    status: VoiceRegistryStatus;
    description?: string;
    changelog?: string;
  }) => Promise<VoiceRegistryRow | void>;
}) {
  const [open,     setOpen]    = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [error,    setError]   = useState<string | null>(null);
  const [workflow, setWorkflow] = useState("");
  const [regType,  setRegType]  = useState<VoiceRegistryType>("script");
  const [version,  setVersion]  = useState("");
  const [desc,     setDesc]     = useState("");
  const [log,      setLog]      = useState("");

  async function handleSubmit() {
    if (!workflow.trim() || !version.trim()) {
      setError("workflow and version are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRegister({
        workflow:      workflow.trim(),
        registry_type: regType,
        version:       version.trim(),
        status:        "testing" as const,
        description:   desc.trim() || undefined,
        changelog:     log.trim()  || undefined,
      });
      setOpen(false);
      setWorkflow(""); setVersion(""); setDesc(""); setLog("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="text-sm h-8 gap-1.5">
        <Plus className="h-3 w-3" />
        Register version
      </Button>
    );
  }

  return (
    <div className="rounded-[12px] border border-overlay-8 bg-overlay-2 p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground/70">Register new voice entry</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground/40">Workflow</label>
          <Input value={workflow} onChange={e => setWorkflow(e.target.value)} className="mt-1 text-sm" placeholder="e.g. warm_transfer" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground/40">Version</label>
          <Input value={version} onChange={e => setVersion(e.target.value)} className="mt-1 text-sm" placeholder="e.g. 1.1.0" />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground/40">Type</label>
        <select
          value={regType}
          onChange={e => setRegType(e.target.value as VoiceRegistryType)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="script">script</option>
          <option value="handoff_rule">handoff_rule</option>
        </select>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground/40">Description</label>
        <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} className="mt-1 text-sm" placeholder="Script copy or rule summary…" />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground/40">Changelog</label>
        <Input value={log} onChange={e => setLog(e.target.value)} className="mt-1 text-sm" placeholder="What changed from prior version…" />
      </div>
      {error && <p className="text-sm text-foreground">{error}</p>}
      <p className="text-xs text-muted-foreground/30">
        New entries start as <strong>testing</strong>. Promote to <strong>active</strong> after review.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={saving} className="text-sm h-7">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Register
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="text-sm h-7">Cancel</Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VoiceRegistryPage() {
  const { versions, loading, error, refetch, register, update } = useVoiceRegistry();

  // Group by workflow for display
  const grouped: Record<string, VoiceRegistryRow[]> = {};
  for (const v of versions) {
    if (!grouped[v.workflow]) grouped[v.workflow] = [];
    grouped[v.workflow].push(v);
  }

  const workflowOrder = [
    "inbound_greeting",
    "seller_qualifying",
    "callback_booking",
    "warm_transfer",
    "handoff_rules",
    ...Object.keys(grouped).filter(w => ![
      "inbound_greeting", "seller_qualifying", "callback_booking", "warm_transfer", "handoff_rules"
    ].includes(w)),
  ].filter(w => grouped[w]);

  async function handleUpdate(
    workflow:     string,
    version:      string,
    registryType: VoiceRegistryType,
    patch:        { status?: VoiceRegistryStatus; description?: string; changelog?: string; rule_config?: object | null }
  ) {
    await update(workflow, version, registryType, patch);
  }

  return (
    <PageShell title="Voice Registry" description="Script versions and handoff rule configs for inbound, routing, callback booking, and warm-transfer flows.">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Back + header actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/settings"
            className="flex items-center gap-1.5 text-sm text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Settings
          </Link>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={refetch}
              disabled={loading}
              className="h-8 w-8 p-0"
              title="Refresh"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* Register form */}
        <RegisterForm onRegister={register} />

        {/* Error state */}
        {error && (
          <GlassCard hover={false} className="!p-4">
            <p className="text-sm text-foreground">{error}</p>
          </GlassCard>
        )}

        {/* Loading state */}
        {loading && versions.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading voice registry…
          </div>
        )}

        {/* Empty state */}
        {!loading && versions.length === 0 && !error && (
          <GlassCard hover={false} className="!p-6 text-center">
            <Radio className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground/40">No voice registry entries found.</p>
            <p className="text-sm text-muted-foreground/25 mt-1">Run the migration to seed initial script and handoff-rule versions.</p>
          </GlassCard>
        )}

        {/* Workflow groups */}
        {workflowOrder.map(workflow => (
          <WorkflowGroup
            key={workflow}
            workflow={workflow}
            rows={grouped[workflow]}
            onUpdate={handleUpdate}
          />
        ))}

        {/* Boundary note */}
        <GlassCard hover={false} className="!p-3">
          <p className="text-xs text-muted-foreground/30 leading-relaxed">
            <strong className="text-muted-foreground/50">What this does:</strong>{" "}
            Records which script copy and handoff rule config is active for each voice workflow.
            Active versions are threaded into <code className="text-xs">inbound.classified</code> and{" "}
            <code className="text-xs">transfer.*</code> events so review can trace which behavior produced each outcome.
            Changing status here does not automatically change live routing or Twilio behavior.
          </p>
        </GlassCard>

      </div>
    </PageShell>
  );
}
