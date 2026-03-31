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
