export type MorningQueueLeadRow = {
  id: string;
  status: string | null;
  next_follow_up_at: string | null;
  next_call_scheduled_at: string | null;
  follow_up_date?: string | null;
};

export type MorningQueueTaskRow = {
  id: string;
  lead_id: string | null;
  due_at: string | null;
  status?: string | null;
};

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

export function getEffectiveFollowUpAt(lead: MorningQueueLeadRow): string | null {
  return lead.next_follow_up_at ?? lead.next_call_scheduled_at ?? lead.follow_up_date ?? null;
}

function isActiveStatus(status: string | null): boolean {
  return status !== "dead" && status !== "closed";
}

export function classifyQueueDueWork(input: {
  leads: MorningQueueLeadRow[];
  tasks: MorningQueueTaskRow[];
  now?: Date;
}): {
  dueTodayLeadIds: Set<string>;
  overdueLeadIds: Set<string>;
} {
  const now = input.now ?? new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const dueTodayLeadIds = new Set<string>();
  const overdueLeadIds = new Set<string>();

  const leadById = new Map<string, MorningQueueLeadRow>();
  input.leads.forEach((lead) => {
    leadById.set(lead.id, lead);
    if (!isActiveStatus(lead.status)) return;

    const effective = getEffectiveFollowUpAt(lead);
    if (!effective) return;

    const dueAt = new Date(effective);
    if (!isValidDate(dueAt)) return;

    if (dueAt < now) {
      overdueLeadIds.add(lead.id);
      return;
    }

    if (dueAt >= startOfDay && dueAt <= endOfDay) {
      dueTodayLeadIds.add(lead.id);
    }
  });

  input.tasks.forEach((task) => {
    if (task.status && task.status !== "pending") return;
    if (!task.lead_id || !task.due_at) return;

    const linkedLead = leadById.get(task.lead_id);
    if (linkedLead && !isActiveStatus(linkedLead.status)) return;

    const dueAt = new Date(task.due_at);
    if (!isValidDate(dueAt)) return;

    if (dueAt < now) {
      overdueLeadIds.add(task.lead_id);
      return;
    }

    if (dueAt >= startOfDay && dueAt <= endOfDay) {
      dueTodayLeadIds.add(task.lead_id);
    }
  });

  return { dueTodayLeadIds, overdueLeadIds };
}
