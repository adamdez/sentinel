import { completeOpenCallTasksForLead, projectLeadFromTasks, upsertLeadCallTask } from "@/lib/task-lead-sync";
import {
  buildIntroRetryDueAt,
  buildIntroRetryReason,
  deriveIntroSopState,
  INTRO_SOP_MAX_DAY_COUNT,
  type IntroPendingAction,
  type IntroRetryRound,
  type IntroSopDerivedState,
} from "@/lib/intro-sop-state";

type SupabaseClientLike = {
  from: (table: string) => any;
};

const PACIFIC_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const INTRO_EXIT_CATEGORIES = ["nurture", "dead", "disposition", "drive_by"] as const;
export type IntroExitCategory = (typeof INTRO_EXIT_CATEGORIES)[number];
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export interface IntroSopState extends IntroSopDerivedState {
  intro_pending_action: IntroPendingAction;
}

function normalizeDateKey(value: string): string {
  return value.replace(/\//g, "-");
}

function pacificDateKey(isoLike?: string | null): string {
  const d = isoLike ? new Date(isoLike) : new Date();
  return normalizeDateKey(PACIFIC_DATE_FORMATTER.format(d));
}

function isSchemaDriftError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /does not exist|could not find the/i.test(error.message ?? "");
}

export function toIntroSopState(raw: Record<string, unknown> | null | undefined): IntroSopState {
  return deriveIntroSopState(raw);
}

async function applyLeadFollowUpFallbackProjection(input: {
  sb: SupabaseClientLike;
  leadId: string;
  title: string;
  dueAt: string | null;
  taskType: "follow_up" | "drive_by";
  nowIso: string;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (input.sb.from("leads") as any)
    .update({
      next_action: input.title,
      next_action_due_at: input.dueAt,
      next_call_scheduled_at: null,
      next_follow_up_at: input.dueAt,
      updated_at: input.nowIso,
    })
    .eq("id", input.leadId);

  if (error) {
    console.error(
      `[intro-sop] Failed to apply ${input.taskType} fallback projection for lead ${input.leadId}:`,
      error.message ?? error,
    );
  }
}

export async function progressIntroSopForCallAttempt(input: {
  sb: SupabaseClientLike;
  leadId: string;
  attemptedAtIso?: string;
}): Promise<{ supported: boolean; state: IntroSopState | null }> {
  const attemptedDateKey = pacificDateKey(input.attemptedAtIso);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadFetch = await (input.sb.from("leads") as any)
    .select("id, intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category, intro_exit_reason, next_action_due_at, next_follow_up_at")
    .eq("id", input.leadId)
    .single();

  if (leadFetch.error) {
    if (isSchemaDriftError(leadFetch.error)) {
      return { supported: false, state: null };
    }
    throw new Error(leadFetch.error.message ?? "Failed to load intro SOP state");
  }

  const current = toIntroSopState(leadFetch.data as Record<string, unknown>);
  if (!current.intro_sop_active || current.intro_exit_category === "drive_by") {
    return { supported: true, state: current };
  }
  if (current.intro_last_call_date === attemptedDateKey) {
    return { supported: true, state: current };
  }

  const nextDayCount = Math.min(INTRO_SOP_MAX_DAY_COUNT, current.intro_day_count + 1);
  const patch: Record<string, unknown> = {
    intro_day_count: nextDayCount,
    intro_last_call_date: attemptedDateKey,
    intro_completed_at: null,
    intro_exit_reason: null,
  };
  if (current.intro_retry_scheduled) {
    patch.next_action = null;
    patch.next_action_due_at = null;
    patch.next_follow_up_at = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: patchError } = await (input.sb.from("leads") as any)
    .update(patch)
    .eq("id", input.leadId)
    .select("intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category, intro_exit_reason, next_action_due_at, next_follow_up_at")
    .single();

  if (patchError) {
    if (isSchemaDriftError(patchError)) {
      return { supported: false, state: null };
    }
    throw new Error(patchError.message ?? "Failed to update intro SOP state");
  }

  return { supported: true, state: toIntroSopState(updated as Record<string, unknown>) };
}

export async function exitIntroSop(input: {
  sb: SupabaseClientLike;
  leadId: string;
  category: IntroExitCategory;
  userId?: string | null;
}): Promise<{ supported: boolean; state: IntroSopState | null }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const todayPacific = pacificDateKey(nowIso);
  const category = input.category;
  const patch: Record<string, unknown> = {
    intro_sop_active: false,
    intro_last_call_date: todayPacific,
    intro_completed_at: nowIso,
    intro_exit_category: category,
    intro_exit_reason: category === "drive_by" ? "operator_drive_by" : "operator_selected",
    dial_queue_active: false,
    dial_queue_added_at: null,
    dial_queue_added_by: null,
    next_action_due_at: null,
    next_follow_up_at: null,
  };

  if (category === "drive_by") {
    patch.status = "lead";
  } else if (category === "nurture") {
    patch.status = "nurture";
  } else if (category === "dead") {
    patch.status = "dead";
  } else if (category === "disposition") {
    patch.status = "disposition";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (input.sb.from("leads") as any)
    .update(patch)
    .eq("id", input.leadId)
    .select("assigned_to, intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category, intro_exit_reason, next_action_due_at, next_follow_up_at")
    .single();

  if (error) {
    if (isSchemaDriftError(error)) {
      return { supported: false, state: null };
    }
    throw new Error(error.message ?? "Failed to exit intro SOP");
  }

  const assignedTo = updated?.assigned_to ?? input.userId ?? SYSTEM_USER_ID;
  if (category === "dead") {
    await completeOpenCallTasksForLead({
      sb: input.sb,
      leadId: input.leadId,
      completionNote: "Completed after intro SOP exit to dead.",
    });
  } else if (category === "drive_by" || category === "nurture" || category === "disposition") {
    const title =
      category === "drive_by"
        ? "Drive by"
        : category === "nurture"
          ? "Nurture follow-up"
          : "Disposition review";
    const taskType = category === "drive_by" ? "drive_by" : "follow_up";
    const taskId = await upsertLeadCallTask({
      sb: input.sb,
      leadId: input.leadId,
      assignedTo,
      title,
      dueAt: nowIso,
      taskType,
      sourceType: "lead_follow_up",
      sourceKey: `lead:${input.leadId}:primary_call`,
    });
    if (!taskId) {
      await applyLeadFollowUpFallbackProjection({
        sb: input.sb,
        leadId: input.leadId,
        title,
        dueAt: nowIso,
        taskType,
        nowIso,
      });
    }
  } else {
    await projectLeadFromTasks(input.sb, input.leadId);
  }

  if (input.userId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input.sb.from("event_log") as any)
      .insert({
        user_id: input.userId,
        action: "lead.intro_sop_exit",
        entity_type: "lead",
        entity_id: input.leadId,
        details: {
          category,
        },
      })
      .then(() => {});
  }

  return { supported: true, state: toIntroSopState(updated as Record<string, unknown>) };
}

export async function scheduleIntroRetry(input: {
  sb: SupabaseClientLike;
  leadId: string;
  nextRound: Extract<IntroRetryRound, 2 | 3>;
  userId?: string | null;
  dueAtIso?: string | null;
}): Promise<{ supported: boolean; state: IntroSopState | null }> {
  const nowIso = new Date().toISOString();
  const dueAt = input.dueAtIso ?? buildIntroRetryDueAt(new Date(nowIso));
  const title = input.nextRound === 2 ? "Intro retry round 2" : "Intro final retry";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (input.sb.from("leads") as any)
    .update({
      intro_sop_active: true,
      intro_exit_category: null,
      intro_exit_reason: buildIntroRetryReason(input.nextRound),
      intro_completed_at: null,
      next_action: title,
      next_action_due_at: dueAt,
      next_call_scheduled_at: null,
      next_follow_up_at: dueAt,
      dial_queue_active: true,
      updated_at: nowIso,
    })
    .eq("id", input.leadId)
    .select("intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category, intro_exit_reason, next_action_due_at, next_follow_up_at")
    .single();

  if (error) {
    if (isSchemaDriftError(error)) {
      return { supported: false, state: null };
    }
    throw new Error(error.message ?? "Failed to schedule intro retry");
  }

  if (input.userId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input.sb.from("event_log") as any)
      .insert({
        user_id: input.userId,
        action: "lead.intro_sop_retry_scheduled",
        entity_type: "lead",
        entity_id: input.leadId,
        details: {
          next_round: input.nextRound,
          due_at: dueAt,
        },
      })
      .then(() => {});
  }

  return { supported: true, state: toIntroSopState(updated as Record<string, unknown>) };
}
