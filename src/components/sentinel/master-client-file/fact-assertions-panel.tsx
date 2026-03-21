"use client";

/**
 * FactAssertionsPanel
 *
 * Adam-only panel for reviewing and managing discrete fact assertions
 * extracted from dossier artifacts.
 *
 * Layout: facts grouped by artifact (source provenance always visible).
 * Actions per fact: accept / reject / set confidence / edit / delete.
 * New fact capture: manual add against any existing artifact.
 *
 * Facts never write to leads or dossiers directly.
 * promoted_field is a proposal hint only — durable writes go through
 * the existing dossier review/promote path.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp,
  Plus, Trash2, Loader2, ExternalLink, Tag, Shield, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useFactAssertions,
  FACT_TYPES,
  FACT_TYPE_LABELS,
  CONFIDENCE_LABELS,
  PROMOTED_FIELD_OPTIONS,
} from "@/hooks/use-fact-assertions";
import type { FactAssertionRow, FactType, FactConfidence } from "@/hooks/use-fact-assertions";
import type { ArtifactRow } from "@/hooks/use-dossier-artifacts";
import { SOURCE_TYPE_LABELS } from "@/hooks/use-dossier-artifacts";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_META = {
  pending:  { label: "Pending",  color: "text-foreground",   bg: "border-border/20 bg-muted/[0.05]", dot: "bg-muted" },
  accepted: { label: "Accepted", color: "text-foreground", bg: "border-border/20 bg-muted/[0.05]", dot: "bg-muted" },
  rejected: { label: "Rejected", color: "text-foreground/70",  bg: "border-border/15 bg-muted/[0.03]", dot: "bg-muted/60" },
} as const;

const CONFIDENCE_META: Record<FactConfidence, { label: string; color: string }> = {
  unverified: { label: "Unverified", color: "text-foreground" },
  low:        { label: "Low",        color: "text-foreground/70" },
  medium:     { label: "Medium",     color: "text-foreground" },
  high:       { label: "High",       color: "text-foreground" },
};

// ── Fact row ──────────────────────────────────────────────────────────────────

function FactRow({
  fact,
  onPatch,
  onDelete,
}: {
  fact: FactAssertionRow;
  onPatch: (id: string, patch: Partial<FactAssertionRow>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [patching, setPatching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusMeta = STATUS_META[fact.review_status];
  const confMeta   = CONFIDENCE_META[fact.confidence];

  async function handleStatusChange(status: "accepted" | "rejected" | "pending") {
    setPatching(true);
    await onPatch(fact.id, { review_status: status } as Partial<FactAssertionRow>);
    setPatching(false);
  }

  async function handleConfidenceChange(val: FactConfidence) {
    setPatching(true);
    await onPatch(fact.id, { confidence: val } as Partial<FactAssertionRow>);
    setPatching(false);
  }

  async function handlePromotedFieldChange(val: string) {
    setPatching(true);
    await onPatch(fact.id, { promoted_field: val === "__none__" ? null : val } as Partial<FactAssertionRow>);
    setPatching(false);
  }

  return (
    <div className={`rounded-[8px] border text-[11px] ${statusMeta.bg} ${
      fact.review_status === "rejected" ? "opacity-60" : ""
    }`}>
      {/* ── Main row ── */}
      <div className="flex items-start gap-2 px-2.5 py-2">
        {/* Status dot */}
        <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${statusMeta.dot}`} />

        {/* Fact value */}
        <div className="flex-1 min-w-0">
          <p className="text-foreground/85 leading-snug">{fact.fact_value}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-muted-foreground/50 border-white/10">
              {FACT_TYPE_LABELS[fact.fact_type]}
            </Badge>
            <span className={`text-[9px] ${confMeta.color}`}>
              {confMeta.label}
            </span>
            {fact.promoted_field && (
              <span className="text-[9px] text-primary/60 flex items-center gap-0.5">
                <ArrowRight className="h-2.5 w-2.5" />
                {PROMOTED_FIELD_OPTIONS.find(o => o.value === fact.promoted_field)?.label ?? fact.promoted_field}
              </span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 shrink-0">
          {fact.review_status !== "accepted" && (
            <button
              onClick={() => handleStatusChange("accepted")}
              disabled={patching}
              title="Accept"
              className="rounded p-0.5 hover:bg-muted/15 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-foreground/70 hover:text-foreground" />
            </button>
          )}
          {fact.review_status !== "rejected" && (
            <button
              onClick={() => handleStatusChange("rejected")}
              disabled={patching}
              title="Reject"
              className="rounded p-0.5 hover:bg-muted/15 transition-colors"
            >
              <XCircle className="h-3.5 w-3.5 text-foreground/50 hover:text-foreground" />
            </button>
          )}
          {fact.review_status !== "pending" && (
            <button
              onClick={() => handleStatusChange("pending")}
              disabled={patching}
              title="Reset to pending"
              className="rounded p-0.5 hover:bg-muted/15 transition-colors"
            >
              <AlertCircle className="h-3.5 w-3.5 text-foreground/40 hover:text-foreground" />
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="rounded p-0.5 hover:bg-white/[0.04] transition-colors"
            title="Edit details"
          >
            {expanded
              ? <ChevronUp className="h-3 w-3 text-muted-foreground/40" />
              : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
            }
          </button>
        </div>
      </div>

      {/* ── Expanded detail / edit ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.04]"
          >
            <div className="px-2.5 py-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {/* Confidence */}
                <div>
                  <label className="text-[9px] uppercase text-muted-foreground/40 block mb-0.5">
                    Confidence
                  </label>
                  <select
                    value={fact.confidence}
                    onChange={e => handleConfidenceChange(e.target.value as FactConfidence)}
                    disabled={patching}
                    className="h-6 w-full text-[10px] rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {(Object.keys(CONFIDENCE_LABELS) as FactConfidence[]).map(c => (
                      <option key={c} value={c}>{CONFIDENCE_LABELS[c]}</option>
                    ))}
                  </select>
                </div>

                {/* Promoted field hint */}
                <div>
                  <label className="text-[9px] uppercase text-muted-foreground/40 block mb-0.5">
                    <Shield className="inline h-2.5 w-2.5 mr-0.5" />
                    Propose for
                  </label>
                  <select
                    value={fact.promoted_field ?? "__none__"}
                    onChange={e => handlePromotedFieldChange(e.target.value)}
                    disabled={patching}
                    className="h-6 w-full text-[10px] rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="__none__">None</option>
                    {PROMOTED_FIELD_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[9px] text-muted-foreground/30">
                  {fact.reviewed_at
                    ? `Reviewed ${new Date(fact.reviewed_at).toLocaleDateString()}`
                    : `Added ${new Date(fact.created_at).toLocaleDateString()}`
                  }
                </span>
                <button
                  onClick={async () => {
                    setDeleting(true);
                    await onDelete(fact.id);
                    setDeleting(false);
                  }}
                  disabled={deleting || patching}
                  className="flex items-center gap-1 text-[9px] text-foreground/40 hover:text-foreground transition-colors"
                >
                  {deleting
                    ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    : <Trash2 className="h-2.5 w-2.5" />
                  }
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {patching && (
        <div className="flex items-center gap-1 px-2.5 py-0.5 border-t border-white/[0.03]">
          <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/30" />
          <span className="text-[9px] text-muted-foreground/30">Saving…</span>
        </div>
      )}
    </div>
  );
}

// ── Add fact form ─────────────────────────────────────────────────────────────

function AddFactForm({
  artifactId,
  leadId,
  onAdded,
}: {
  artifactId: string;
  leadId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [factValue, setFactValue] = useState("");
  const [factType, setFactType] = useState<FactType>("other");
  const [confidence, setConfidence] = useState<FactConfidence>("unverified");
  const [promotedField, setPromotedField] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { addFact } = useFactAssertions(leadId);

  async function handleSubmit() {
    const val = factValue.trim();
    if (!val) return;
    setSubmitting(true);
    setErr(null);
    const result = await addFact({
      artifact_id:    artifactId,
      fact_type:      factType,
      fact_value:     val,
      confidence,
      promoted_field: promotedField || null,
    });
    setSubmitting(false);
    if (result) {
      setFactValue("");
      setFactType("other");
      setConfidence("unverified");
      setPromotedField("");
      setOpen(false);
      onAdded();
    } else {
      setErr("Failed to add fact. Check console.");
    }
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add fact from this source
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-1.5 rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-2.5"
        >
          <Input
            value={factValue}
            onChange={e => setFactValue(e.target.value)}
            placeholder="Fact claim, e.g. 'Filed for probate Nov 2024'"
            className="h-7 text-[11px]"
            autoFocus
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSubmit()}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={factType}
              onChange={e => setFactType(e.target.value as FactType)}
              className="h-6 text-[10px] rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {FACT_TYPES.map(t => (
                <option key={t} value={t}>{FACT_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select
              value={confidence}
              onChange={e => setConfidence(e.target.value as FactConfidence)}
              className="h-6 text-[10px] rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {(Object.keys(CONFIDENCE_LABELS) as FactConfidence[]).map(c => (
                <option key={c} value={c}>{CONFIDENCE_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <select
            value={promotedField || "__none__"}
            onChange={e => setPromotedField(e.target.value === "__none__" ? "" : e.target.value)}
            className="h-6 w-full text-[10px] rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="__none__">No field mapping</option>
            {PROMOTED_FIELD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {err && <p className="text-[10px] text-destructive">{err}</p>}
          <div className="flex gap-1.5 pt-0.5">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !factValue.trim()}
              className="h-6 text-[10px] flex-1"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Add fact
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setOpen(false); setErr(null); }}
              className="h-6 text-[10px]"
            >
              Cancel
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Artifact group ────────────────────────────────────────────────────────────

function ArtifactFactGroup({
  artifact,
  facts,
  leadId,
  onRefetch,
  onPatch,
  onDelete,
}: {
  artifact: ArtifactRow;
  facts: FactAssertionRow[];
  leadId: string;
  onRefetch: () => Promise<void>;
  onPatch: (id: string, patch: Partial<FactAssertionRow>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const accepted = facts.filter(f => f.review_status === "accepted").length;
  const pending  = facts.filter(f => f.review_status === "pending").length;

  return (
    <div className="space-y-1.5">
      {/* Artifact header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 text-left group"
      >
        <Tag className="h-3 w-3 text-muted-foreground/40 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-medium text-muted-foreground/70 truncate block">
            {artifact.source_label ?? SOURCE_TYPE_LABELS[artifact.source_type] ?? artifact.source_type}
          </span>
          {artifact.source_url && (
            <a
              href={artifact.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[9px] text-foreground/50 hover:text-foreground flex items-center gap-0.5"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Source
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {pending > 0 && (
            <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-foreground/70 border-border/30">
              {pending} pending
            </Badge>
          )}
          {accepted > 0 && (
            <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-foreground/70 border-border/30">
              {accepted} ✓
            </Badge>
          )}
          {collapsed
            ? <ChevronDown className="h-3 w-3 text-muted-foreground/30" />
            : <ChevronUp className="h-3 w-3 text-muted-foreground/30" />
          }
        </div>
      </button>

      {/* Facts list */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pl-5 space-y-1"
          >
            {facts.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/30 italic">No facts extracted yet.</p>
            ) : (
              facts.map(f => (
                <FactRow
                  key={f.id}
                  fact={f}
                  onPatch={onPatch}
                  onDelete={onDelete}
                />
              ))
            )}
            <AddFactForm
              artifactId={artifact.id}
              leadId={leadId}
              onAdded={onRefetch}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ facts }: { facts: FactAssertionRow[] }) {
  const pending  = facts.filter(f => f.review_status === "pending").length;
  const accepted = facts.filter(f => f.review_status === "accepted").length;
  const rejected = facts.filter(f => f.review_status === "rejected").length;
  const withField = facts.filter(f => f.promoted_field && f.review_status === "accepted").length;

  if (facts.length === 0) return null;

  return (
    <div className="flex items-center gap-3 text-[9px] text-muted-foreground/40 px-0.5">
      <span>{facts.length} facts</span>
      {pending  > 0 && <span className="text-foreground/60">{pending} pending</span>}
      {accepted > 0 && <span className="text-foreground/60">{accepted} accepted</span>}
      {rejected > 0 && <span className="text-foreground/40">{rejected} rejected</span>}
      {withField > 0 && (
        <span className="text-primary/50 flex items-center gap-0.5">
          <ArrowRight className="h-2.5 w-2.5" />
          {withField} mapped to dossier fields
        </span>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface FactAssertionsPanelProps {
  leadId:    string;
  artifacts: ArtifactRow[];
}

export function FactAssertionsPanel({ leadId, artifacts }: FactAssertionsPanelProps) {
  const { facts, loading, error, refetch, patchFact, deleteFact } =
    useFactAssertions(leadId);

  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const handlePatch = useCallback(async (id: string, patch: Partial<FactAssertionRow>) => {
    await patchFact(id, patch as Parameters<typeof patchFact>[1]);
  }, [patchFact]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteFact(id);
  }, [deleteFact]);

  // Group facts by artifact_id
  const factsByArtifact = useCallback((artifactId: string) =>
    facts.filter(f => f.artifact_id === artifactId),
  [facts]);

  // Only show artifacts that have facts or are available to add to
  const artifactsWithData = artifacts;

  return (
    <div className="space-y-2">
      {/* Section header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 text-left"
      >
        <Shield className="h-3.5 w-3.5 text-foreground/60 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Fact Assertions
        </span>
        <span className="ml-auto text-[9px] text-muted-foreground/30">
          {expanded ? "hide" : "show"}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-1"
          >
            <p className="text-[9px] text-muted-foreground/30 leading-snug">
              Discrete facts extracted from sources. Accept or reject per fact.
              &ldquo;Propose for&rdquo; hints which dossier field a fact should inform —
              no write occurs until the dossier is promoted through the review path.
            </p>

            {loading && (
              <div className="flex items-center gap-1.5 py-2">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground/30">Loading facts…</span>
              </div>
            )}

            {error && (
              <p className="text-[10px] text-destructive">{error}</p>
            )}

            {!loading && !error && (
              <>
                <SummaryBar facts={facts} />

                {artifactsWithData.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/30 italic py-1">
                    Capture at least one source artifact above to start extracting facts.
                  </p>
                ) : (
                  <div className="space-y-3 pt-0.5">
                    {artifactsWithData.map(artifact => (
                      <ArtifactFactGroup
                        key={artifact.id}
                        artifact={artifact}
                        facts={factsByArtifact(artifact.id)}
                        leadId={leadId}
                        onRefetch={refetch}
                        onPatch={handlePatch}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
