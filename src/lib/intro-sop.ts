import { completeOpenCallTasksForLead, projectLeadFromTasks, upsertLeadCallTask } from "@/lib/task-lead-sync";

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

export interface IntroSopState {
  intro_sop_active: boolean;
  intro_day_count: number;
  intro_last_call_date: string | null;
  intro_completed_at: string | null;
  intro_exit_category: string | null;
  requires_exit_category: boolean;
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
  const dayCount =
    typeof raw?.intro_day_count === "number" && Number.isFinite(raw.intro_day_count)
      ? Math.max(0, Math.min(3, Math.floor(raw.intro_day_count)))
      : 0;
  const active = raw?.intro_sop_active !== false;
  const completedAt = typeof raw?.intro_completed_at === "string" ? raw.intro_completed_at : null;
  const exitCategory = typeof raw?.intro_exit_category === "string" ? raw.intro_exit_category : null;
  const lastCallDate = typeof raw?.intro_last_call_date === "string" ? raw.intro_last_call_date : null;
  return {
    intro_sop_active: active,
    intro_day_count: dayCount,
    intro_last_call_date: lastCallDate,
    intro_completed_at: completedAt,
    intro_exit_category: exitCategory,
    requires_exit_category: !!(completedAt && !exitCategory),
  };
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
    .select("id, intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category")
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

  const nextDayCount = Math.min(3, current.intro_day_count + 1);
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    intro_day_count: nextDayCount,
    intro_last_call_date: attemptedDateKey,
  };

  if (nextDayCount >= 3) {
    patch.intro_sop_active = false;
    patch.intro_completed_at = nowIso;
    patch.dial_queue_active = false;
    patch.dial_queue_added_at = null;
    patch.dial_queue_added_by = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: patchError } = await (input.sb.from("leads") as any)
    .update(patch)
    .eq("id", input.leadId)
    .select("intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category")
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
    intro_day_count: 3,
    intro_last_call_date: todayPacific,
    intro_completed_at: nowIso,
    intro_exit_category: category,
    intro_exit_reason: category === "drive_by" ? "operator_drive_by" : "operator_selected",
    dial_queue_active: false,
    dial_queue_added_at: null,
    dial_queue_added_by: null,
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
    .select("assigned_to, intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category")
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
