export function resolveTerminalDispositionTargetStatus(
  disposition: "not_interested" | "disqualified" | "dead_lead" | "do_not_call",
): "dead" | "nurture" {
  return disposition === "disqualified" ? "nurture" : "dead";
}

export function buildTerminalDispositionLeadPatch(input: {
  disposition: "not_interested" | "disqualified" | "dead_lead" | "do_not_call";
  lockVersion?: number | null;
  nowIso: string;
}): Record<string, unknown> {
  const targetStatus = resolveTerminalDispositionTargetStatus(input.disposition);

  return {
    status: targetStatus,
    qualification_route: targetStatus === "dead" ? "dead" : "nurture",
    next_action: null,
    next_action_due_at: null,
    next_call_scheduled_at: null,
    next_follow_up_at: null,
    follow_up_date: null,
    dial_queue_active: false,
    dial_queue_added_at: null,
    dial_queue_added_by: null,
    intro_sop_active: false,
    intro_completed_at: input.nowIso,
    intro_exit_category: targetStatus === "dead" ? "dead" : "nurture",
    updated_at: input.nowIso,
    ...(typeof input.lockVersion === "number" ? { lock_version: input.lockVersion + 1 } : {}),
  };
}
