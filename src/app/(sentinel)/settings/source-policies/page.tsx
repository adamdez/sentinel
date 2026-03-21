"use client";

/**
 * /settings/source-policies
 *
 * Admin-facing source policy registry.
 * Adam can set each ArtifactSourceType to: approved / review_required / blocked.
 * Changes take effect immediately on the next artifact capture or compile.
 *
 * Six rows. Three states. No role system. No modal. Inline toggle.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2, AlertTriangle, ShieldAlert, ChevronLeft, Loader2, Info,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type SourcePolicy = "approved" | "review_required" | "blocked";

interface PolicyRow {
  id:          string;
  source_type: string;
  policy:      SourcePolicy;
  rationale:   string | null;
  updated_at:  string;
}

interface PolicyMeta {
  policy_labels:       Record<string, string>;
  policy_descriptions: Record<string, string>;
}

// ── Source type labels (mirrors hook) ─────────────────────────────────────────

const SOURCE_TYPE_LABELS: Record<string, string> = {
  probate_filing: "Probate filing",
  assessor:       "Assessor / tax record",
  court_record:   "Court record",
  obituary:       "Obituary",
  news:           "News / media",
  other:          "Other / unclassified",
};

// ── Policy display config ─────────────────────────────────────────────────────

const POLICY_OPTS: Array<{ value: SourcePolicy; label: string; icon: React.ElementType; style: string }> = [
  {
    value: "approved",
    label: "Approved",
    icon:  CheckCircle2,
    style: "text-foreground border-border/25 bg-muted/[0.06] hover:bg-muted/10",
  },
  {
    value: "review_required",
    label: "Review required",
    icon:  AlertTriangle,
    style: "text-foreground border-border/25 bg-muted/[0.06] hover:bg-muted/10",
  },
  {
    value: "blocked",
    label: "Blocked",
    icon:  ShieldAlert,
    style: "text-foreground border-border/20 bg-muted/[0.04] hover:bg-muted/[0.08]",
  },
];

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
  return h;
}

// ── Policy row component ──────────────────────────────────────────────────────

function PolicyRowItem({
  row,
  meta,
  onUpdate,
}: {
  row:      PolicyRow;
  meta:     PolicyMeta;
  onUpdate: (sourceType: string, policy: SourcePolicy) => Promise<void>;
}) {
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleChange(newPolicy: SourcePolicy) {
    if (newPolicy === row.policy) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(row.source_type, newPolicy);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const activeOpt = POLICY_OPTS.find(o => o.value === row.policy) ?? POLICY_OPTS[0];
  const ActiveIcon = activeOpt.icon;

  return (
    <div className="flex items-start gap-4 py-3 border-b border-white/[0.04] last:border-0">
      {/* Source type */}
      <div className="w-44 shrink-0">
        <p className="text-sm font-medium text-foreground/85">
          {SOURCE_TYPE_LABELS[row.source_type] ?? row.source_type}
        </p>
        <p className="text-sm text-muted-foreground/40 mt-0.5 font-mono">{row.source_type}</p>
      </div>

      {/* Policy toggle buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {POLICY_OPTS.map(opt => {
          const Icon    = opt.icon;
          const isActive = opt.value === row.policy;
          return (
            <button
              key={opt.value}
              onClick={() => handleChange(opt.value)}
              disabled={saving}
              className={`flex items-center gap-1 rounded-[8px] border px-2.5 py-1 text-sm font-medium transition-all ${opt.style} ${
                isActive ? "ring-1 ring-current opacity-100" : "opacity-40 hover:opacity-70"
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" />
              {opt.label}
            </button>
          );
        })}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/30 ml-1" />}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0 hidden lg:block">
        <p className="text-sm text-muted-foreground/50 leading-snug">
          {meta.policy_descriptions[row.policy] ?? ""}
        </p>
        {row.rationale && (
          <p className="text-sm text-muted-foreground/30 mt-0.5 italic">{row.rationale}</p>
        )}
        {row.updated_at && (
          <p className="text-xs text-muted-foreground/25 mt-0.5">
            Updated {new Date(row.updated_at).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Active badge */}
      <div className="shrink-0 hidden sm:block">
        <Badge variant="outline" className={`text-xs h-4 px-1.5 ${activeOpt.style}`}>
          <ActiveIcon className="h-2.5 w-2.5 mr-0.5" />
          {activeOpt.label}
        </Badge>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SourcePoliciesPage() {
  const [rows, setRows]       = useState<PolicyRow[]>([]);
  const [meta, setMeta]       = useState<PolicyMeta>({
    policy_labels:       {},
    policy_descriptions: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h   = await getAuthHeader();
      const res = await fetch("/api/settings/source-policies", { headers: h });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to load policies");
      }
      const data = await res.json();
      setRows(data.policies ?? []);
      setMeta(data.meta ?? { policy_labels: {}, policy_descriptions: {} });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = useCallback(async (sourceType: string, policy: SourcePolicy) => {
    const h   = await getAuthHeader();
    const res = await fetch("/api/settings/source-policies", {
      method:  "PATCH",
      headers: h,
      body:    JSON.stringify({ source_type: sourceType, policy }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? "Failed to update policy");
    }
    const data = await res.json();
    setRows(prev => prev.map(r =>
      r.source_type === sourceType ? { ...r, ...data.policy_row } : r
    ));
  }, []);

  return (
    <PageShell
      title="Source Policies"
      description="Control how each evidence source type is treated during dossier capture and compile."
      actions={
        <Link
          href="/settings"
          className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          Settings
        </Link>
      }
    >
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Explainer */}
        <GlassCard hover={false} className="!p-3">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-primary/50 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground/80">How source policies work</p>
              <ul className="text-sm text-muted-foreground/60 space-y-0.5">
                <li>
                  <span className="text-foreground/70 font-medium">Approved</span> — compiles without warning. Clean evidence.
                </li>
                <li>
                  <span className="text-foreground/70 font-medium">Review required</span> — included in compile but flagged for extra attention in dossier review.
                </li>
                <li>
                  <span className="text-foreground/70 font-medium">Blocked</span> — excluded from compile by default. Warning shown at capture time. Adam can override per-compile.
                </li>
              </ul>
              <p className="text-sm text-muted-foreground/35 pt-1">
                Changes take effect on the next artifact capture or compile run. Existing artifacts are not retroactively altered.
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Policy table */}
        <GlassCard hover={false} className="!p-4">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading policies…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={load}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground/40 py-4">
              No policies found. Run the migration to seed default policies.
            </p>
          )}

          {!loading && !error && rows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Evidence source types
                </h2>
                <span className="text-sm text-muted-foreground/30">{rows.length} sources configured</span>
              </div>
              {rows.map(row => (
                <PolicyRowItem
                  key={row.id}
                  row={row}
                  meta={meta}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          )}
        </GlassCard>

      </div>
    </PageShell>
  );
}
