"use client";

/**
 * PostCallPanel — PR3b
 *
 * Shown after a call ends when a dialer session exists.
 * Submits to the publish route (writes calls_log + leads qualification)
 * and fires the legacy call PATCH (for increment_lead_call_counters RPC).
 *
 * Step flow:
 *   • no_answer / voicemail / disqualified → one-tap publish (no further steps)
 *   • completed / not_interested / offer_made → Step 1 dispo → Step 3 qual confirm
 *   • follow_up / appointment → Step 1 dispo → Step 2 callback date → Step 3 qual confirm
 *
 * Step 3 (qual confirm): pre-populated from pre-call CRM values, operator adjusts
 * before final publish. Passes motivation_level + seller_timeline to publish-manager
 * via the existing PublishInput fields. Skippable.
 *
 * publish-manager is the sole dialer write path back to CRM tables.
 */

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2, Loader2, SkipForward,
  Phone, PhoneOff, Voicemail, CalendarCheck,
  X, ArrowRight, ChevronLeft, ChevronRight, Flag,
  AlertTriangle, Sparkles, PhoneMissed, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QuickTaskSetter } from "@/components/sentinel/quick-task-setter";
import { GlassCard } from "@/components/sentinel/glass-card";
import { supabase } from "@/lib/supabase";
import type { PublishDisposition } from "@/lib/dialer/types";
import { isAutoCycleLeadExitDisposition } from "@/lib/dialer/auto-cycle";
import { PostCallDraftPanel } from "@/components/sentinel/post-call-draft-panel";
import type { PostCallDraft, ObjectionCapture } from "@/components/sentinel/post-call-draft-panel";
import { QualGapStripCompact } from "@/components/sentinel/qual-gap-strip";
import type { QualCheckInput, QualItemKey } from "@/lib/dialer/qual-checklist";
import type { PostCallStructureInput } from "@/lib/dialer/post-call-structure";
import { formatDueDateLabel } from "@/lib/due-date-label";
import type { IntroPendingAction } from "@/lib/intro-sop-state";

interface PublishQaFinding {
  check_type: string;
  severity: string;
  finding: string;
  ai_derived: boolean;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  return headers;
}

function toLocalDateTimeInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function daysFromNow9am(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

interface DispoDefault {
  nextAction: string;
  daysOut: number;
}

const DISPO_DEFAULTS: Partial<Record<PublishDisposition, DispoDefault>> = {
  no_answer:  { nextAction: "Call back",  daysOut: 1 },
  voicemail:  { nextAction: "Call back",  daysOut: 3 },
  dead_phone: { nextAction: "Drive by",   daysOut: 1 },
};

const STEP3_TASK_DEFAULTS: Partial<Record<PublishDisposition, { type: "callback" | "follow_up" | "drive_by"; when: "tomorrow" | "in_3_days" }>> = {
  completed:  { type: "follow_up",  when: "in_3_days" },
  offer_made: { type: "follow_up",  when: "in_3_days" },
  follow_up:  { type: "callback",   when: "in_3_days" },
  appointment:{ type: "callback",   when: "in_3_days" },
};

function deriveStructureFromSummary(summaryText: string): PostCallStructureInput {
  const lines = summaryText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const summaryLine = lines[0] ?? null;
  const promises = lines.find((l) => /^promised:/i.test(l))?.replace(/^promised:\s*/i, "") ?? null;
  const next = lines.find((l) => /^next:/i.test(l))?.replace(/^next:\s*/i, "") ?? null;
  const callbackHint = lines.find((l) => /^best callback timing:/i.test(l))?.replace(/^best callback timing:\s*/i, "") ?? null;

  return {
    summary_line: summaryLine,
    promises_made: promises,
    next_task_suggestion: next,
    callback_timing_hint: callbackHint,
  };
}

interface DispoMeta {
  key: PublishDisposition;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

const DISPO_OPTIONS: DispoMeta[] = [
  { key: "no_answer",      label: "No Answer",      icon: PhoneOff,      color: "text-foreground",    bg: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "voicemail",      label: "Voicemail",      icon: Voicemail,     color: "text-foreground",    bg: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "completed",      label: "Talked / Interested", icon: Phone,    color: "text-primary",        bg: "bg-primary/8 hover:bg-primary/15 border-primary/15" },
  { key: "follow_up",      label: "Callback",       icon: ArrowRight,    color: "text-foreground",     bg: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "appointment",    label: "Appointment",    icon: CalendarCheck, color: "text-foreground",     bg: "bg-muted/10 hover:bg-muted/20 border-border/20" },
  { key: "drive_by",       label: "Drive By",       icon: MapPin,        color: "text-primary",        bg: "bg-primary/8 hover:bg-primary/15 border-primary/15" },
  { key: "not_interested", label: "Not Interested", icon: X,             color: "text-red-300",        bg: "bg-red-500/8 hover:bg-red-500/15 border-red-500/15" },
  { key: "wrong_number",   label: "Wrong Number (This Number)",   icon: PhoneMissed,   color: "text-amber-200",      bg: "bg-amber-500/8 hover:bg-amber-500/15 border-amber-500/15" },
  { key: "disconnected",   label: "Disconnected (This Number)",   icon: PhoneMissed,   color: "text-amber-200",      bg: "bg-amber-500/8 hover:bg-amber-500/15 border-amber-500/15" },
  { key: "do_not_call",    label: "Do Not Call",    icon: Flag,          color: "text-red-300",        bg: "bg-red-500/8 hover:bg-red-500/15 border-red-500/15" },
];

// Dispositions that include a callback date capture step (Step 2)
const NEXT_STEP_DISPOS = new Set<PublishDisposition>(["follow_up", "appointment"]);

// Dispositions that are likely live-answer and warrant a qual confirm step (Step 3)
const QUAL_CONFIRM_DISPOS = new Set<PublishDisposition>([
  "completed", "not_interested", "follow_up", "appointment",
]);

const AUTO_ADVANCE_DISPOS = new Set<PublishDisposition>([
  "no_answer", "voicemail", "dead_phone", "drive_by", "not_interested", "wrong_number", "disconnected", "do_not_call", "dead_lead",
]);
const POSITIVE_CALLBACK_DISPOS = new Set<PublishDisposition>([
  "completed",
  "follow_up",
  "appointment",
  "offer_made",
]);

const AUTO_ADVANCE_DELAY_MS = 1200;

function successLabelForDisposition(
  disposition: PublishDisposition,
  persistedStatus?: unknown,
): string {
  if (persistedStatus === "dead") return "Marked Dead";
  if (persistedStatus === "nurture") return "Moved to Nurture";

  switch (disposition) {
    case "completed":
      return "Talked / Interested";
    case "follow_up":
      return "Callback Scheduled";
    case "appointment":
      return "Appointment Saved";
    case "drive_by":
      return "Moved to Drive By";
    case "not_interested":
      return "Marked Dead";
    case "wrong_number":
      return "Number Dead · Wrong Number";
    case "disconnected":
      return "Number Dead · Disconnected";
    case "do_not_call":
      return "Marked Dead · Do Not Call";
    case "no_answer":
      return "No Answer Saved";
    case "voicemail":
      return "Voicemail Saved";
    case "dead_phone":
      return "Dead Phone Saved";
    case "dead_lead":
      return "Marked Dead";
    case "disqualified":
      return "Moved to Nurture";
    case "offer_made":
      return "Offer Saved";
    default:
      return "Saved";
  }
}

const TIMELINE_CHIPS: { value: string; label: string }[] = [
  { value: "immediate", label: "Immediate" },
  { value: "30_days",   label: "30 days" },
  { value: "60_days",   label: "60 days" },
  { value: "flexible",  label: "Flexible" },
];

const QA_CHECK_LABELS: Record<string, string> = {
  missing_qual: "Missing qualification",
  no_next_action: "No next action",
  unresolved_objection: "Unresolved objection",
  short_call: "Short call",
  no_notes: "No notes",
  ai_notes_flag: "Weak follow-up (AI)",
  trust_risk: "Trust risk (AI)",
};

function getQaSeverityTone(severity: string): string {
  if (severity === "flag") {
    return "border-amber-500/25 bg-amber-500/[0.06] text-amber-100";
  }
  if (severity === "warn") {
    return "border-overlay-8 bg-overlay-3 text-foreground/80";
  }
  return "border-overlay-6 bg-overlay-2 text-muted-foreground";
}

function getQaSeverityLabel(severity: string): string {
  if (severity === "flag") return "Flag";
  if (severity === "warn") return "Warn";
  return "Info";
}

function getQaSeverityWeight(severity: string): number {
  if (severity === "flag") return 0;
  if (severity === "warn") return 1;
  return 2;
}

/** Minimal lead context fields needed for the qual checklist strip. */
export interface PostCallQualContext {
  address:                string | null;
  decisionMakerConfirmed: boolean;
  conditionLevel:         number | null;
  occupancyScore:         number | null;
  hasOpenTask:            boolean;
}

export interface PostCallIntroStateMeta {
  pendingAction: IntroPendingAction;
  retryRound: 1 | 2 | 3;
  roundAttemptCount: number;
  roundAttemptLimit: number;
  retryDueAt: string | null;
  pendingFinalExit: boolean;
}

export interface PostCallPanelProps {
  sessionId: string;
  callLogId: string | null;
  userId: string;
  timerElapsed: number;
  initialSummary?: string;
  /** Pre-populate qual confirm from current CRM values */
  initialMotivationLevel?: number | null;
  initialSellerTimeline?: string | null;
  /** Optional: additional context for the qual gap checklist */
  qualContext?: PostCallQualContext | null;
  /** Phone number for callback confirmation SMS */
  phoneNumber?: string | null;
  /** Lead ID for SMS compliance check */
  leadId?: string | null;
  /** When true, route closeout progression through the Auto Cycle overlay instead of legacy cadence. */
  autoCycleEnabled?: boolean;
  /** Optional hook to persist any unsaved operator draft note before publish finishes. */
  beforePublish?: () => Promise<unknown> | unknown;
  onComplete: (
    disposition?: PublishDisposition,
    meta?: { autoCycleStatus?: string | null; introState?: PostCallIntroStateMeta | null },
  ) => void | Promise<void>;
  onSkip: (
    disposition?: PublishDisposition,
    meta?: { autoCycleStatus?: string | null; introState?: PostCallIntroStateMeta | null },
  ) => void | Promise<void>;
}

export function PostCallPanel({
  sessionId,
  callLogId,
  userId,
  timerElapsed,
  initialSummary = "",
  initialMotivationLevel = null,
  initialSellerTimeline = null,
  qualContext = null,
  phoneNumber = null,
  leadId = null,
  autoCycleEnabled = false,
  beforePublish,
  onComplete,
  onSkip,
}: PostCallPanelProps) {
  const [selected, setSelected] = useState<PublishDisposition | null>(null);
  const [pendingDispo, setPendingDispo] = useState<PublishDisposition | null>(null);
  const [callbackAt, setCallbackAt] = useState("");
  const [sendConfirmSms, setSendConfirmSms] = useState(false);
  // Step 3 state
  const [qualStep, setQualStep] = useState(false);
  const [qualFromDate, setQualFromDate] = useState(false);     // came from Step 2
  const [pendingNextCallAt, setPendingNextCallAt] = useState<string | undefined>(undefined);
  const [qualMotivation, setQualMotivation] = useState<number | null>(initialMotivationLevel);
  const [qualTimeline, setQualTimeline] = useState<string | null>(initialSellerTimeline);

  const [summary, setSummary] = useState(initialSummary);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null); // dispo label shown briefly on success
  const [savedDispo, setSavedDispo] = useState<PublishDisposition | null>(null);
  /** Compact confirmation lines after publish — no API snapshot; local truth only */
  const [publishSnapshot, setPublishSnapshot] = useState<{
    nextStep: string | null;
    dueLine: string | null;
    taskCreated: boolean;
  } | null>(null);
  const [publishQaFindings, setPublishQaFindings] = useState<PublishQaFinding[]>([]);
  const [promoteFactsBusy, setPromoteFactsBusy] = useState(false);
  const [promoteFactsInfo, setPromoteFactsInfo] = useState<{ promoted: number; contradictions: number } | null>(
    null,
  );
  const [autoCycleStatus, setAutoCycleStatus] = useState<string | null>(null);

  // ── AI extraction state ───────────────────────────────────────
  const [extracting, setExtracting] = useState(false);
  // Tracks which fields were last set by AI (cleared when operator manually changes)
  const [aiSuggested, setAiSuggested] = useState<Set<string>>(new Set());
  // run_id returned by the extract route — used for review signal at publish time
  const [extractRunId, setExtractRunId] = useState<string | null>(null);
  // Whether Logan flagged the AI output as bad (toggled in Step 3)
  const [summaryFlagged, setSummaryFlagged] = useState(false);
  const extractFired = useRef(false);

  // ── Draft note state ──────────────────────────────────────────
  // draftLoading: true while waiting for /draft-note API response
  const [draftLoading, setDraftLoading] = useState(false);
  // draft: the AI-generated structured draft (null if not yet fetched or failed)
  const [draft, setDraft] = useState<PostCallDraft | null>(null);
  // draftRunId: trace run_id for the draft generation
  const [draftRunId, setDraftRunId] = useState<string | null>(null);
  // draftDone: true once operator confirmed or skipped the draft
  const [draftDone, setDraftDone] = useState(false);
  // draftFired: prevents duplicate calls if qualStep re-renders
  const draftFired = useRef(false);
  // summarize run_id for eval closure on publish (optional)
  const [summaryRunId, setSummaryRunId] = useState<string | null>(null);
  const summaryRunPromise = useRef<Promise<string | null> | null>(null);

  // ── Next action state (hard enforcement — no lead advances without next_action) ──
  const [nextAction, setNextAction] = useState("");
  const [nextActionDueAt, setNextActionDueAt] = useState("");

  const [step3DetailsOpen, setStep3DetailsOpen] = useState(false);
  // Qual checklist overrides — operator-toggled confirmations
  const [qualOverrides, setQualOverrides] = useState<Partial<Record<QualItemKey, boolean>>>({});
  // Objection tags collected from PostCallDraftPanel (confirm or skip path)
  const [objectionTags, setObjectionTags] = useState<ObjectionCapture[]>([]);
  // Distress signals discovered during the call — writes to distress_events + triggers score recompute
  const [distressSignals, setDistressSignals] = useState<string[]>([]);
  // Structured post-call payload captured in draft review and sent on publish.
  const [structuredDraft, setStructuredDraft] = useState<PostCallStructureInput | null>(null);

  // Fire extraction + draft generation once when Step 3 opens and notes are non-empty
  useEffect(() => {
    if (!qualStep || !summary.trim()) return;

    // ── Qualification extraction (motivation_level, seller_timeline) ──
    if (!extractFired.current) {
      extractFired.current = true;
      setExtracting(true);

      authHeaders()
        .then((hdrs) =>
          fetch(`/api/dialer/v1/sessions/${sessionId}/extract`, {
            method: "POST",
            headers: hdrs,
            body: JSON.stringify({ notes: summary.trim() }),
          }),
        )
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ok?: boolean; motivation_level?: number | null; seller_timeline?: string | null; run_id?: string | null } | null) => {
          if (!data?.ok) return;
          const suggested = new Set<string>();
          if (data.motivation_level != null) {
            setQualMotivation(data.motivation_level);
            suggested.add("motivation");
          }
          if (data.seller_timeline != null) {
            setQualTimeline(data.seller_timeline);
            suggested.add("timeline");
          }
          if (suggested.size > 0) setAiSuggested(suggested);
          if (data.run_id) setExtractRunId(data.run_id);
        })
        .catch(() => {/* non-fatal — step 3 already shows initial values */})
        .finally(() => setExtracting(false));
    }

    // ── Draft note generation ─────────────────────────────────
    if (!draftFired.current) {
      draftFired.current = true;
      setDraftLoading(true);

      authHeaders()
        .then((hdrs) =>
          fetch(`/api/dialer/v1/sessions/${sessionId}/draft-note`, {
            method: "POST",
            headers: hdrs,
            body: JSON.stringify({
              notes:       summary.trim(),
              disposition: pendingDispo ?? undefined,
              callback_at: pendingNextCallAt ?? undefined,
            }),
          }),
        )
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ok?: boolean; draft?: PostCallDraft | null; run_id?: string | null } | null) => {
          if (data?.ok && data.draft) {
            setDraft(data.draft);
            setStructuredDraft({
              summary_line: data.draft.summary_line,
              promises_made: data.draft.promises_made,
              objection: data.draft.objection,
              next_task_suggestion: data.draft.next_task_suggestion,
              callback_timing_hint: data.draft.callback_timing_hint,
              deal_temperature: data.draft.deal_temperature,
            });
            if (data.run_id) setDraftRunId(data.run_id);
          }
          // If ok=false, no draft shown — operator uses raw notes (graceful fallback)
        })
        .catch(() => {/* non-fatal */})
        .finally(() => setDraftLoading(false));
    }

    // ── Summarize run_id (best-effort) ──────────────────────────
    // Pre-generates summary trace run_id so publish can thread summary_run_id
    // into eval side-effects. Non-fatal if unavailable.
    void ensureSummaryRunId(pendingDispo ?? undefined);
  // qualStep is the trigger; pendingDispo/pendingNextCallAt are stable at transition time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualStep]);

  const ensureSummaryRunId = async (dispo?: PublishDisposition): Promise<string | null> => {
    if (summaryRunId) return summaryRunId;
    if (!callLogId) return null;
    const notes = summary.trim();
    if (notes.length < 5) return null;
    if (summaryRunPromise.current) return summaryRunPromise.current;

    const request = (async () => {
      try {
        const hdrs = await authHeaders();
        const res = await fetch("/api/dialer/summarize", {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({
            callLogId,
            sessionId,
            notes,
            disposition: dispo,
            duration: timerElapsed > 0 ? timerElapsed : undefined,
          }),
        });
        if (!res.ok) return null;
        const data = await res.json() as { run_id?: string };
        const runId = typeof data.run_id === "string" ? data.run_id : null;
        if (runId) setSummaryRunId(runId);
        return runId;
      } catch {
        return null;
      } finally {
        summaryRunPromise.current = null;
      }
    })();

    summaryRunPromise.current = request;
    return request;
  };

  const updateStructuredField = (
    key: keyof PostCallStructureInput,
    value: string | null,
  ) => {
    setStructuredDraft((prev) => ({
      ...(prev ?? deriveStructureFromSummary(summary)),
      [key]: value && value.trim() ? value.trim() : null,
    }));
  };

  const handlePublish = async (
    dispo: PublishDisposition,
    nextCallScheduledAt?: string,
    quals?: { motivation_level?: number; seller_timeline?: string },
    reviewSignal?: { flagged: boolean; motivationCorrected: boolean; timelineCorrected: boolean },
    nextActionOverride?: { nextAction?: string | null; nextActionDueAt?: string | null },
  ) => {
    setSelected(dispo);
    setPublishing(true);
    setError(null);
    setPublishQaFindings([]);
    setPublishSnapshot(null);
    setAutoCycleStatus(null);

    if (beforePublish) {
      try {
        await beforePublish();
      } catch {
        // Non-fatal: publish summary still proceeds even if the timestamp save fails.
      }
    }

    const hdrs = await authHeaders();
    const resolvedNextAction = nextActionOverride && Object.prototype.hasOwnProperty.call(nextActionOverride, "nextAction")
      ? (nextActionOverride.nextAction ?? "").trim()
      : nextAction.trim();
    const resolvedNextActionDueAt = nextActionOverride && Object.prototype.hasOwnProperty.call(nextActionOverride, "nextActionDueAt")
      ? (nextActionOverride.nextActionDueAt ?? "").trim()
      : nextActionDueAt.trim();
    const summaryRunIdForPublish = await ensureSummaryRunId(dispo);
    const fallbackStructure = deriveStructureFromSummary(summary.trim());
    const mergedStructure: PostCallStructureInput = {
      ...fallbackStructure,
      ...(structuredDraft ?? {}),
    };
    const publishStructure = {
      summary_line: mergedStructure.summary_line ?? null,
      promises_made: mergedStructure.promises_made ?? null,
      objection: mergedStructure.objection ?? null,
      next_task_suggestion: mergedStructure.next_task_suggestion ?? null,
      deal_temperature: mergedStructure.deal_temperature ?? null,
    };
    const shouldSendStructure = Boolean(
      publishStructure.summary_line ||
      publishStructure.promises_made ||
      publishStructure.objection ||
      publishStructure.next_task_suggestion ||
      publishStructure.deal_temperature,
    );

    // Publish to session — authoritative write for calls_log disposition + notes + qual fields.
    // callback_at is forwarded so publish-manager can create a tasks row for follow_up/appointment.
    // extract_run_id + summary_flagged + ai_corrections close the operator review loop on the
    // AI extraction — updating the corresponding dialer_ai_traces row for eval visibility.
    const publishRes = await fetch(`/api/dialer/v1/sessions/${sessionId}/publish`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        disposition: dispo,
        duration_sec: timerElapsed > 0 ? timerElapsed : undefined,
        summary: summary.trim() || undefined,
        ...(nextCallScheduledAt ? { callback_at: nextCallScheduledAt } : {}),
        ...(quals?.motivation_level != null ? { motivation_level: quals.motivation_level } : {}),
        ...(quals?.seller_timeline       ? { seller_timeline: quals.seller_timeline }       : {}),
        // Review signal — only sent when extraction ran in this session
        ...(extractRunId ? {
          extract_run_id:  extractRunId,
          summary_flagged: reviewSignal?.flagged ?? summaryFlagged,
          ai_corrections: {
            motivation_corrected: reviewSignal?.motivationCorrected ?? false,
            timeline_corrected:   reviewSignal?.timelineCorrected   ?? false,
          },
        } : {}),
        ...(summaryRunIdForPublish ? { summary_run_id: summaryRunIdForPublish } : {}),
        // draft_note run_id — included when a draft was generated (confirmed or flagged).
        // The publish route passes this to writeAiTrace for review closure.
        // No schema change needed — the route already handles unknown extra fields safely.
        ...(draftRunId ? { draft_note_run_id: draftRunId, draft_flagged: summaryFlagged } : {}),
        // Objection tags — collected from PostCallDraftPanel (confirm or skip path).
        // Forwarded to publish-manager which writes to lead_objection_tags (non-fatal).
        ...(objectionTags.length > 0 ? { objection_tags: objectionTags } : {}),
        ...(distressSignals.length > 0 ? { distress_signals: distressSignals } : {}),
        ...(resolvedNextAction ? { next_action: resolvedNextAction } : {}),
        ...(resolvedNextActionDueAt ? { next_action_due_at: new Date(resolvedNextActionDueAt).toISOString() } : {}),
        ...(shouldSendStructure ? { post_call_structure: publishStructure } : {}),
        ...(Object.keys(qualOverrides).length > 0 ? { qual_confirmed: {
          decision_maker_confirmed: qualOverrides.decision_maker,
          condition_level: qualOverrides.condition ? 1 : undefined,
          occupancy_score: qualOverrides.occupancy ? 1 : undefined,
        } } : {}),
      }),
    }).catch(() => null);

    const publishData = await publishRes?.json().catch(() => ({})) as Record<string, unknown>;

    if (!publishRes?.ok) {
      setError(
        publishData?.code === "INVALID_TRANSITION"
          ? "Call still finalizing — try again in a moment"
          : (publishData?.error as string) ?? "Save failed — try again",
      );
      setPublishing(false);
      setSelected(null);
      return;
    }

    // Surface publish warnings (e.g. post_call_analysis_failed, post_call_structure_failed)
    const warnings = publishData?.warnings as string[] | undefined;
    if (warnings && warnings.length > 0) {
      for (const w of warnings) {
        if (w === "post_call_analysis_failed") {
          toast.warning("Seller memory not captured — structured data will populate on next call");
        } else if (w === "post_call_structure_failed") {
          toast.warning("Post-call structure write failed — retry from session history");
        } else {
          toast.warning(`Publish warning: ${w}`);
        }
      }
    }

    const qaFindings = Array.isArray(publishData?.qaFindings)
      ? publishData.qaFindings.filter(
        (finding): finding is PublishQaFinding =>
          !!finding &&
          typeof finding === "object" &&
          typeof (finding as PublishQaFinding).check_type === "string" &&
          typeof (finding as PublishQaFinding).severity === "string" &&
          typeof (finding as PublishQaFinding).finding === "string" &&
          typeof (finding as PublishQaFinding).ai_derived === "boolean",
      ).sort((left, right) => getQaSeverityWeight(left.severity) - getQaSeverityWeight(right.severity))
      : [];

    setPublishQaFindings(qaFindings);

    const introState: PostCallIntroStateMeta | null =
      (publishData?.intro_pending_action === "retry_or_route" || publishData?.intro_pending_action === "final_route")
      && (publishData?.intro_retry_round === 1 || publishData?.intro_retry_round === 2 || publishData?.intro_retry_round === 3)
      && typeof publishData?.intro_round_attempt_count === "number"
      && typeof publishData?.intro_round_attempt_limit === "number"
        ? {
          pendingAction: publishData.intro_pending_action as IntroPendingAction,
          retryRound: publishData.intro_retry_round as 1 | 2 | 3,
          roundAttemptCount: publishData.intro_round_attempt_count as number,
          roundAttemptLimit: publishData.intro_round_attempt_limit as number,
          retryDueAt: typeof publishData?.intro_retry_due_at === "string" ? publishData.intro_retry_due_at : null,
          pendingFinalExit: publishData?.intro_pending_final_exit === true,
        }
        : null;

    if (qaFindings.length > 0) {
      const flaggedCount = qaFindings.filter((finding) => finding.severity === "flag").length;
      const warnCount = qaFindings.filter((finding) => finding.severity === "warn").length;
      const summaryBits: string[] = [];
      if (flaggedCount > 0) {
        summaryBits.push(`${flaggedCount} flag${flaggedCount === 1 ? "" : "s"}`);
      }
      if (warnCount > 0) {
        summaryBits.push(`${warnCount} warning${warnCount === 1 ? "" : "s"}`);
      }
      if (summaryBits.length === 0) {
        summaryBits.push(`${qaFindings.length} item${qaFindings.length === 1 ? "" : "s"}`);
      }
      toast.warning(`QA found ${summaryBits.join(" and ")} for this call`);
    }

    // Keep lead_phones in sync with call outcomes so both dialer modes and the
    // client file immediately agree on the winning or dead number.
    if (
      ((dispo === "dead_phone" || dispo === "wrong_number" || dispo === "disconnected" || dispo === "do_not_call") || POSITIVE_CALLBACK_DISPOS.has(dispo))
      && leadId
      && phoneNumber
    ) {
      try {
        const phonesRes = await fetch(`/api/leads/${leadId}/phones`, { headers: hdrs });
        if (phonesRes.ok) {
          const phonesData = await phonesRes.json();
          const digits = phoneNumber.replace(/\D/g, "");
          const match = (phonesData.phones ?? []).find(
            (p: { id: string; phone: string }) => p.phone.replace(/\D/g, "") === digits,
          );
          if (match) {
            const phonePatch = POSITIVE_CALLBACK_DISPOS.has(dispo)
              ? { mark_primary: true }
              : dispo === "do_not_call"
                ? { status: "dnc" }
                : { status: "dead", dead_reason: dispo === "wrong_number" ? "wrong_number" : "disconnected" };
            await fetch(`/api/leads/${leadId}/phones/${match.id}`, {
              method: "PATCH",
              headers: hdrs,
              body: JSON.stringify(phonePatch),
            });
          }
        }
      } catch {
        console.warn("[PostCallPanel] Phone outcome sync failed (non-fatal)");
      }
    }

    let resolvedAutoCycleStatus: string | null = null;
    if (autoCycleEnabled && leadId) {
      try {
        const autoCycleRes = await fetch("/api/dialer/v1/auto-cycle/outcome", {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          leadId,
          disposition: dispo,
          phoneNumber,
        }),
        });
        if (autoCycleRes.ok) {
          const autoCycleData = await autoCycleRes.json().catch(() => ({})) as { cycle_status?: string | null };
          resolvedAutoCycleStatus = autoCycleData.cycle_status ?? null;
          setAutoCycleStatus(resolvedAutoCycleStatus);
        }
      } catch (err) {
        console.warn("[PostCallPanel] Auto Cycle outcome update failed (non-fatal).", err);
      }
    }

    // Fire legacy call path AFTER publish succeeds — only for increment_lead_call_counters RPC.
    // skipCallsLogWrite: publish-manager already owns the calls_log write above.
    // nextCallScheduledAt: operator-set date overrides cadence scheduling in the RPC.
    if (!autoCycleEnabled && callLogId) {
      fetch("/api/dialer/call", {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({
          callLogId,
          disposition: dispo,
          durationSec: timerElapsed > 0 ? timerElapsed : undefined,
          userId,
          skipCallsLogWrite: true,
          ...(nextCallScheduledAt ? { nextCallScheduledAt } : {}),
        }),
      }).catch((err) => {
        console.warn("[PostCallPanel] /api/dialer/call counter PATCH failed (post-publish); call counters may not have incremented.", err);
      });
    }

    // Brief success confirmation before advancing to next lead
    const label = successLabelForDisposition(dispo, publishData?.status);
    const dueLine =
      nextCallScheduledAt
        ? formatDueDateLabel(nextCallScheduledAt).text
        : resolvedNextActionDueAt
          ? formatDueDateLabel(new Date(resolvedNextActionDueAt).toISOString()).text
          : null;
    const nextStep =
      resolvedNextAction ||
      (NEXT_STEP_DISPOS.has(dispo) && nextCallScheduledAt
        ? `Callback ${new Date(nextCallScheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : null);
    setPublishing(false);
    setSaved(label);
    setSavedDispo(dispo);
    setPublishSnapshot({
      nextStep,
      dueLine,
      taskCreated: typeof publishData?.task_id === "string",
    });
    setPromoteFactsInfo(null);
    const shouldAutoAdvance = AUTO_ADVANCE_DISPOS.has(dispo)
      || (autoCycleEnabled && isAutoCycleLeadExitDisposition(dispo));

    if (!leadId) {
      setTimeout(() => { void onComplete(dispo, { autoCycleStatus: null, introState }); }, 850);
    } else if (shouldAutoAdvance) {
      setTimeout(() => { void onComplete(dispo, { autoCycleStatus: resolvedAutoCycleStatus, introState }); }, AUTO_ADVANCE_DELAY_MS);
    }
  };

  const handlePromoteFacts = async () => {
    setPromoteFactsBusy(true);
    try {
      const hdrs = await authHeaders();
      const res = await fetch(`/api/dialer/v1/sessions/${sessionId}/promote-facts`, {
        method: "POST",
        headers: hdrs,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        promoted?: number;
        contradictions?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Promote failed");
      const promoted = data.promoted ?? 0;
      const contradictions = data.contradictions ?? 0;
      setPromoteFactsInfo({ promoted, contradictions });
      toast.success(`Promoted ${promoted} fact${promoted === 1 ? "" : "s"} to intelligence pipeline`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setPromoteFactsBusy(false);
    }
  };

  const handleSkip = () => {
    const hasUnsavedDraft = Boolean(
      summary.trim() ||
      nextAction.trim() ||
      nextActionDueAt ||
      structuredDraft?.summary_line ||
      structuredDraft?.promises_made ||
      structuredDraft?.objection ||
      structuredDraft?.next_task_suggestion ||
      structuredDraft?.deal_temperature ||
      objectionTags.length > 0,
    );
    if (
      hasUnsavedDraft &&
      !window.confirm(
        "Skip closeout will discard this draft and will not save it to Call History or the Lead File. Continue?",
      )
    ) {
      return;
    }

    // Still fire legacy path so call counters increment even on skip
    if (!autoCycleEnabled && callLogId) {
      authHeaders().then((hdrs) =>
        fetch("/api/dialer/call", {
          method: "PATCH",
          headers: hdrs,
          body: JSON.stringify({
            callLogId,
            disposition: "completed",
            durationSec: timerElapsed > 0 ? timerElapsed : undefined,
            userId,
          }),
        }).catch((err) => {
          console.warn("[PostCallPanel] /api/dialer/call counter PATCH failed (skip path); call counters may not have incremented.", err);
        }),
      ).catch(() => {});
    }
    void onSkip("completed", { autoCycleStatus, introState: null });
  };

  const handleDispoTap = (dispo: PublishDisposition) => {
    if (publishing) return;
    setStructuredDraft(null);
    setDraft(null);
    setDraftDone(false);
    draftFired.current = false;
    setSummaryRunId(null);
    summaryRunPromise.current = null;
    setDraftRunId(null);
    setObjectionTags([]);

    const defaults = DISPO_DEFAULTS[dispo];
    if (defaults) {
      setNextAction(defaults.nextAction);
      setNextActionDueAt(daysFromNow9am(defaults.daysOut));
    } else {
      setNextAction("");
      setNextActionDueAt("");
    }

    if (NEXT_STEP_DISPOS.has(dispo)) {
      setPendingDispo(dispo);
      setCallbackAt(dispo === "appointment" ? "" : toLocalDateTimeInput(daysFromNow9am(3)));
      setQualStep(false);
      setQualFromDate(false);
    } else if (dispo === "drive_by") {
      setNextAction("Drive by");
      setNextActionDueAt("");
      void handlePublish(dispo, undefined, undefined, undefined, {
        nextAction: "Drive by",
        nextActionDueAt: null,
      });
    } else if (QUAL_CONFIRM_DISPOS.has(dispo)) {
      setPendingDispo(dispo);
      setQualStep(true);
      setQualFromDate(false);
    } else if (defaults) {
      handlePublish(dispo);
    } else {
      handlePublish(dispo);
    }
  };

  // Called from Step 2 confirm — stores date, advances to Step 3.
  // If sendConfirmSms is checked and we have a phone, fire a brief confirmation.
  const handleConfirmPending = async () => {
    if (!pendingDispo) return;
    const iso = callbackAt ? new Date(callbackAt).toISOString() : undefined;
    setPendingNextCallAt(iso);

    if (sendConfirmSms && phoneNumber && callbackAt) {
      const dateStr = new Date(callbackAt).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
      const msg = `Hi, this is Dominion Homes confirming our follow-up call on ${dateStr}. Talk soon!`;
      try {
        await fetch("/api/dialer/sms", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            phone: phoneNumber,
            message: msg,
            leadId: leadId ?? undefined,
            userId,
            force: true,
          }),
        });
      } catch { /* non-fatal — callback still proceeds */ }
    }

    setQualFromDate(true);
    setQualStep(true);
  };

  // Called from Step 3 confirm — fires publish with qual values + review signal.
  // Corrections are inferred: if a field was AI-suggested but is no longer in
  // aiSuggested (operator changed it), that field was corrected.
  const handleQualConfirm = () => {
    if (!pendingDispo) return;
    handlePublish(
      pendingDispo,
      pendingNextCallAt,
      {
        motivation_level: qualMotivation ?? undefined,
        seller_timeline:  qualTimeline   ?? undefined,
      },
      {
        flagged:              summaryFlagged,
        // A field was corrected if it was previously AI-suggested but
        // the operator changed it (removing it from aiSuggested).
        // We detect this by checking if extractRunId exists (extraction ran)
        // and the field is NOT in aiSuggested (operator changed it from AI value).
        motivationCorrected: extractRunId != null && !aiSuggested.has("motivation"),
        timelineCorrected:   extractRunId != null && !aiSuggested.has("timeline"),
      },
    );
  };

  // Back button from Step 3
  const handleQualBack = () => {
    setQualStep(false);
    if (!qualFromDate) {
      // Came from dispo grid — go back to Step 1
      setPendingDispo(null);
    }
    // qualFromDate → stay in Step 2 (pendingDispo still set, qualStep=false)
  };

  const pendingMeta = pendingDispo ? DISPO_OPTIONS.find((d) => d.key === pendingDispo) : null;

  // Minimum datetime for the input — now, formatted as YYYY-MM-DDTHH:MM
  const minDatetime = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  const step3CallbackValue = toLocalDateTimeInput(pendingNextCallAt);

  // ── Header title ─────────────────────────────────────────────
  const headerTitle = qualStep ? "Confirm & Close Out" : pendingDispo ? "Set Callback" : "Close Out Call";

  return (
    <GlassCard hover={false} className="!p-3" onKeyDown={(e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") e.stopPropagation();
    }}>
      {/* ── Success confirmation ── */}
      {saved ? (
        <div className="flex flex-col items-stretch gap-3 py-3 px-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm font-semibold text-foreground">Saved · {saved}</p>
            {savedDispo && AUTO_ADVANCE_DISPOS.has(savedDispo) && leadId && (
              <span className="text-xs text-muted-foreground/50 ml-auto">advancing…</span>
            )}
          </div>
          {publishSnapshot && (publishSnapshot.nextStep || publishSnapshot.dueLine) && (
            <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 px-3 py-2 space-y-1 text-xs">
              {publishSnapshot.nextStep && (
                <p>
                  <span className="text-muted-foreground">Next step </span>
                  <span className="text-foreground font-medium">{publishSnapshot.nextStep}</span>
                </p>
              )}
              {publishSnapshot.dueLine && (
                <p>
                  <span className="text-muted-foreground">Due </span>
                  <span className="text-foreground">{publishSnapshot.dueLine}</span>
                </p>
              )}
            </div>
          )}
          {savedDispo && AUTO_ADVANCE_DISPOS.has(savedDispo) && leadId ? (
            <button
              onClick={() => { void onComplete(savedDispo, { autoCycleStatus, introState: null }); }}
              className="text-xs text-muted-foreground/40 hover:text-foreground/60 transition-colors text-center"
            >
              Skip wait — next lead now
            </button>
          ) : (
            <>
              {publishQaFindings.length > 0 && (
                <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/[0.05] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-200 shrink-0" />
                    <p className="text-sm font-semibold text-amber-100">
                      QA found {publishQaFindings.length} review item{publishQaFindings.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {publishQaFindings.slice(0, 3).map((finding, index) => (
                      <div
                        key={`${finding.check_type}-${index}`}
                        className={`rounded-[8px] border px-2.5 py-2 ${getQaSeverityTone(finding.severity)}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {getQaSeverityLabel(finding.severity)}
                          </span>
                          <span className="text-xs font-semibold">
                            {QA_CHECK_LABELS[finding.check_type] ?? finding.check_type}
                          </span>
                          {finding.ai_derived && (
                            <span className="inline-flex items-center gap-1 text-[11px] italic opacity-80">
                              <Sparkles className="h-2.5 w-2.5" />
                              AI-derived
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-snug opacity-90">{finding.finding}</p>
                      </div>
                    ))}
                  </div>
                  {publishQaFindings.length > 3 && (
                    <p className="text-xs text-amber-100/80">
                      {publishQaFindings.length - 3} more item{publishQaFindings.length - 3 === 1 ? "" : "s"} in Call QA.
                    </p>
                  )}
                </div>
              )}
              {leadId ? (
                <>
                  <Button size="sm" className="w-full gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm" onClick={() => { void onComplete(savedDispo ?? undefined, { autoCycleStatus, introState: null }); }}>
                    Next Lead
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3 space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground/50 font-semibold">
                      Intelligence
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5 text-xs border-primary/25 text-primary hover:bg-primary/10"
                      disabled={promoteFactsBusy}
                      onClick={() => void handlePromoteFacts()}
                    >
                      {promoteFactsBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      Promote Call Facts
                    </Button>
                    {promoteFactsInfo != null && (
                      <p className="text-sm text-muted-foreground">
                        Promoted {promoteFactsInfo.promoted} fact{promoteFactsInfo.promoted === 1 ? "" : "s"} to the
                        intelligence pipeline.
                      </p>
                    )}
                    {promoteFactsInfo != null && promoteFactsInfo.contradictions > 0 && (
                      <div className="flex items-start gap-2 rounded-md border border-border/25 bg-muted/[0.06] px-2 py-1.5 text-sm text-foreground/90">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          {promoteFactsInfo.contradictions} fact
                          {promoteFactsInfo.contradictions === 1 ? "" : "s"} conflict with existing accepted data —
                          review in the dossier / review queue.
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground/50 text-center">Moving to next lead…</p>
              )}
            </>
          )}
        </div>
      ) : (
      <>
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {headerTitle}
        </h2>
        {(qualStep || (!qualStep && pendingDispo)) ? (
          <button
            onClick={qualStep ? handleQualBack : () => { setPendingDispo(null); setCallbackAt(""); }}
            disabled={publishing}
            className="ml-auto flex items-center gap-0.5 text-sm text-muted-foreground/50 hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" />
            Change
          </button>
        ) : (
          <span className="text-sm opacity-40 ml-auto">Tap to save &amp; continue</span>
        )}
      </div>

      {error && (
        <p className="text-sm text-foreground mb-2 px-1">{error}</p>
      )}

      {qualStep && pendingDispo && pendingMeta ? (
        /* ── Step 3: qualification confirm ──────────────────── */
        <div>
          {/* Selected dispo display */}
          <div className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 mb-3 border ${pendingMeta.bg}`}>
            <pendingMeta.icon className={`h-4 w-4 ${pendingMeta.color}`} />
            <span className="text-sm font-medium">{pendingMeta.label}</span>
            {pendingNextCallAt && (
              <span className="ml-auto text-sm text-muted-foreground/50">
                {new Date(pendingNextCallAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            )}
          </div>

          {/* ── Draft note panel ─────────────────────────────── */}
          {(draftLoading || (draft && !draftDone)) && (
            <PostCallDraftPanel
              draft={draft ?? {
                summary_line: null, promises_made: null,
                objection: null, next_task_suggestion: null, callback_timing_hint: null, deal_temperature: null,
              }}
              runId={draftRunId ?? ""}
              loading={draftLoading}
              disabled={publishing}
              onConfirm={(assembledNote, confirmedRunId, editedDraft, tags) => {
                setSummary(assembledNote);
                setDraftRunId(confirmedRunId);
                setStructuredDraft({
                  summary_line: editedDraft.summary_line,
                  promises_made: editedDraft.promises_made,
                  objection: editedDraft.objection,
                  next_task_suggestion: editedDraft.next_task_suggestion,
                  callback_timing_hint: editedDraft.callback_timing_hint,
                  deal_temperature: editedDraft.deal_temperature,
                });
                setObjectionTags(tags);
                setDraftDone(true);
              }}
              onSkip={(tags) => {
                setObjectionTags(tags);
                setStructuredDraft((prev) => prev ?? deriveStructureFromSummary(summary));
                setDraftDone(true);
              }}
              onFlag={(flaggedRunId) => {
                setDraftRunId(flaggedRunId);
                setSummaryFlagged(true);
              }}
            />
          )}

          {NEXT_STEP_DISPOS.has(pendingDispo) && (
            <div className="mb-3">
              <label className="block text-sm text-muted-foreground/60 mb-1.5 px-0.5">
                Callback date &amp; time <span className="opacity-50">(quick correction)</span>
              </label>
              <input
                type="datetime-local"
                value={step3CallbackValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setPendingNextCallAt(v ? new Date(v).toISOString() : undefined);
                }}
                min={minDatetime}
                disabled={publishing}
                style={{ colorScheme: "dark" }}
                className="w-full rounded-[10px] border border-overlay-6 bg-overlay-3 px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/20 disabled:opacity-50"
              />
            </div>
          )}

          {/* Motivation level */}
          <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
            <label className="text-sm text-muted-foreground/60">Motivation level</label>
            {extracting && <Loader2 className="h-2.5 w-2.5 animate-spin text-foreground/50" />}
            {!extracting && aiSuggested.has("motivation") && (
              <span className="text-xs text-foreground/60 uppercase tracking-wide">AI</span>
            )}
          </div>
          <div className="flex gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setQualMotivation(qualMotivation === n ? null : n);
                  setAiSuggested((prev) => { const s = new Set(prev); s.delete("motivation"); return s; });
                }}
                disabled={publishing}
                className={`flex-1 rounded-[10px] py-2 text-sm font-semibold border transition-all ${
                  qualMotivation === n
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-overlay-3 border-overlay-6 text-muted-foreground/60 hover:border-white/[0.14]"
                } disabled:opacity-50`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Seller timeline */}
          <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
            <label className="text-sm text-muted-foreground/60">Seller timeline</label>
            {extracting && <Loader2 className="h-2.5 w-2.5 animate-spin text-foreground/50" />}
            {!extracting && aiSuggested.has("timeline") && (
              <span className="text-xs text-foreground/60 uppercase tracking-wide">AI</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {TIMELINE_CHIPS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  setQualTimeline(qualTimeline === value ? null : value);
                  setAiSuggested((prev) => { const s = new Set(prev); s.delete("timeline"); return s; });
                }}
                disabled={publishing}
                className={`rounded-[10px] py-2 text-xs font-medium border transition-all ${
                  qualTimeline === value
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-overlay-3 border-overlay-6 text-muted-foreground/60 hover:border-white/[0.14]"
                } disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Resurface (date + note, hard enforcement) ───────── */}
          {(() => {
            const taskDefaults = pendingDispo ? STEP3_TASK_DEFAULTS[pendingDispo] : undefined;
            return (
              <div className={`mb-3 rounded-[10px] border p-2.5 space-y-1.5 ${
                !nextAction.trim()
                  ? "border-amber-500/25 bg-amber-500/[0.04]"
                  : "border-primary/10 bg-primary/[0.03]"
              }`}>
                <p className={`text-xs uppercase tracking-wider font-semibold ${!nextAction.trim() ? "text-amber-400" : "text-primary/60"}`}>
                  {!nextAction.trim() ? "Resurface — Required" : "Resurface"}
                </p>
                {nextAction.trim() ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground/80">{nextAction}</span>
                    <button onClick={() => { setNextAction(""); setNextActionDueAt(""); }} className="text-[10px] text-muted-foreground/40 hover:text-foreground/60">Change</button>
                  </div>
                ) : (
                  <QuickTaskSetter
                    compact
                    defaultType={taskDefaults?.type}
                    defaultWhen={taskDefaults?.when}
                    onSave={(result) => {
                      setNextAction(result.title);
                      setNextActionDueAt(result.dueAt ? new Date(result.dueAt).toISOString() : "");
                    }}
                    onCancel={() => {}}
                  />
                )}
              </div>
            );
          })()}

          {/* Collapsible details: structured corrections, qual gaps, distress signals */}
          <button
            type="button"
            onClick={() => setStep3DetailsOpen((v) => !v)}
            className="flex items-center gap-1.5 w-full mb-2 px-1 py-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${step3DetailsOpen ? "rotate-90" : ""}`} />
            <span className="uppercase tracking-wider font-semibold">Details</span>
            {(distressSignals.length > 0 || (structuredDraft?.promises_made ?? "").trim() || (structuredDraft?.objection ?? "").trim()) && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
            )}
          </button>
          {step3DetailsOpen && (
            <div className="mb-3 space-y-3">
              <div className="rounded-[10px] border border-overlay-5 bg-overlay-2 p-2.5 space-y-1.5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground/45">Post-call structure</p>
                <textarea
                  value={structuredDraft?.promises_made ?? ""}
                  onChange={(e) => updateStructuredField("promises_made", e.target.value)}
                  placeholder="Promises made (optional)"
                  maxLength={200}
                  rows={1}
                  disabled={publishing}
                  className="w-full resize-none rounded-[8px] border border-overlay-6 bg-overlay-3 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 disabled:opacity-50"
                />
                <textarea
                  value={structuredDraft?.objection ?? ""}
                  onChange={(e) => updateStructuredField("objection", e.target.value)}
                  placeholder="Primary objection (optional)"
                  maxLength={200}
                  rows={1}
                  disabled={publishing}
                  className="w-full resize-none rounded-[8px] border border-overlay-6 bg-overlay-3 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 disabled:opacity-50"
                />
                <textarea
                  value={structuredDraft?.next_task_suggestion ?? ""}
                  onChange={(e) => updateStructuredField("next_task_suggestion", e.target.value)}
                  placeholder="Suggested next action (optional)"
                  maxLength={200}
                  rows={1}
                  disabled={publishing}
                  className="w-full resize-none rounded-[8px] border border-overlay-6 bg-overlay-3 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 disabled:opacity-50"
                />
                <textarea
                  value={structuredDraft?.callback_timing_hint ?? ""}
                  onChange={(e) => updateStructuredField("callback_timing_hint", e.target.value)}
                  placeholder="Best callback timing phrase (optional)"
                  maxLength={120}
                  rows={1}
                  disabled={publishing}
                  className="w-full resize-none rounded-[8px] border border-overlay-6 bg-overlay-3 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 disabled:opacity-50"
                />
              </div>
              <QualGapStripCompact
                input={{
                  address:                qualContext?.address ?? null,
                  decisionMakerConfirmed: qualContext?.decisionMakerConfirmed ?? false,
                  sellerTimeline:         qualTimeline,
                  conditionLevel:         qualContext?.conditionLevel ?? null,
                  occupancyScore:         qualContext?.occupancyScore ?? null,
                  motivationLevel:        qualMotivation,
                  hasOpenTask:            qualContext?.hasOpenTask ?? false,
                } satisfies QualCheckInput}
                overrides={qualOverrides}
                onToggle={(key, confirmed) => setQualOverrides((prev) => ({ ...prev, [key]: confirmed }))}
                showNextQuestion={true}
                className="rounded-[10px] bg-white/[0.015] border border-overlay-4 p-2.5"
              />
              <div>
                <label className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-1.5 block">Distress Signals</label>
                <div className="flex flex-wrap gap-1.5">
                  {["probate", "pre_foreclosure", "tax_lien", "bankruptcy", "divorce", "vacant", "absentee", "inherited", "condemned", "water_shutoff"].map((signal) => (
                    <button
                      key={signal}
                      onClick={() => setDistressSignals((prev) =>
                        prev.includes(signal) ? prev.filter((s) => s !== signal) : [...prev, signal]
                      )}
                      disabled={publishing}
                      className={`px-2 py-0.5 rounded-[8px] text-xs font-medium border transition-all ${
                        distressSignals.includes(signal)
                          ? "bg-primary/20 border-primary/40 text-primary"
                          : "bg-overlay-3 border-overlay-6 text-muted-foreground/50 hover:border-white/[0.14]"
                      } disabled:opacity-50`}
                    >
                      {signal.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleQualConfirm}
            disabled={publishing}
            className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold shadow-sm"
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Complete Closeout
          </Button>

          {extractRunId && (
            <button
              type="button"
              onClick={() => setSummaryFlagged((v) => !v)}
              disabled={publishing}
              className={`w-full mt-1.5 flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm transition-all border disabled:opacity-40 ${
                summaryFlagged
                  ? "bg-muted/10 border-border/25 text-foreground"
                  : "bg-overlay-2 border-overlay-4 text-muted-foreground/40 hover:text-muted-foreground/70 hover:border-overlay-8"
              }`}
            >
              <Flag className="h-3 w-3" />
              {summaryFlagged ? "AI output flagged" : "Flag AI output"}
            </button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePublish(pendingDispo, pendingNextCallAt)}
            disabled={publishing}
            className="w-full mt-1 gap-1.5 text-xs text-muted-foreground/40 hover:text-muted-foreground/70"
          >
            Save without qual update
          </Button>
        </div>

      ) : !qualStep && pendingDispo && pendingMeta ? (
        /* ── Step 2: date capture for follow_up / appointment ── */
        <div>
          {/* Selected dispo display */}
          <div className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 mb-3 border ${pendingMeta.bg}`}>
            <pendingMeta.icon className={`h-4 w-4 ${pendingMeta.color}`} />
            <span className="text-sm font-medium">{pendingMeta.label}</span>
          </div>

          {/* Callback date input */}
          <label className="block text-sm text-muted-foreground/60 mb-1.5 px-0.5">
            Resurface date &amp; time <span className="opacity-50">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={callbackAt}
            onChange={(e) => setCallbackAt(e.target.value)}
            min={minDatetime}
            disabled={publishing}
            style={{ colorScheme: "dark" }}
            className="w-full rounded-[10px] border border-overlay-6 bg-overlay-3 px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/20 disabled:opacity-50 mb-3"
          />

          {/* Callback confirmation SMS opt-in */}
          {phoneNumber && callbackAt && (
            <label className="flex items-start gap-2 cursor-pointer rounded-[8px] border border-overlay-5 bg-white/[0.01] px-2.5 py-2 hover:bg-white/[0.025] transition-colors mb-3">
              <input
                type="checkbox"
                checked={sendConfirmSms}
                onChange={(e) => setSendConfirmSms(e.target.checked)}
                className="mt-0.5 h-3 w-3 rounded border-overlay-20 bg-overlay-3 accent-cyan"
              />
              <div>
                <p className="text-sm font-medium text-foreground/65">
                  Send confirmation SMS to seller
                </p>
                <p className="text-xs text-muted-foreground/30 leading-relaxed">
                  Brief message confirming the next touch date. Uses Dominion Homes caller ID.
                </p>
              </div>
            </label>
          )}

          {/* Resurface — date + note, follow-up/appointment path */}
          <div className={`mb-3 rounded-[10px] border p-2.5 space-y-1.5 ${
            !nextAction.trim()
              ? "border-amber-500/25 bg-amber-500/[0.04]"
              : "border-primary/10 bg-primary/[0.03]"
          }`}>
            <p className={`text-xs uppercase tracking-wider font-semibold ${!nextAction.trim() ? "text-amber-400" : "text-primary/60"}`}>
              {!nextAction.trim() ? "Resurface — Required" : "Resurface"}
            </p>
            {nextAction.trim() ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground/80">{nextAction}</span>
                <button onClick={() => { setNextAction(""); setNextActionDueAt(""); }} className="text-[10px] text-muted-foreground/40 hover:text-foreground/60">Change</button>
              </div>
            ) : (
              <QuickTaskSetter
                compact
                defaultType="callback"
                defaultWhen="in_3_days"
                onSave={(result) => {
                  setNextAction(result.title);
                  setNextActionDueAt(result.dueAt ? new Date(result.dueAt).toISOString() : "");
                }}
                onCancel={() => {}}
              />
            )}
          </div>

          {/* Note textarea — contextual prompt for follow-up/appointment path */}
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What was promised? Note any objections or things to clarify next call."
            maxLength={300}
            rows={2}
            disabled={publishing}
            className="w-full resize-none rounded-[10px] border border-overlay-6 bg-overlay-3 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/20 disabled:opacity-50 mb-2"
          />

          <Button
            onClick={handleConfirmPending}
            disabled={publishing}
            className="w-full gap-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/25 text-sm font-semibold"
          >
            {publishing && selected === pendingDispo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <pendingMeta.icon className="h-3.5 w-3.5" />
            )}
            Next: Confirm & Close Out
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePublish(pendingDispo)}
            disabled={publishing}
            className="w-full mt-1 gap-1.5 text-xs text-muted-foreground/40 hover:text-muted-foreground/70"
          >
            Save without callback or qual
          </Button>
        </div>

      ) : (
        /* ── Step 1: disposition grid ─────────────────────────── */
        <>
          <div className="grid grid-cols-1 gap-1.5 mb-2.5">
            {DISPO_OPTIONS.map((d) => {
              const Icon = d.icon;
              const isLoading = publishing && selected === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => handleDispoTap(d.key)}
                  disabled={publishing}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-all duration-150 border ${d.bg} disabled:opacity-50`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Icon className={`h-4 w-4 ${d.color}`} />
                  )}
                  <span className="text-sm font-medium flex-1">{d.label}</span>
                  {NEXT_STEP_DISPOS.has(d.key) && (
                    <span className="text-xs text-muted-foreground/30 uppercase tracking-wider">+ date</span>
                  )}
                  {!NEXT_STEP_DISPOS.has(d.key) && QUAL_CONFIRM_DISPOS.has(d.key) && (
                    <span className="text-xs text-muted-foreground/30 uppercase tracking-wider">+ qual</span>
                  )}
                </button>
              );
            })}
          </div>

          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Key points from this call…"
            maxLength={300}
            rows={2}
            disabled={publishing}
            className="w-full resize-none rounded-[10px] border border-overlay-6 bg-overlay-3 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/20 disabled:opacity-50"
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={publishing}
            className="w-full mt-1.5 gap-1.5 text-xs text-muted-foreground/40 hover:text-muted-foreground/70"
          >
            <SkipForward className="h-3 w-3" />
            Skip closeout (discard draft)
          </Button>
        </>
      )}
      </>
      )}
    </GlassCard>
  );
}
