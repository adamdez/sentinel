import { createServerClient } from "@/lib/supabase";

export const JEFF_OUTBOUND_POLICY_VERSION = "jeff-outbound-2026-03-30";
export const JEFF_CONTROLLER_EMAILS = new Set(
  (process.env.JEFF_CONTROLLER_EMAILS ?? "adam@dominionhomedeals.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export type JeffMode = "manual_only" | "hybrid_auto_redial";
export type JeffLaunchLane = "manual_priority" | "supervised_queue" | "auto_retry";
export type JeffQueueTier = "eligible" | "active" | "auto";
export type JeffQueueStatus = "active" | "paused" | "removed";

export interface JeffControlSettings {
  enabled: boolean;
  mode: JeffMode;
  softPaused: boolean;
  emergencyHalt: boolean;
  dailyMaxCalls: number;
  perRunMaxCalls: number;
  businessHoursOnly: boolean;
  allowedStartHour: number;
  allowedEndHour: number;
  qualityReviewEnabled: boolean;
  policyVersion: string;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface JeffQueueEntry {
  id: string;
  leadId: string;
  selectedPhone: string | null;
  queueTier: JeffQueueTier;
  queueStatus: JeffQueueStatus;
  approvedBy: string | null;
  approvedAt: string;
  lastVoiceSessionId: string | null;
  lastCallStatus: string | null;
  lastCalledAt: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
}

interface VoiceSessionLite {
  id: string;
  status: string | null;
  metadata?: Record<string, unknown> | null;
  transferred_to?: string | null;
  transfer_reason?: string | null;
  callback_requested?: boolean | null;
  duration_seconds?: number | null;
  cost_cents?: number | null;
  created_at?: string | null;
}

interface CallsLogLite {
  voice_session_id?: string | null;
  disposition?: string | null;
  duration_sec?: number | null;
}

interface JeffReviewLite {
  voice_session_id: string;
  score?: number | null;
  review_tags?: string[] | null;
}

export interface JeffRecentSessionLite {
  id: string;
  status: string | null;
  lead_id?: string | null;
  created_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  cost_cents?: number | null;
  transferred_to?: string | null;
  transfer_reason?: string | null;
  callback_requested?: boolean | null;
}

export interface JeffRecentLeadLite {
  id: string;
  properties?: {
    owner_name?: string | null;
    address?: string | null;
  } | null;
}

export interface JeffKpiSnapshot {
  attempts: number;
  liveAnswers: number;
  qualifiedConversations: number;
  qualifiedConversationRate: number;
  appointmentSignals: number;
  offerSignals: number;
  contractSignals: number;
  transferAttempts: number;
  successfulTransfers: number;
  callbackRequests: number;
  machineEnds: number;
  totalCostCents: number;
  averageDurationSec: number;
  costPerQualifiedConversationCents: number | null;
  costPerSuccessfulTransferCents: number | null;
  callbackRate: number;
  answerRate: number;
  qualityReviewPassRate: number | null;
}

export type JeffPolicySuggestionSeverity = "critical" | "high" | "medium";

export interface JeffPolicyTuningSuggestion {
  code: string;
  severity: JeffPolicySuggestionSeverity;
  title: string;
  message: string;
  action: string;
  signalCount: number;
  signalRate: number;
}

export interface JeffQualityTuningSummary {
  sampleSize: number;
  scoredSampleSize: number;
  passRate: number | null;
  suggestions: JeffPolicyTuningSuggestion[];
}

export function buildJeffRecentSessions(
  sessions: JeffRecentSessionLite[],
  leads: JeffRecentLeadLite[],
  limit = 8,
) {
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));

  return sessions.slice(0, limit).map((session) => {
    const lead = session.lead_id ? leadMap.get(session.lead_id) : null;
    return {
      id: session.id,
      leadId: session.lead_id ?? null,
      ownerName: lead?.properties?.owner_name ?? null,
      address: lead?.properties?.address ?? null,
      status: session.status ?? "unknown",
      createdAt: session.created_at ?? null,
      endedAt: session.ended_at ?? null,
      durationSeconds: session.duration_seconds ?? null,
      costCents: session.cost_cents ?? null,
      transferredTo: session.transferred_to ?? null,
      transferReason: session.transfer_reason ?? null,
      callbackRequested: Boolean(session.callback_requested),
    };
  });
}

const HUMAN_ANSWER_DISPOSITIONS = new Set([
  "answered",
  "interested",
  "follow_up",
  "appointment",
  "appointment_set",
  "offer_made",
  "callback",
  "completed",
  "contract",
  "contracted",
  "under_contract",
  "assigned",
  "closed",
  "not_interested",
]);

const MACHINE_DISPOSITIONS = new Set([
  "voicemail",
  "left_voicemail",
  "no_answer",
  "busy",
  "disconnected",
  "dead_phone",
  "wrong_number",
]);

const QUALIFIED_CONVERSATION_DISPOSITIONS = new Set([
  "interested",
  "follow_up",
  "appointment",
  "appointment_set",
  "offer_made",
  "contract",
  "contracted",
  "under_contract",
  "assigned",
  "closed",
]);

const APPOINTMENT_DISPOSITIONS = new Set([
  "appointment",
  "appointment_set",
]);

const OFFER_DISPOSITIONS = new Set([
  "offer",
  "offer_made",
]);

const CONTRACT_DISPOSITION_SIGNALS = new Set([
  "contract",
  "contracted",
  "under_contract",
  "assigned",
  "closed",
]);

function defaultJeffSettings(): JeffControlSettings {
  return {
    enabled: false,
    mode: "manual_only",
    softPaused: false,
    emergencyHalt: false,
    dailyMaxCalls: 120,
    perRunMaxCalls: 10,
    businessHoursOnly: true,
    allowedStartHour: 7,
    allowedEndHour: 20,
    qualityReviewEnabled: true,
    policyVersion: JEFF_OUTBOUND_POLICY_VERSION,
    notes: null,
    updatedBy: null,
    updatedAt: null,
    metadata: {},
  };
}

export function isJeffController(email: string | null | undefined): boolean {
  if (!email) return false;
  return JEFF_CONTROLLER_EMAILS.has(email.trim().toLowerCase());
}

export async function getUserProfile(userId: string) {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("user_profiles") as any)
    .select("id, email, role, full_name")
    .eq("id", userId)
    .maybeSingle();
  return data as { id: string; email: string | null; role: string | null; full_name?: string | null } | null;
}

export async function getJeffControlSettings(): Promise<JeffControlSettings> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("jeff_control_settings") as any)
    .select("*")
    .eq("control_key", "primary")
    .maybeSingle();

  if (!data) return defaultJeffSettings();

  return {
    enabled: Boolean(data.enabled),
    mode: (data.mode as JeffMode) ?? "manual_only",
    softPaused: Boolean(data.soft_paused),
    emergencyHalt: Boolean(data.emergency_halt),
    dailyMaxCalls: Number(data.daily_max_calls ?? 120),
    perRunMaxCalls: Number(data.per_run_max_calls ?? 10),
    businessHoursOnly: Boolean(data.business_hours_only),
    allowedStartHour: Number(data.allowed_start_hour ?? 7),
    allowedEndHour: Number(data.allowed_end_hour ?? 20),
    qualityReviewEnabled: Boolean(data.quality_review_enabled),
    policyVersion: (data.policy_version as string) ?? JEFF_OUTBOUND_POLICY_VERSION,
    notes: (data.notes as string | null) ?? null,
    updatedBy: (data.updated_by as string | null) ?? null,
    updatedAt: (data.updated_at as string | null) ?? null,
    metadata: (data.metadata as Record<string, unknown> | null) ?? {},
  };
}

export async function updateJeffControlSettings(
  patch: Partial<JeffControlSettings>,
  updatedBy: string,
): Promise<JeffControlSettings> {
  const sb = createServerClient();
  const next = {
    control_key: "primary",
    enabled: patch.enabled,
    mode: patch.mode,
    soft_paused: patch.softPaused,
    emergency_halt: patch.emergencyHalt,
    daily_max_calls: patch.dailyMaxCalls,
    per_run_max_calls: patch.perRunMaxCalls,
    business_hours_only: patch.businessHoursOnly,
    allowed_start_hour: patch.allowedStartHour,
    allowed_end_hour: patch.allowedEndHour,
    quality_review_enabled: patch.qualityReviewEnabled,
    policy_version: patch.policyVersion ?? JEFF_OUTBOUND_POLICY_VERSION,
    notes: patch.notes,
    metadata: patch.metadata,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("jeff_control_settings") as any)
    .upsert(next, { onConflict: "control_key" });

  return getJeffControlSettings();
}

export async function listJeffQueue(): Promise<Array<JeffQueueEntry & {
  lead?: {
    id: string;
    status: string | null;
    assigned_to: string | null;
    properties?: {
      owner_name?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
    } | null;
  } | null;
}>> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("jeff_queue_entries") as any)
    .select(`
      *,
      lead:leads (
        id,
        status,
        assigned_to,
        properties (
          owner_name,
          address,
          city,
          state
        )
      )
    `)
    .neq("queue_status", "removed")
    .order("approved_at", { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    leadId: String(row.lead_id),
    selectedPhone: (row.selected_phone as string | null) ?? null,
    queueTier: ((row.queue_tier as JeffQueueTier | null) ?? "eligible"),
    queueStatus: ((row.queue_status as JeffQueueStatus | null) ?? "active"),
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: String(row.approved_at),
    lastVoiceSessionId: (row.last_voice_session_id as string | null) ?? null,
    lastCallStatus: (row.last_call_status as string | null) ?? null,
    lastCalledAt: (row.last_called_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    lead: (row.lead as {
      id: string;
      status: string | null;
      assigned_to: string | null;
      properties?: {
        owner_name?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
      } | null;
    } | null) ?? null,
  }));
}

export async function upsertJeffQueueEntries(
  leadIds: string[],
  approvedBy: string,
  patch?: Partial<Pick<JeffQueueEntry, "queueTier" | "queueStatus" | "selectedPhone" | "notes">>,
) {
  const sb = createServerClient();
  const now = new Date().toISOString();
  const rows = leadIds.map((leadId) => ({
    lead_id: leadId,
    queue_tier: patch?.queueTier ?? "active",
    queue_status: patch?.queueStatus ?? "active",
    selected_phone: patch?.selectedPhone ?? null,
    notes: patch?.notes ?? null,
    approved_by: approvedBy,
    approved_at: now,
    updated_at: now,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("jeff_queue_entries") as any)
    .upsert(rows, { onConflict: "lead_id" });

  return listJeffQueue();
}

export async function updateJeffQueueEntry(
  leadId: string,
  patch: Partial<Pick<JeffQueueEntry, "queueTier" | "queueStatus" | "selectedPhone" | "notes" | "lastVoiceSessionId" | "lastCallStatus" | "lastCalledAt">>,
) {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("jeff_queue_entries") as any)
    .update({
      ...(patch.queueTier != null ? { queue_tier: patch.queueTier } : {}),
      ...(patch.queueStatus != null ? { queue_status: patch.queueStatus } : {}),
      ...(patch.selectedPhone !== undefined ? { selected_phone: patch.selectedPhone } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.lastVoiceSessionId !== undefined ? { last_voice_session_id: patch.lastVoiceSessionId } : {}),
      ...(patch.lastCallStatus !== undefined ? { last_call_status: patch.lastCallStatus } : {}),
      ...(patch.lastCalledAt !== undefined ? { last_called_at: patch.lastCalledAt } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("lead_id", leadId);
}

export async function getJeffQueueEntry(leadId: string): Promise<JeffQueueEntry | null> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("jeff_queue_entries") as any)
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    leadId: String(data.lead_id),
    selectedPhone: (data.selected_phone as string | null) ?? null,
    queueTier: ((data.queue_tier as JeffQueueTier | null) ?? "eligible"),
    queueStatus: ((data.queue_status as JeffQueueStatus | null) ?? "active"),
    approvedBy: (data.approved_by as string | null) ?? null,
    approvedAt: String(data.approved_at),
    lastVoiceSessionId: (data.last_voice_session_id as string | null) ?? null,
    lastCallStatus: (data.last_call_status as string | null) ?? null,
    lastCalledAt: (data.last_called_at as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    metadata: (data.metadata as Record<string, unknown> | null) ?? {},
  };
}

export interface JeffLaunchGateResult {
  allowed: boolean;
  reason?: string;
  settings: JeffControlSettings;
}

export function isJeffManualQueueEntry(entry: JeffQueueEntry | null | undefined): boolean {
  if (!entry) return false;
  if (entry.queueStatus !== "active") return false;
  return entry.queueTier === "eligible" || entry.queueTier === "active" || entry.queueTier === "auto";
}

export function isJeffCallableQueueEntry(entry: JeffQueueEntry | null | undefined): boolean {
  if (!entry) return false;
  if (entry.queueStatus !== "active") return false;
  return entry.queueTier === "active" || entry.queueTier === "auto";
}

export async function getJeffLaunchGate(
  lane: JeffLaunchLane,
  options?: { leadId?: string; isBusinessHoursOpen?: boolean; nextOpenTime?: string },
): Promise<JeffLaunchGateResult> {
  const settings = await getJeffControlSettings();

  if (!settings.enabled) {
    return { allowed: false, reason: "Jeff is disabled.", settings };
  }
  if (settings.emergencyHalt) {
    return { allowed: false, reason: "Jeff emergency halt is active.", settings };
  }
  if (settings.softPaused) {
    return { allowed: false, reason: "Jeff is paused. No new calls may start.", settings };
  }
  if (lane === "auto_retry" && settings.mode !== "hybrid_auto_redial") {
    return { allowed: false, reason: "Jeff auto-retry is disabled in manual-only mode.", settings };
  }
  if (settings.businessHoursOnly && options?.isBusinessHoursOpen === false) {
    return { allowed: false, reason: `Outside Jeff business hours. Next open: ${options.nextOpenTime ?? "next window"}`, settings };
  }

  if (lane !== "manual_priority" && options?.leadId) {
    const entry = await getJeffQueueEntry(options.leadId);
    if (!entry || entry.queueStatus !== "active") {
      return { allowed: false, reason: "Lead is not active in Jeff queue.", settings };
    }
    if (lane === "supervised_queue" && !["active", "auto"].includes(entry.queueTier)) {
      return { allowed: false, reason: "Lead is not approved for Jeff supervised queue.", settings };
    }
    if (lane === "auto_retry" && entry.queueTier !== "auto") {
      return { allowed: false, reason: "Lead is not approved for Jeff automated retry.", settings };
    }
  }

  const today = new Date();
  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = await (sb.from("voice_sessions") as any)
    .select("id, metadata")
    .eq("direction", "outbound")
    .gte("created_at", since);

  const jeffCallsToday = (sessions ?? []).filter((row: Record<string, unknown>) => {
    const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
    const source = typeof metadata.source === "string" ? metadata.source : "";
    return source.startsWith("jeff-");
  }).length;

  if (jeffCallsToday >= settings.dailyMaxCalls) {
    return {
      allowed: false,
      reason: `Jeff daily cap reached (${jeffCallsToday}/${settings.dailyMaxCalls}).`,
      settings,
    };
  }

  return { allowed: true, settings };
}

export function computeJeffKpis(
  sessions: VoiceSessionLite[],
  callLogs: CallsLogLite[],
  reviews: JeffReviewLite[],
): JeffKpiSnapshot {
  const dispositionBySession = new Map(
    callLogs.map((row) => [row.voice_session_id ?? "", (row.disposition ?? "").toLowerCase()]),
  );

  let liveAnswers = 0;
  let qualifiedConversations = 0;
  let appointmentSignals = 0;
  let offerSignals = 0;
  let contractSignals = 0;
  let transferAttempts = 0;
  let successfulTransfers = 0;
  let callbackRequests = 0;
  let machineEnds = 0;
  let totalCostCents = 0;
  let totalDurationSec = 0;

  for (const session of sessions) {
    const disposition = dispositionBySession.get(session.id) ?? "";
    const duration = Number(session.duration_seconds ?? 0);
    const cost = Number(session.cost_cents ?? 0);
    const didTransfer = Boolean(session.transferred_to) || Boolean(session.transfer_reason) || session.status === "transferred";
    const didCallback = Boolean(session.callback_requested);
    const isQualifiedDisposition = QUALIFIED_CONVERSATION_DISPOSITIONS.has(disposition);
    const isQualifiedSession = didTransfer || didCallback || isQualifiedDisposition;

    totalDurationSec += duration;
    totalCostCents += cost;

    if (isQualifiedSession) {
      qualifiedConversations += 1;
    }

    if (APPOINTMENT_DISPOSITIONS.has(disposition)) {
      appointmentSignals += 1;
    }

    if (OFFER_DISPOSITIONS.has(disposition)) {
      offerSignals += 1;
    }

    if (CONTRACT_DISPOSITION_SIGNALS.has(disposition)) {
      contractSignals += 1;
    }

    if (didTransfer) {
      transferAttempts += 1;
      successfulTransfers += 1;
      liveAnswers += 1;
      continue;
    }

    if (didCallback) {
      callbackRequests += 1;
      liveAnswers += 1;
      continue;
    }

    if (HUMAN_ANSWER_DISPOSITIONS.has(disposition)) {
      liveAnswers += 1;
      continue;
    }

    if (MACHINE_DISPOSITIONS.has(disposition) || duration <= 20) {
      machineEnds += 1;
    }
  }

  const passedReviews = reviews.filter((review) => Number(review.score ?? 0) >= 4).length;
  const qualityReviewPassRate = reviews.length > 0 ? passedReviews / reviews.length : null;

  return {
    attempts: sessions.length,
    liveAnswers,
    qualifiedConversations,
    qualifiedConversationRate: sessions.length > 0 ? qualifiedConversations / sessions.length : 0,
    appointmentSignals,
    offerSignals,
    contractSignals,
    transferAttempts,
    successfulTransfers,
    callbackRequests,
    machineEnds,
    totalCostCents,
    averageDurationSec: sessions.length > 0 ? Math.round(totalDurationSec / sessions.length) : 0,
    costPerQualifiedConversationCents: qualifiedConversations > 0 ? Math.round(totalCostCents / qualifiedConversations) : null,
    costPerSuccessfulTransferCents: successfulTransfers > 0 ? Math.round(totalCostCents / successfulTransfers) : null,
    callbackRate: sessions.length > 0 ? callbackRequests / sessions.length : 0,
    answerRate: sessions.length > 0 ? liveAnswers / sessions.length : 0,
    qualityReviewPassRate,
  };
}

export async function getJeffKpis(fromIso?: string | null, toIso?: string | null) {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessionQuery = (sb.from("voice_sessions") as any)
    .select("id, status, metadata, transferred_to, transfer_reason, callback_requested, duration_seconds, cost_cents, created_at")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false });

  if (fromIso) sessionQuery = sessionQuery.gte("created_at", fromIso);
  if (toIso) sessionQuery = sessionQuery.lte("created_at", toIso);

  const { data: sessionsRaw } = await sessionQuery;
  const sessions = ((sessionsRaw ?? []) as VoiceSessionLite[]).filter((session) => {
    const metadata = (session.metadata as Record<string, unknown> | null) ?? {};
    const source = typeof metadata.source === "string" ? metadata.source : "";
    return source.startsWith("jeff-");
  });

  const sessionIds = sessions.map((session) => session.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callLogs } = sessionIds.length > 0
    ? await (sb.from("calls_log") as any)
      .select("voice_session_id, disposition, duration_sec")
      .in("voice_session_id", sessionIds)
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reviews } = sessionIds.length > 0
    ? await (sb.from("jeff_quality_reviews") as any)
      .select("voice_session_id, score")
      .in("voice_session_id", sessionIds)
    : { data: [] };

  return {
    from: fromIso,
    to: toIso,
    kpis: computeJeffKpis(
      sessions,
      (callLogs ?? []) as CallsLogLite[],
      (reviews ?? []) as JeffReviewLite[],
    ),
  };
}

export async function listJeffReviews(limit = 50) {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("jeff_quality_reviews") as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

function normalizeReviewTags(review: Record<string, unknown>): string[] {
  const rawTags = Array.isArray(review.review_tags)
    ? review.review_tags
    : Array.isArray(review.reviewTags)
      ? review.reviewTags
      : [];
  return rawTags
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean);
}

function severityFromRate(rate: number, highThreshold = 0.25, criticalThreshold = 0.45): JeffPolicySuggestionSeverity {
  if (rate >= criticalThreshold) return "critical";
  if (rate >= highThreshold) return "high";
  return "medium";
}

function compareSuggestionPriority(a: JeffPolicyTuningSuggestion, b: JeffPolicyTuningSuggestion) {
  const order: Record<JeffPolicySuggestionSeverity, number> = { critical: 3, high: 2, medium: 1 };
  if (order[a.severity] !== order[b.severity]) {
    return order[b.severity] - order[a.severity];
  }
  if (a.signalCount !== b.signalCount) {
    return b.signalCount - a.signalCount;
  }
  if (a.signalRate !== b.signalRate) {
    return b.signalRate - a.signalRate;
  }
  return a.title.localeCompare(b.title);
}

export function buildJeffQualityTuningSummary(
  reviews: Array<Record<string, unknown>>,
  options?: { maxSuggestions?: number },
): JeffQualityTuningSummary {
  const sampleSize = reviews.length;
  const maxSuggestions = Math.max(1, Math.min(options?.maxSuggestions ?? 4, 8));

  const scored = reviews.filter((review) => typeof review.score === "number");
  const passCount = scored.filter((review) => Number(review.score) >= 4).length;
  const passRate = scored.length > 0 ? passCount / scored.length : null;

  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      scoredSampleSize: 0,
      passRate: null,
      suggestions: [],
    };
  }

  const reviewTagSets = reviews.map((review) => new Set(normalizeReviewTags(review)));
  const countTag = (tag: string) => reviewTagSets.reduce((count, tags) => count + (tags.has(tag) ? 1 : 0), 0);
  const suggestions: JeffPolicyTuningSuggestion[] = [];
  const suggestionCodes = new Set<string>();

  const pushSuggestion = (next: JeffPolicyTuningSuggestion) => {
    if (suggestionCodes.has(next.code)) return;
    suggestions.push(next);
    suggestionCodes.add(next.code);
  };

  if (sampleSize >= 4) {
    const weakOpeners = countTag("weak opener");
    if (weakOpeners >= 2) {
      const rate = weakOpeners / sampleSize;
      pushSuggestion({
        code: "weak_openers",
        severity: severityFromRate(rate, 0.25, 0.5),
        title: "Openers are missing early trust",
        message: `${weakOpeners} of ${sampleSize} reviewed calls were tagged "weak opener".`,
        action: "Tighten opener policy: permission-based opener first, then one short situation question before deeper discovery.",
        signalCount: weakOpeners,
        signalRate: Number(rate.toFixed(2)),
      });
    }

    const transferredEarly = countTag("transferred too early");
    const transferredLate = countTag("transferred too late");
    if (transferredEarly >= 2 || transferredLate >= 2) {
      const dominant = transferredEarly >= transferredLate ? transferredEarly : transferredLate;
      const rate = dominant / sampleSize;
      if (Math.abs(transferredEarly - transferredLate) <= 1 && transferredEarly >= 2 && transferredLate >= 2) {
        pushSuggestion({
          code: "transfer_timing_inconsistent",
          severity: severityFromRate(rate, 0.3, 0.5),
          title: "Transfer timing is inconsistent",
          message: `${transferredEarly} early-transfer and ${transferredLate} late-transfer tags suggest inconsistent handoff timing.`,
          action: "Refine transfer triggers with a strict threshold: transfer only after motive + timeline + willingness signal are clear.",
          signalCount: transferredEarly + transferredLate,
          signalRate: Number(((transferredEarly + transferredLate) / sampleSize).toFixed(2)),
        });
      } else if (transferredEarly > transferredLate) {
        pushSuggestion({
          code: "transfer_too_early",
          severity: severityFromRate(rate, 0.25, 0.45),
          title: "Jeff is transferring too early",
          message: `${transferredEarly} of ${sampleSize} reviewed calls flagged early transfer.`,
          action: "Raise the transfer bar so Jeff confirms motivation and callback fallback before handoff.",
          signalCount: transferredEarly,
          signalRate: Number((transferredEarly / sampleSize).toFixed(2)),
        });
      } else {
        pushSuggestion({
          code: "transfer_too_late",
          severity: severityFromRate(rate, 0.25, 0.45),
          title: "Jeff is transferring too late",
          message: `${transferredLate} of ${sampleSize} reviewed calls flagged late transfer.`,
          action: "Trigger handoff earlier when seller intent is clear instead of running extended AI discovery.",
          signalCount: transferredLate,
          signalRate: Number((transferredLate / sampleSize).toFixed(2)),
        });
      }
    }

    const awkwardLabels = countTag("awkward label");
    const goodLabels = countTag("good label");
    if (awkwardLabels >= 2 && awkwardLabels >= goodLabels) {
      const rate = awkwardLabels / sampleSize;
      pushSuggestion({
        code: "labeling_quality",
        severity: severityFromRate(rate, 0.2, 0.4),
        title: "Labeling sounds unnatural",
        message: `${awkwardLabels} awkward-label tags vs ${goodLabels} good-label tags in reviewed calls.`,
        action: "Reduce label frequency to one concise label at emotional pivots; avoid stacked labels or over-mirroring.",
        signalCount: awkwardLabels,
        signalRate: Number(rate.toFixed(2)),
      });
    }

    const callbackMiss = countTag("missed callback opportunity");
    const callbackCaptured = countTag("callback captured well");
    if (callbackMiss >= 2 && callbackMiss >= callbackCaptured) {
      const rate = callbackMiss / sampleSize;
      pushSuggestion({
        code: "callback_capture",
        severity: severityFromRate(rate, 0.2, 0.35),
        title: "Callback capture quality is weak",
        message: `${callbackMiss} callback misses were tagged, versus ${callbackCaptured} captured-well tags.`,
        action: "Require callback commitment capture: exact day window, preferred number confirmation, and explicit next step summary.",
        signalCount: callbackMiss,
        signalRate: Number(rate.toFixed(2)),
      });
    }

    const robotic = countTag("too robotic");
    const pushy = countTag("too pushy");
    const toneIssues = reviewTagSets.reduce((count, tags) => count + ((tags.has("too robotic") || tags.has("too pushy")) ? 1 : 0), 0);
    if (toneIssues >= 2) {
      const rate = toneIssues / sampleSize;
      pushSuggestion({
        code: "tone_naturalness",
        severity: severityFromRate(rate, 0.25, 0.45),
        title: "Jeff tone is too scripted or pushy",
        message: `${toneIssues} reviewed calls flagged tone issues (${robotic} robotic, ${pushy} pushy).`,
        action: "Shorten scripted blocks and move to one-question pacing with more direct acknowledgment statements.",
        signalCount: toneIssues,
        signalRate: Number(rate.toFixed(2)),
      });
    }

    const wrongTarget = countTag("wrong target");
    if (wrongTarget >= 2) {
      const rate = wrongTarget / sampleSize;
      pushSuggestion({
        code: "targeting_hygiene",
        severity: severityFromRate(rate, 0.2, 0.35),
        title: "Queue targeting needs cleanup",
        message: `${wrongTarget} reviewed calls were tagged "wrong target".`,
        action: "Tighten queue eligibility and suppression rules so Jeff spends capacity on verified owner contacts.",
        signalCount: wrongTarget,
        signalRate: Number(rate.toFixed(2)),
      });
    }
  }

  if (passRate != null && scored.length >= 4 && passRate < 0.75) {
    const severity: JeffPolicySuggestionSeverity = passRate < 0.5 ? "critical" : "high";
    pushSuggestion({
      code: "review_pass_rate",
      severity,
      title: "Quality pass rate is below target",
      message: `${passCount} of ${scored.length} scored reviews passed (4/5+).`,
      action: "Hold policy version steady and prioritize fixing top quality failure tags before increasing Jeff call volume.",
      signalCount: scored.length - passCount,
      signalRate: Number((1 - passRate).toFixed(2)),
    });
  }

  suggestions.sort(compareSuggestionPriority);

  return {
    sampleSize,
    scoredSampleSize: scored.length,
    passRate: passRate != null ? Number(passRate.toFixed(2)) : null,
    suggestions: suggestions.slice(0, maxSuggestions),
  };
}

export async function upsertJeffReview(input: {
  voiceSessionId: string;
  reviewerId: string;
  reviewTags: string[];
  score?: number | null;
  notes?: string | null;
  policyVersion?: string;
}) {
  const sb = createServerClient();
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("jeff_quality_reviews") as any)
    .upsert({
      voice_session_id: input.voiceSessionId,
      reviewer_id: input.reviewerId,
      review_tags: input.reviewTags,
      score: input.score ?? null,
      notes: input.notes ?? null,
      policy_version: input.policyVersion ?? JEFF_OUTBOUND_POLICY_VERSION,
      updated_at: now,
    }, { onConflict: "voice_session_id,reviewer_id" });
  return listJeffReviews(50);
}
