/**
 * Task-first lead follow-up helpers.
 *
 * Tasks are the only writable follow-up system for normal operator work.
 * leads.next_action and related fields are a compatibility projection of the
 * lead's primary pending call-driving task.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export const CALL_TASK_TYPES = new Set(["callback", "call_back", "follow_up", "drive_by"]);
export const CALLBACK_TASK_TYPES = new Set(["callback", "call_back", "follow_up"]);

type LeadTaskRow = {
  id: string;
  title: string | null;
  due_at: string | null;
  task_type: string | null;
  status: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  priority?: number | null;
  notes?: string | null;
  source_type?: string | null;
  source_key?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type LeadTaskCounts = {
  openTaskCount: number;
  openCallTaskCount: number;
  primaryTaskId: string | null;
};

function normalizeTaskType(taskType: string | null | undefined): string | null {
  if (typeof taskType !== "string") return null;
  const normalized = taskType.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isCallDrivingTaskType(taskType: string | null | undefined): boolean {
  const normalized = normalizeTaskType(taskType);
  return normalized != null && CALL_TASK_TYPES.has(normalized);
}

export function isDialerCallbackTaskType(taskType: string | null | undefined): boolean {
  const normalized = normalizeTaskType(taskType);
  return normalized != null && CALLBACK_TASK_TYPES.has(normalized);
}

function compareIsoAscending(a: string | null | undefined, b: string | null | undefined): number {
  const aMs = a ? new Date(a).getTime() : Number.POSITIVE_INFINITY;
  const bMs = b ? new Date(b).getTime() : Number.POSITIVE_INFINITY;
  if (aMs === bMs) return 0;
  return aMs < bMs ? -1 : 1;
}

function compareTaskPriority(a: LeadTaskRow, b: LeadTaskRow): number {
  const dueCmp = compareIsoAscending(a.due_at, b.due_at);
  if (dueCmp !== 0) return dueCmp;
  const priorityA = typeof a.priority === "number" ? a.priority : Number.POSITIVE_INFINITY;
  const priorityB = typeof b.priority === "number" ? b.priority : Number.POSITIVE_INFINITY;
  if (priorityA !== priorityB) return priorityA - priorityB;
  const createdCmp = compareIsoAscending(a.created_at, b.created_at);
  if (createdCmp !== 0) return createdCmp;
  return String(a.id).localeCompare(String(b.id));
}

export function pickPrimaryCallTask(tasks: LeadTaskRow[]): LeadTaskRow | null {
  const openCallTasks = tasks.filter((task) => task.status === "pending" && isCallDrivingTaskType(task.task_type));
  if (openCallTasks.length === 0) return null;
  return [...openCallTasks].sort(compareTaskPriority)[0] ?? null;
}

export async function listOpenTasksForLead(
  sb: SupabaseClient,
  leadId: string,
): Promise<LeadTaskRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("tasks") as any)
    .select("id, title, due_at, task_type, status, lead_id, assigned_to, priority, notes, source_type, source_key, created_at, updated_at")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[task-lead-sync] Failed to load open tasks:", error.message);
    return [];
  }

  return Array.isArray(data) ? (data as LeadTaskRow[]) : [];
}

function projectFieldsFromPrimaryTask(task: LeadTaskRow | null) {
  if (!task) {
    return {
      next_action: null,
      next_action_due_at: null,
      next_call_scheduled_at: null,
      next_follow_up_at: null,
    };
  }

  const normalizedType = normalizeTaskType(task.task_type);
  const dueAt = task.due_at ?? null;

  return {
    next_action: typeof task.title === "string" && task.title.trim().length > 0 ? task.title.trim() : null,
    next_action_due_at: dueAt,
    next_call_scheduled_at: normalizedType === "callback" || normalizedType === "call_back" ? dueAt : null,
    next_follow_up_at: normalizedType === "follow_up" || normalizedType === "drive_by" ? dueAt : null,
  };
}

export async function projectLeadFromTasks(
  sb: SupabaseClient,
  leadId: string,
): Promise<LeadTaskCounts> {
  const openTasks = await listOpenTasksForLead(sb, leadId);
  const primaryTask = pickPrimaryCallTask(openTasks);
  const projection = projectFieldsFromPrimaryTask(primaryTask);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("leads") as any)
    .update({
      ...projection,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    console.error("[task-lead-sync] Failed to project task state onto lead:", error.message);
  }

  return {
    openTaskCount: openTasks.length,
    openCallTaskCount: openTasks.filter((task) => isCallDrivingTaskType(task.task_type)).length,
    primaryTaskId: primaryTask?.id ?? null,
  };
}

/**
 * Compatibility wrapper for legacy callers.
 * Recomputes the lead projection from its open tasks.
 */
export async function syncTaskToLead(
  sb: SupabaseClient,
  leadId: string,
  _title?: string | null,
  _dueAt?: string | null,
): Promise<void> {
  await projectLeadFromTasks(sb, leadId);
}

/**
 * Compatibility wrapper for legacy callers.
 * Recomputes the lead projection after a task was completed or deleted.
 */
export async function clearTaskFromLead(
  sb: SupabaseClient,
  leadId: string,
  _completedTaskId?: string,
): Promise<void> {
  await projectLeadFromTasks(sb, leadId);
}

async function enrichTaskTitle(
  sb: SupabaseClient,
  leadId: string,
  title: string,
): Promise<string> {
  if (title.includes(" - ") || title.includes(" — ")) {
    return title;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("property_id")
      .eq("id", leadId)
      .maybeSingle();

    if (!lead?.property_id) return title;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property } = await (sb.from("properties") as any)
      .select("owner_name, address")
      .eq("id", lead.property_id)
      .maybeSingle();

    if (!property) return title;

    const rawOwner = typeof property.owner_name === "string" ? property.owner_name.trim() : "";
    const ownerName = rawOwner && rawOwner !== "Unknown Owner" ? rawOwner : "";
    const address = typeof property.address === "string" ? property.address.trim() : "";
    const label = [ownerName, address].filter(Boolean).join(", ");
    return label ? `${title} — ${label}` : title;
  } catch {
    return title;
  }
}

export function inferCallTaskType(input: {
  taskType?: string | null;
  title?: string | null;
}): "callback" | "follow_up" | "drive_by" {
  const normalizedType = normalizeTaskType(input.taskType);
  if (normalizedType === "drive_by") return "drive_by";
  if (normalizedType === "callback" || normalizedType === "call_back") return "callback";
  if (normalizedType === "follow_up") return "follow_up";

  const title = typeof input.title === "string" ? input.title.trim().toLowerCase() : "";
  if (title.startsWith("drive by")) return "drive_by";
  if (title.includes("call back") || title.includes("callback")) return "callback";
  return "follow_up";
}

export async function upsertLeadCallTask(params: {
  sb: SupabaseClient;
  leadId: string;
  assignedTo: string;
  title: string;
  dueAt: string | null;
  taskType?: string | null;
  notes?: string | null;
  sourceType?: string | null;
  sourceKey?: string | null;
}): Promise<string | null> {
  const taskType = inferCallTaskType({ taskType: params.taskType, title: params.title });
  const title = await enrichTaskTitle(params.sb, params.leadId, params.title.trim());
  const now = new Date().toISOString();
  const sourceType = params.sourceType ?? "lead_follow_up";
  const sourceKey =
    params.sourceKey && params.sourceKey !== "primary_call"
      ? params.sourceKey
      : `lead:${params.leadId}:primary_call`;

  // Prefer updating an existing canonical pending call-driving task first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (params.sb.from("tasks") as any)
    .select("id")
    .eq("lead_id", params.leadId)
    .eq("status", "pending")
    .eq("source_type", sourceType)
    .eq("source_key", sourceKey)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (params.sb.from("tasks") as any)
      .update({
        title,
        due_at: params.dueAt,
        task_type: taskType,
        assigned_to: params.assignedTo,
        ...(params.notes !== undefined ? { notes: params.notes } : {}),
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) {
      console.error("[task-lead-sync] Failed to update canonical call task:", error.message);
      return null;
    }

    await projectLeadFromTasks(params.sb, params.leadId);
    return existing.id as string;
  }

  // Fallback: reuse the earliest pending call-driving task if there is one and it
  // has no explicit non-canonical source marker.
  const openTasks = await listOpenTasksForLead(params.sb, params.leadId);
  const reusable = pickPrimaryCallTask(openTasks);
  if (reusable?.id && (!reusable.source_type || reusable.source_type === sourceType)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (params.sb.from("tasks") as any)
      .update({
        title,
        due_at: params.dueAt,
        task_type: taskType,
        assigned_to: params.assignedTo,
        ...(params.notes !== undefined ? { notes: params.notes } : {}),
        source_type: sourceType,
        source_key: sourceKey,
        updated_at: now,
      })
      .eq("id", reusable.id);

    if (error) {
      console.error("[task-lead-sync] Failed to reuse pending call task:", error.message);
      return null;
    }

    await projectLeadFromTasks(params.sb, params.leadId);
    return reusable.id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (params.sb.from("tasks") as any)
    .insert({
      title,
      lead_id: params.leadId,
      assigned_to: params.assignedTo,
      due_at: params.dueAt,
      task_type: taskType,
      notes: params.notes ?? null,
      source_type: sourceType,
      source_key: sourceKey,
      status: "pending",
      priority: taskType === "callback" ? 1 : 2,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[task-lead-sync] Failed to create call-driving task:", error.message);
    return null;
  }

  await projectLeadFromTasks(params.sb, params.leadId);
  return inserted?.id ?? null;
}

export async function completeOpenCallTasksForLead(params: {
  sb: SupabaseClient;
  leadId: string;
  completionNote?: string | null;
}): Promise<void> {
  const openTasks = await listOpenTasksForLead(params.sb, params.leadId);
  const callTaskIds = openTasks.filter((task) => isCallDrivingTaskType(task.task_type)).map((task) => task.id);
  if (callTaskIds.length === 0) {
    await projectLeadFromTasks(params.sb, params.leadId);
    return;
  }

  const completedAt = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (params.sb.from("tasks") as any)
    .update({
      status: "completed",
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .in("id", callTaskIds);

  if (error) {
    console.error("[task-lead-sync] Failed to complete call-driving tasks:", error.message);
  }

  await projectLeadFromTasks(params.sb, params.leadId);
}

/**
 * Legacy helper kept for compatibility with older callers that still think
 * in terms of lead-driven follow-up. It now routes through the task-first
 * canonical upsert path.
 */
export async function syncLeadToTask(
  sb: SupabaseClient,
  leadId: string,
  title: string,
  dueAt: string | null,
  assignedTo: string,
  taskType: string = "follow_up",
): Promise<string | null> {
  return upsertLeadCallTask({
    sb,
    leadId,
    title,
    dueAt,
    assignedTo,
    taskType,
  });
}
