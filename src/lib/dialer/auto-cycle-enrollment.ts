import { isLeadStatusEligibleForAutoCycle } from "@/lib/dialer/auto-cycle";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type LeadEnrollmentRow = {
  id: string;
  status: string | null;
  assigned_to: string | null;
  properties?: {
    owner_phone?: string | null;
  } | null;
};

type LeadPhoneSeedRow = {
  id: string;
  lead_id: string;
  phone: string;
  position: number | null;
  status: string | null;
};

type ExistingCycleLeadRow = {
  id: string;
  lead_id: string;
};

export async function ensureAutoCycleEnrollmentForQueuedLeads(input: {
  sb: SupabaseClientLike;
  userId: string;
  leadIds: string[];
  now?: Date;
}): Promise<{ enrolledIds: string[] }> {
  const uniqueLeadIds = [...new Set(input.leadIds.filter(Boolean))];
  if (uniqueLeadIds.length === 0) return { enrolledIds: [] };

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadRows, error: leadError } = await ((input.sb.from("leads") as any)
    .select("id, status, assigned_to, properties(owner_phone)")
    .in("id", uniqueLeadIds)
    .eq("assigned_to", input.userId));

  if (leadError) {
    throw new Error(leadError.message ?? "Failed to load queued leads for auto-cycle enrollment");
  }

  const eligibleLeads = ((leadRows ?? []) as LeadEnrollmentRow[])
    .filter((lead) => isLeadStatusEligibleForAutoCycle(lead.status));

  if (eligibleLeads.length === 0) return { enrolledIds: [] };

  const eligibleLeadIds = eligibleLeads.map((lead) => lead.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingCycleRows, error: existingCycleError } = await ((input.sb.from("dialer_auto_cycle_leads") as any)
    .select("id, lead_id")
    .in("lead_id", eligibleLeadIds)
    .eq("user_id", input.userId));

  if (existingCycleError) {
    throw new Error(existingCycleError.message ?? "Failed to load existing auto-cycle leads");
  }

  const existingCycleByLeadId = new Map<string, ExistingCycleLeadRow>(
    ((existingCycleRows ?? []) as ExistingCycleLeadRow[]).map((row) => [row.lead_id, row]),
  );

  const leadsNeedingEnrollment = eligibleLeads.filter((lead) => !existingCycleByLeadId.has(lead.id));
  if (leadsNeedingEnrollment.length === 0) return { enrolledIds: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadPhoneRows, error: leadPhoneError } = await ((input.sb.from("lead_phones") as any)
    .select("id, lead_id, phone, position, status")
    .in("lead_id", leadsNeedingEnrollment.map((lead) => lead.id))
    .eq("status", "active")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true }));

  if (leadPhoneError) {
    throw new Error(leadPhoneError.message ?? "Failed to load lead phones for auto-cycle enrollment");
  }

  const phoneRowsByLeadId = new Map<string, LeadPhoneSeedRow[]>();
  for (const row of (leadPhoneRows ?? []) as LeadPhoneSeedRow[]) {
    const bucket = phoneRowsByLeadId.get(row.lead_id) ?? [];
    bucket.push(row);
    phoneRowsByLeadId.set(row.lead_id, bucket);
  }

  const cycleLeadRowsToInsert = leadsNeedingEnrollment
    .map((lead) => {
      const activePhones = phoneRowsByLeadId.get(lead.id) ?? [];
      const phoneSeeds = activePhones.length > 0
        ? activePhones.map((phone) => ({
            phone_id: phone.id,
            phone: phone.phone,
            phone_position: phone.position ?? 0,
          }))
        : lead.properties?.owner_phone
          ? [{
              phone_id: null,
              phone: lead.properties.owner_phone,
              phone_position: 0,
            }]
          : [];

      if (phoneSeeds.length === 0) return null;

      return {
        lead,
        phoneSeeds,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (cycleLeadRowsToInsert.length === 0) return { enrolledIds: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedCycleLeads, error: insertCycleLeadError } = await ((input.sb.from("dialer_auto_cycle_leads") as any)
    .insert(cycleLeadRowsToInsert.map(({ lead, phoneSeeds }) => ({
      lead_id: lead.id,
      user_id: input.userId,
      cycle_status: "ready",
      current_round: 1,
      next_due_at: nowIso,
      next_phone_id: phoneSeeds[0]?.phone_id ?? null,
      last_outcome: null,
      exit_reason: null,
    })))
    .select("id, lead_id"));

  if (insertCycleLeadError) {
    throw new Error(insertCycleLeadError.message ?? "Failed to create auto-cycle leads");
  }

  const insertedCycleLeadByLeadId = new Map<string, { id: string; lead_id: string }>(
    ((insertedCycleLeads ?? []) as Array<{ id: string; lead_id: string }>).map((row) => [row.lead_id, row]),
  );

  const phoneRowsToInsert = cycleLeadRowsToInsert.flatMap(({ lead, phoneSeeds }) => {
    const cycleLead = insertedCycleLeadByLeadId.get(lead.id);
    if (!cycleLead) return [];

    return phoneSeeds.map((phone) => ({
      cycle_lead_id: cycleLead.id,
      lead_id: lead.id,
      user_id: input.userId,
      phone_id: phone.phone_id,
      phone: phone.phone,
      phone_position: phone.phone_position,
      attempt_count: 0,
      next_attempt_number: 1,
      next_due_at: nowIso,
      last_attempt_at: null,
      last_outcome: null,
      voicemail_drop_next: false,
      phone_status: "active",
      exit_reason: null,
    }));
  });

  if (phoneRowsToInsert.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertPhoneError } = await ((input.sb.from("dialer_auto_cycle_phones") as any)
      .insert(phoneRowsToInsert));

    if (insertPhoneError) {
      throw new Error(insertPhoneError.message ?? "Failed to create auto-cycle phones");
    }
  }

  return {
    enrolledIds: cycleLeadRowsToInsert.map(({ lead }) => lead.id),
  };
}
