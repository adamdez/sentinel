"use client";

/**
 * PostCallDraftPanel
 *
 * Shows the AI-generated post-call note draft for operator review.
 * The draft is a PROPOSAL — never published until the operator explicitly
 * confirms it or edits individual fields.
 *
 * On confirm: assembles the draft fields into a structured summary string,
 * collects selected objection tags, and calls onConfirm(assembledText, runId, tags).
 * The parent (PostCallPanel) flows that text through the existing publish path
 * → calls_log.notes, and sends tags to publish-manager → lead_objection_tags.
 *
 * On skip: calls onSkip(tags) — objection tags are still captured even when
 * the operator skips the AI draft and uses raw notes.
 * On flag: calls onFlag(runId) so the parent can set summaryFlagged=true.
 *
 * UI budget: compact — all fields visible without scrolling.
 * Objection capture is one-tap from a short allowlist chip grid (optional).
 */

import { useState } from "react";
import { CheckCircle2, Flag, Loader2, SkipForward, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PostCallDraft } from "@/app/api/dialer/v1/sessions/[id]/draft-note/route";
import {
  OBJECTION_TAGS,
  OBJECTION_TAG_LABELS,
  type ObjectionTag,
} from "@/lib/dialer/types";

// Re-export so callers can import from this file without knowing the route path
export type { PostCallDraft };

export interface ObjectionCapture {
  tag:  ObjectionTag;
  note: string | null;
}

interface PostCallDraftPanelProps {
  draft:       PostCallDraft;
  runId:       string;
  loading:     boolean;
  /**
   * Called when operator confirms the draft.
   * Receives assembled note text, runId, and any selected objection tags.
   */
  onConfirm:   (assembledNote: string, runId: string, objections: ObjectionCapture[]) => void;
  /**
   * Called when operator skips the draft.
   * Objection tags are still passed so they are captured with raw notes.
   */
  onSkip:      (objections: ObjectionCapture[]) => void;
  /** Called when operator flags the draft as poor quality. */
  onFlag:      (runId: string) => void;
  disabled?:   boolean;
}

// ── Temperature display ───────────────────────────────────────────────────────

const TEMP_META: Record<string, { label: string; color: string; bg: string }> = {
  hot:  { label: "Hot",  color: "text-red-400",    bg: "bg-red-500/15 border-red-500/30" },
  warm: { label: "Warm", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
  cool: { label: "Cool", color: "text-blue-400",   bg: "bg-blue-500/15 border-blue-500/30" },
  cold: { label: "Cold", color: "text-slate-400",  bg: "bg-slate-500/15 border-slate-500/30" },
  dead: { label: "Dead", color: "text-zinc-500",   bg: "bg-zinc-500/10 border-zinc-500/20" },
};

// ── Assemble structured draft into a summary string ───────────────────────────

function assembleDraft(d: PostCallDraft): string {
  const lines: string[] = [];
  if (d.summary_line)         lines.push(d.summary_line);
  if (d.promises_made)        lines.push(`Promised: ${d.promises_made}`);
  if (d.next_task_suggestion) lines.push(`Next: ${d.next_task_suggestion}`);
  if (d.deal_temperature)     lines.push(`Temp: ${d.deal_temperature}`);
  return lines.join("\n");
}

// ── Inline editable field ─────────────────────────────────────────────────────

function DraftField({
  label,
  value,
  placeholder,
  maxLength,
  disabled,
  onChange,
}: {
  label:       string;
  value:       string;
  placeholder: string;
  maxLength:   number;
  disabled:    boolean;
  onChange:    (v: string) => void;
}) {
  return (
    <div className="mb-1.5">
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-0.5 px-0.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={2}
        disabled={disabled}
        className="w-full resize-none rounded-[8px] border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-cyan/20 disabled:opacity-50"
      />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PostCallDraftPanel({
  draft,
  runId,
  loading,
  onConfirm,
  onSkip,
  onFlag,
  disabled = false,
}: PostCallDraftPanelProps) {
  // Editable local copies of draft fields
  const [summaryLine,        setSummaryLine]        = useState(draft.summary_line         ?? "");
  const [promisesMade,       setPromisesMade]        = useState(draft.promises_made        ?? "");
  const [nextTaskSuggestion, setNextTaskSuggestion]  = useState(draft.next_task_suggestion ?? "");
  const [dealTemperature,    setDealTemperature]     = useState<PostCallDraft["deal_temperature"]>(draft.deal_temperature);
  const [flagged,            setFlagged]             = useState(false);

  // Objection tag state — multi-select from allowlist + optional note for "other"
  const [selectedTags,  setSelectedTags]  = useState<Set<ObjectionTag>>(
    // Pre-populate from draft if AI suggested one
    draft.objection ? new Set<ObjectionTag>() : new Set<ObjectionTag>(),
  );
  const [objectionNote, setObjectionNote] = useState(draft.objection ?? "");
  const [showObjNote,   setShowObjNote]   = useState(false);

  const toggleTag = (tag: ObjectionTag) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
        if (next.size === 0) setShowObjNote(false);
      } else {
        next.add(tag);
        if (tag === "other") setShowObjNote(true);
      }
      return next;
    });
  };

  const buildObjections = (): ObjectionCapture[] =>
    Array.from(selectedTags).map((tag) => ({
      tag,
      note: (tag === "other" && objectionNote.trim()) ? objectionNote.trim().slice(0, 120) : null,
    }));

  const handleConfirm = () => {
    const edited: PostCallDraft = {
      summary_line:         summaryLine.trim()        || null,
      promises_made:        promisesMade.trim()       || null,
      objection:            null,
      next_task_suggestion: nextTaskSuggestion.trim() || null,
      deal_temperature:     dealTemperature,
    };
    onConfirm(assembleDraft(edited), runId, buildObjections());
  };

  const handleSkip = () => {
    onSkip(buildObjections());
  };

  const handleFlag = () => {
    setFlagged(true);
    onFlag(runId);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 px-1">
        <Loader2 className="h-3 w-3 animate-spin text-purple-400/50" />
        <span className="text-[11px] text-muted-foreground/40">Drafting call notes…</span>
      </div>
    );
  }

  const tempMeta = dealTemperature ? TEMP_META[dealTemperature] : null;

  return (
    <div className="mb-3">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-3 w-3 text-purple-400/60" />
        <span className="text-[10px] uppercase tracking-wider text-purple-400/60 font-semibold">
          Draft notes — review &amp; confirm
        </span>
        {tempMeta && (
          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${tempMeta.color} ${tempMeta.bg}`}>
            {tempMeta.label}
          </span>
        )}
      </div>

      {/* ── Deal temperature chips ────────────────────────────── */}
      <div className="flex gap-1 mb-2">
        {(["hot", "warm", "cool", "cold", "dead"] as const).map((t) => {
          const m = TEMP_META[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setDealTemperature(dealTemperature === t ? null : t)}
              disabled={disabled}
              className={`flex-1 rounded-[8px] py-1 text-[10px] font-medium border transition-all disabled:opacity-50 ${
                dealTemperature === t
                  ? `${m.bg} ${m.color}`
                  : "bg-white/[0.02] border-white/[0.05] text-muted-foreground/40 hover:border-white/[0.10]"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ── Draft text fields ─────────────────────────────────── */}
      <DraftField
        label="Summary"
        value={summaryLine}
        placeholder="What happened on this call…"
        maxLength={120}
        disabled={disabled}
        onChange={setSummaryLine}
      />
      <DraftField
        label="Promised"
        value={promisesMade}
        placeholder="What was committed to…"
        maxLength={80}
        disabled={disabled}
        onChange={setPromisesMade}
      />
      <DraftField
        label="Next step"
        value={nextTaskSuggestion}
        placeholder="Suggested next action…"
        maxLength={60}
        disabled={disabled}
        onChange={setNextTaskSuggestion}
      />

      {/* ── Objection tag chips ───────────────────────────────── */}
      <div className="mb-2">
        <div className="flex items-center gap-1 mb-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/40 px-0.5">
            Objection <span className="text-muted-foreground/25 normal-case">(optional)</span>
          </label>
          {selectedTags.size > 0 && (
            <span className="ml-auto text-[9px] text-orange-400/60">{selectedTags.size} tagged</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {OBJECTION_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              disabled={disabled}
              className={`rounded-[6px] px-2 py-0.5 text-[10px] font-medium border transition-all disabled:opacity-50 ${
                selectedTags.has(tag)
                  ? "bg-orange-500/15 border-orange-500/35 text-orange-400"
                  : "bg-white/[0.02] border-white/[0.05] text-muted-foreground/40 hover:border-white/[0.12] hover:text-muted-foreground/60"
              }`}
            >
              {OBJECTION_TAG_LABELS[tag]}
            </button>
          ))}
        </div>
        {/* Note field shown when "other" is selected or any tag is selected and operator wants to add context */}
        {(showObjNote || (selectedTags.size > 0 && objectionNote)) && (
          <textarea
            value={objectionNote}
            onChange={(e) => setObjectionNote(e.target.value)}
            placeholder="Brief note on the objection…"
            maxLength={120}
            rows={1}
            disabled={disabled}
            className="mt-1 w-full resize-none rounded-[8px] border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-orange-500/20 disabled:opacity-50"
          />
        )}
        {selectedTags.size > 0 && !showObjNote && (
          <button
            type="button"
            onClick={() => setShowObjNote(true)}
            disabled={disabled}
            className="mt-0.5 text-[10px] text-muted-foreground/30 hover:text-muted-foreground/50 disabled:opacity-40"
          >
            + add note
          </button>
        )}
      </div>

      {/* ── Actions ───────────────────────────────────────────── */}
      <Button
        onClick={handleConfirm}
        disabled={disabled}
        className="w-full mt-1 gap-2 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25 text-sm font-semibold"
      >
        {disabled ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Use these notes
      </Button>

      <div className="flex gap-1.5 mt-1">
        <button
          type="button"
          onClick={handleFlag}
          disabled={disabled || flagged}
          className={`flex-1 flex items-center justify-center gap-1 rounded-[8px] px-2 py-1.5 text-[11px] border transition-all disabled:opacity-40 ${
            flagged
              ? "bg-orange-500/10 border-orange-500/25 text-orange-400"
              : "bg-white/[0.02] border-white/[0.04] text-muted-foreground/40 hover:text-muted-foreground/60 hover:border-white/[0.08]"
          }`}
        >
          <Flag className="h-3 w-3" />
          {flagged ? "Flagged" : "Flag draft"}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1 rounded-[8px] px-2 py-1.5 text-[11px] border bg-white/[0.02] border-white/[0.04] text-muted-foreground/40 hover:text-muted-foreground/60 hover:border-white/[0.08] transition-all disabled:opacity-40"
        >
          <SkipForward className="h-3 w-3" />
          Use my notes
        </button>
      </div>
    </div>
  );
}
