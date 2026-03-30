import { createServerClient } from "@/lib/supabase";
import { JEFF_OUTBOUND_POLICY_VERSION } from "@/lib/jeff-control";
import { getActiveHandoffRule } from "@/lib/voice-registry";
import { syncTaskToLead } from "@/lib/task-lead-sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type JeffInteractionType =
  | "warm_transfer"
  | "callback_request"
  | "follow_up_needed"
  | "transfer_failed"
  | "fyi_only";

export type JeffInteractionStatus =
  | "needs_review"
  | "task_open"
  | "reviewed"
  | "resolved";

export interface JeffInteractionRecord {
  id: string;
  voice_session_id: string;
  lead_id: string | null;
  calls_log_id: string | null;
  interaction_type: JeffInteractionType;
  status: JeffInteractionStatus;
  summary: string | null;
  callback_requested: boolean;
  callback_due_at: string | null;
  callback_timing_text: string | null;
  transfer_outcome: string | null;
  assigned_to: string | null;
  task_id: string | null;
  policy_version: string;
  metadata: Record<string, unknown>;
  reviewed_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JeffInteractionListItem extends JeffInteractionRecord {
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
  task?: {
    id: string;
    title: string | null;
    status: string | null;
    due_at: string | null;
    task_type: string | null;
  } | null;
}

const HUMAN_FOLLOW_UP_DISPOSITIONS = new Set([
  "answered",
  "interested",
  "follow_up",
  "appointment",
  "appointment_set",
  "offer_made",
  "callback",
  "completed",
  "contract",
]);

function normalizeRow(row: Record<string, unknown>): JeffInteractionListItem {
  return {
    id: String(row.id),
    voice_session_id: String(row.voice_session_id),
    lead_id: (row.lead_id as string | null) ?? null,
    calls_log_id: (row.calls_log_id as string | null) ?? null,
    interaction_type: ((row.interaction_type as JeffInteractionType | null) ?? "fyi_only"),
    status: ((row.status as JeffInteractionStatus | null) ?? "needs_review"),
    summary: (row.summary as string | null) ?? null,
    callback_requested: Boolean(row.callback_requested),
    callback_due_at: (row.callback_due_at as string | null) ?? null,
    callback_timing_text: (row.callback_timing_text as string | null) ?? null,
    transfer_outcome: (row.transfer_outcome as string | null) ?? null,
    assigned_to: (row.assigned_to as string | null) ?? null,
    task_id: (row.task_id as string | null) ?? null,
    policy_version: (row.policy_version as string) ?? JEFF_OUTBOUND_POLICY_VERSION,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    resolved_at: (row.resolved_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    lead: (row.lead as JeffInteractionListItem["lead"]) ?? null,
    task: (row.task as JeffInteractionListItem["task"]) ?? null,
  };
}

function isParsableDate(value: string | null | undefined): boolean {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

async function inferCallbackDueAt(callbackTimingText: string | null | undefined): Promise<string | null> {
  if (isParsableDate(callbackTimingText ?? null)) {
    return new Date(String(callbackTimingText)).toISOString();
  }

  const handoffRule = await getActiveHandoffRule();
  const hoursAhead = Math.max(1, Number(handoffRule.rule_config.callback_default_hours_ahead ?? 24));
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
}

async function getPreferredJeffAssigneeId(sb: SupabaseClient, leadId: string | null): Promise<string | null> {
  if (leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("assigned_to")
      .eq("id", leadId)
      .maybeSingle();
    if (lead?.assigned_to) {
      return lead.assigned_to as string;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles } = await (sb.from("user_profiles") as any)
    .select("id, email")
    .in("email", ["logan@dominionhomedeals.com", "adam@dominionhomedeals.com"]);

  const ordered = (profiles ?? []) as Array<{ id: string; email: string | null }>;
  const logan = ordered.find((profile) => profile.email?.toLowerCase() === "logan@dominionhomedeals.com");
  if (logan?.id) return logan.id;
  const adam = ordered.find((profile) => profile.email?.toLowerCase() === "adam@dominionhomedeals.com");
  return adam?.id ?? null;
}

function buildJeffTaskShape(interaction: JeffInteractionRecord) {
  const isCallback = interaction.interaction_type === "callback_request" || interaction.interaction_type === "transfer_failed";
  const prefix = isCallback ? "Jeff callback" : "Jeff follow-up";
  const detail = interaction.summary?.trim() ? interaction.summary.trim() : "AI-captured Jeff seller conversation";

  return {
    title: prefix,
    description: detail,
    notes: detail,
    due_at: interaction.callback_due_at,
    task_type: isCallback ? "callback" : "follow_up",
  };
}

export function deriveJeffInteractionDecision(input: {
  direction: string | null;
  leadId: string | null;
  callerType: string | null;
  disposition: string;
  callbackRequested: boolean;
  callbackTime: string | null;
  wasTransferred: boolean;
  transferTarget: string | null;
  summary: string | null;
}) {
  if (input.direction !== "outbound" || !input.leadId) {
    return { shouldTrack: false as const };
  }

  const isSellerOrUnknown =
    !input.callerType ||
    input.callerType === "seller" ||
    input.callerType === "unknown";

  if (!isSellerOrUnknown) {
    return { shouldTrack: false as const };
  }

  if (input.wasTransferred) {
    return {
      shouldTrack: true as const,
      interactionType: "warm_transfer" as JeffInteractionType,
      transferOutcome: "warm_transfer_succeeded",
      shouldCreateTask: false,
      status: "needs_review" as JeffInteractionStatus,
    };
  }

  const attemptedTransfer = Boolean(input.transferTarget);
  if (attemptedTransfer) {
    return {
      shouldTrack: true as const,
      interactionType: "transfer_failed" as JeffInteractionType,
      transferOutcome: "warm_transfer_failed",
      shouldCreateTask: true,
      status: "task_open" as JeffInteractionStatus,
    };
  }

  if (input.callbackRequested) {
    return {
      shouldTrack: true as const,
      interactionType: "callback_request" as JeffInteractionType,
      transferOutcome: "callback_requested",
      shouldCreateTask: true,
      status: "task_open" as JeffInteractionStatus,
    };
  }

  if (HUMAN_FOLLOW_UP_DISPOSITIONS.has((input.disposition ?? "").toLowerCase())) {
    return {
      shouldTrack: true as const,
      interactionType: "follow_up_needed" as JeffInteractionType,
      transferOutcome: "human_answered_no_transfer",
      shouldCreateTask: true,
      status: "task_open" as JeffInteractionStatus,
    };
  }

  return { shouldTrack: false as const };
}

export async function upsertJeffInteraction(input: {
  voiceSessionId: string;
  leadId: string | null;
  callsLogId: string | null;
  interactionType: JeffInteractionType;
  status: JeffInteractionStatus;
  summary: string | null;
  callbackRequested: boolean;
  callbackDueAt: string | null;
  callbackTimingText: string | null;
  transferOutcome: string | null;
  assignedTo: string | null;
  policyVersion?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const sb = createServerClient();
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("jeff_interactions") as any)
    .upsert({
      voice_session_id: input.voiceSessionId,
      lead_id: input.leadId,
      calls_log_id: input.callsLogId,
      interaction_type: input.interactionType,
      status: input.status,
      summary: input.summary,
      callback_requested: input.callbackRequested,
      callback_due_at: input.callbackDueAt,
      callback_timing_text: input.callbackTimingText,
      transfer_outcome: input.transferOutcome,
      assigned_to: input.assignedTo,
      policy_version: input.policyVersion ?? JEFF_OUTBOUND_POLICY_VERSION,
      metadata: input.metadata ?? {},
      reviewed_at: input.status === "reviewed" ? now : null,
      resolved_at: input.status === "resolved" ? now : null,
      updated_at: now,
    }, { onConflict: "voice_session_id" });

  return getJeffInteractionByVoiceSessionId(input.voiceSessionId);
}

export async function getJeffInteractionByVoiceSessionId(voiceSessionId: string): Promise<JeffInteractionRecord | null> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("jeff_interactions") as any)
    .select("*")
    .eq("voice_session_id", voiceSessionId)
    .maybeSingle();

  if (!data) return null;
  return normalizeRow(data);
}

export async function getJeffInteractionById(id: string): Promise<JeffInteractionRecord | null> {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("jeff_interactions") as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  return normalizeRow(data);
}

export async function listJeffInteractions(options?: {
  leadId?: string | null;
  unresolvedOnly?: boolean;
  limit?: number;
}) {
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("jeff_interactions") as any)
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
    .order("created_at", { ascending: false });

  if (options?.leadId) {
    query = query.eq("lead_id", options.leadId);
  }

  if (options?.unresolvedOnly) {
    query = query.neq("status", "resolved");
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data } = await query;
  const rows = ((data ?? []) as Array<Record<string, unknown>>);

  const taskIds = rows
    .map((row) => row.task_id as string | null)
    .filter((taskId): taskId is string => typeof taskId === "string" && taskId.length > 0);

  let taskMap = new Map<string, JeffInteractionListItem["task"]>();
  if (taskIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tasks } = await (sb.from("tasks") as any)
      .select("id, title, status, due_at, task_type")
      .in("id", taskIds);
    taskMap = new Map(
      ((tasks ?? []) as Array<Record<string, unknown>>).map((task) => [
        String(task.id),
        {
          id: String(task.id),
          title: (task.title as string | null) ?? null,
          status: (task.status as string | null) ?? null,
          due_at: (task.due_at as string | null) ?? null,
          task_type: (task.task_type as string | null) ?? null,
        },
      ]),
    );
  }

  return rows.map((row) => ({
    ...normalizeRow(row),
    task: taskMap.get(String(row.task_id)) ?? null,
  }));
}

export async function updateJeffInteraction(id: string, patch: Partial<{
  status: JeffInteractionStatus;
  taskId: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
}>) {
  const sb = createServerClient();
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("jeff_interactions") as any)
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.taskId !== undefined ? { task_id: patch.taskId } : {}),
      ...(patch.reviewedAt !== undefined ? { reviewed_at: patch.reviewedAt } : {}),
      ...(patch.resolvedAt !== undefined ? { resolved_at: patch.resolvedAt } : {}),
      updated_at: now,
    })
    .eq("id", id);
}

export async function syncJeffTaskForInteraction(interaction: JeffInteractionRecord) {
  const sb = createServerClient();
  const assigneeId = await getPreferredJeffAssigneeId(sb, interaction.lead_id);
  if (!assigneeId || !interaction.lead_id) {
    await updateJeffInteraction(interaction.id, {
      status: "needs_review",
      taskId: null,
    });
    return null;
  }

  const taskShape = buildJeffTaskShape(interaction);
  const sourceType = "jeff_interaction";
  const sourceKey = interaction.voice_session_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("tasks") as any)
    .select("id, status")
    .eq("source_type", sourceType)
    .eq("source_key", sourceKey)
    .maybeSingle();

  const now = new Date().toISOString();
  let taskId: string | null = null;

  if (existing?.id) {
    taskId = existing.id as string;
    if (existing.status === "completed") {
      await updateJeffInteraction(interaction.id, {
        status: "resolved",
        taskId,
        resolvedAt: now,
      });
      return taskId;
    }

    if (existing.status !== "completed") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("tasks") as any)
        .update({
          title: taskShape.title,
          description: taskShape.description,
          notes: taskShape.notes,
          due_at: taskShape.due_at,
          task_type: taskShape.task_type,
          assigned_to: assigneeId,
          voice_session_id: interaction.voice_session_id,
          jeff_interaction_id: interaction.id,
          updated_at: now,
        })
        .eq("id", taskId);
      await syncTaskToLead(sb, interaction.lead_id, taskShape.title, taskShape.due_at);
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted } = await (sb.from("tasks") as any)
      .insert({
        title: taskShape.title,
        description: taskShape.description,
        assigned_to: assigneeId,
        lead_id: interaction.lead_id,
        due_at: taskShape.due_at,
        priority: 2,
        task_type: taskShape.task_type,
        status: "pending",
        notes: taskShape.notes,
        source_type: sourceType,
        source_key: sourceKey,
        voice_session_id: interaction.voice_session_id,
        jeff_interaction_id: interaction.id,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    taskId = inserted?.id ?? null;
    if (taskId) {
      await syncTaskToLead(sb, interaction.lead_id, taskShape.title, taskShape.due_at);
    }
  }

  if (taskId) {
    await updateJeffInteraction(interaction.id, { status: "task_open", taskId });
  }

  return taskId;
}

export async function syncJeffInteractionFromCompletedCall(input: {
  voiceSessionId: string;
  leadId: string | null;
  callsLogId: string | null;
  direction: string | null;
  callerType: string | null;
  disposition: string;
  callbackRequested: boolean;
  callbackTime: string | null;
  wasTransferred: boolean;
  transferTarget: string | null;
  summary: string | null;
  policyVersion?: string | null;
}) {
  const decision = deriveJeffInteractionDecision(input);
  if (!decision.shouldTrack) {
    return null;
  }

  const callbackDueAt = decision.shouldCreateTask
    ? await inferCallbackDueAt(input.callbackTime)
    : null;

  const interaction = await upsertJeffInteraction({
    voiceSessionId: input.voiceSessionId,
    leadId: input.leadId,
    callsLogId: input.callsLogId,
    interactionType: decision.interactionType,
    status: decision.status,
    summary: input.summary,
    callbackRequested: input.callbackRequested,
    callbackDueAt,
    callbackTimingText: input.callbackTime,
    transferOutcome: decision.transferOutcome,
    assignedTo: null,
    policyVersion: input.policyVersion ?? JEFF_OUTBOUND_POLICY_VERSION,
    metadata: {
      disposition: input.disposition,
      wasTransferred: input.wasTransferred,
      transferTarget: input.transferTarget,
      callerType: input.callerType,
    },
  });

  if (!interaction) {
    return null;
  }

  if (decision.shouldCreateTask) {
    await syncJeffTaskForInteraction(interaction);
    return getJeffInteractionByVoiceSessionId(input.voiceSessionId);
  }

  return interaction;
}

export async function syncJeffInteractionStatusFromTask(
  taskId: string,
  taskStatus: string,
  onDelete = false,
  interactionId?: string | null,
) {
  const now = new Date().toISOString();
  let linkedInteractionId = interactionId ?? null;

  if (!linkedInteractionId) {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: task } = await (sb.from("tasks") as any)
      .select("jeff_interaction_id")
      .eq("id", taskId)
      .maybeSingle();

    linkedInteractionId = (task?.jeff_interaction_id as string | null) ?? null;
  }

  if (!linkedInteractionId) {
    return;
  }

  if (onDelete) {
    await updateJeffInteraction(String(linkedInteractionId), {
      status: "needs_review",
      taskId: null,
      resolvedAt: null,
    });
    return;
  }

  if (taskStatus === "completed") {
    await updateJeffInteraction(String(linkedInteractionId), {
      status: "resolved",
      resolvedAt: now,
    });
    return;
  }

  if (taskStatus === "pending" || taskStatus === "in_progress") {
    await updateJeffInteraction(String(linkedInteractionId), {
      status: "task_open",
      reviewedAt: null,
      resolvedAt: null,
    });
  }
}
