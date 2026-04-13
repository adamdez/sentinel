import type { LeadPhone } from "@/lib/dialer/types";

export type DialerPhoneSelectionInput = {
  autoCycleMode: boolean;
  leadPhones: LeadPhone[];
  phoneIndex: number;
  nextPhoneId?: string | null;
  fallbackPhone?: string | null;
};

export type DialerPhoneSelection = {
  activePhones: LeadPhone[];
  selectedIndex: number;
  selectedPhone: LeadPhone | null;
  phone: string | null;
};

export type QueueAdvancePlanInput = {
  queueLeadIds: string[];
  currentLeadId: string | null | undefined;
  phoneIndex: number;
  activePhoneCount: number;
  isTerminalDisposition?: boolean;
};

export type QueueAdvancePlan =
  | { action: "stay"; leadId: string; nextPhoneIndex: number }
  | { action: "next"; leadId: string }
  | { action: "done" };

export type PowerDialSeedLeadLike = {
  id: string;
  autoCycle?: unknown | null;
};

export function resolveDialerPhoneSelection({
  autoCycleMode,
  leadPhones,
  phoneIndex,
  nextPhoneId,
  fallbackPhone,
}: DialerPhoneSelectionInput): DialerPhoneSelection {
  const activePhones = leadPhones.filter((phone) => phone.status === "active");

  if (activePhones.length === 0) {
    return {
      activePhones,
      selectedIndex: 0,
      selectedPhone: null,
      // Only fall back to the legacy owner_phone mirror when the lead has no
      // canonical lead_phones rows yet. Once canonical rows exist, an all-dead
      // or all-DNC roster should render as "no active phone" and stay non-callable.
      phone: leadPhones.length === 0 ? (fallbackPhone ?? null) : null,
    };
  }

  const autoCycleFallbackIndex = (() => {
    const firstUncalledIndex = activePhones.findIndex((phone) => !phone.last_called_at);
    if (firstUncalledIndex >= 0) return firstUncalledIndex;

    let oldestIndex = 0;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (let index = 0; index < activePhones.length; index += 1) {
      const lastCalledAt = activePhones[index]?.last_called_at;
      const calledTime = lastCalledAt ? new Date(lastCalledAt).getTime() : Number.NEGATIVE_INFINITY;
      if (calledTime < oldestTime) {
        oldestTime = calledTime;
        oldestIndex = index;
      }
    }
    return oldestIndex;
  })();

  const autoCycleIndex = nextPhoneId
    ? activePhones.findIndex((phone) => phone.id === nextPhoneId)
    : -1;
  const selectedIndex = autoCycleMode
    ? (autoCycleIndex >= 0 ? autoCycleIndex : autoCycleFallbackIndex)
    : (phoneIndex >= 0 && phoneIndex < activePhones.length ? phoneIndex : 0);
  const selectedPhone = activePhones[selectedIndex] ?? activePhones[0] ?? null;

  return {
    activePhones,
    selectedIndex,
    selectedPhone,
    phone: selectedPhone?.phone ?? fallbackPhone ?? null,
  };
}

export function planNextQueueTarget({
  queueLeadIds,
  currentLeadId,
  phoneIndex,
  activePhoneCount,
  isTerminalDisposition = false,
}: QueueAdvancePlanInput): QueueAdvancePlan {
  // Power Dial is a single-pass worker: exhaust the current lead's active
  // phones once, then move forward through the queue without looping back.
  const normalizedQueue = queueLeadIds.filter(Boolean);
  if (!currentLeadId) {
    const firstLeadId = normalizedQueue[0] ?? null;
    return firstLeadId ? { action: "next", leadId: firstLeadId } : { action: "done" };
  }

  if (!isTerminalDisposition && activePhoneCount > 1 && phoneIndex + 1 < activePhoneCount) {
    return {
      action: "stay",
      leadId: currentLeadId,
      nextPhoneIndex: phoneIndex + 1,
    };
  }

  const currentIdx = normalizedQueue.findIndex((leadId) => leadId === currentLeadId);
  if (currentIdx >= 0) {
    const nextLeadId = normalizedQueue[currentIdx + 1] ?? null;
    return nextLeadId ? { action: "next", leadId: nextLeadId } : { action: "done" };
  }

  return { action: "done" };
}

export function collectPowerDialLeadIdsToSeed<TQueueLead extends { id: string }>(
  queue: TQueueLead[],
  autoCycleQueue: PowerDialSeedLeadLike[],
): string[] {
  const enrolledLeadIds = new Set(
    autoCycleQueue
      .filter((lead) => lead.autoCycle != null)
      .map((lead) => lead.id),
  );

  return queue
    .map((lead) => lead.id)
    .filter((leadId) => !enrolledLeadIds.has(leadId));
}
