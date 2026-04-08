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
      phone: fallbackPhone ?? null,
    };
  }

  const autoCycleIndex = nextPhoneId
    ? activePhones.findIndex((phone) => phone.id === nextPhoneId)
    : -1;
  const selectedIndex = autoCycleMode
    ? (autoCycleIndex >= 0 ? autoCycleIndex : 0)
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
