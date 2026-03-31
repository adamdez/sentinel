import { canUserClaimLead, normalizeAssignedUserId } from "@/lib/lead-ownership";
import { runSkipTraceIntel } from "@/lib/skiptrace-intel";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export interface QueueLeadSelection {
  id: string;
  property_id: string | null;
  assigned_to: string | null;
  dial_queue_active: boolean | null;
  status: string | null;
}

export interface DialQueueMutationResult {
  queuedIds: string[];
  conflictedIds: string[];
  missingIds: string[];
}

export interface QueueSkipTraceEligibility {
  skipTraceStatus: string | null | undefined;
  ownerFlags?: Record<string, unknown> | null | undefined;
}

export interface QueueSkipTraceSummary {
  checked: number;
  tracedNow: number;
  skippedAlreadyTraced: number;
  failed: number;
  phonesSaved: number;
  details: Array<{
    leadId: string;
    status: "traced" | "skipped" | "failed";
    reason: string;
    phonesSaved: number;
  }>;
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function isMissingDialQueueColumnError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("dial_queue_active") || message.includes("dial_queue_added_at") || message.includes("dial_queue_added_by");
}

export function hasCompletedSkipTrace(input: QueueSkipTraceEligibility): boolean {
  const status = typeof input.skipTraceStatus === "string" ? input.skipTraceStatus.trim().toLowerCase() : "";
  if (status === "completed") return true;

  const flags = (input.ownerFlags ?? {}) as Record<string, unknown>;
  if (typeof flags.skip_trace_intel_at === "string" && flags.skip_trace_intel_at.trim()) return true;
  if (flags.skip_traced === true) return true;
  return false;
}

export async function queueLeadIdsForUser(input: {
  sb: SupabaseClientLike;
  userId: string;
  leadIds: string[];
}): Promise<DialQueueMutationResult> {
  const leadIds = [...new Set(input.leadIds.filter(Boolean))];
  if (leadIds.length === 0) {
    return { queuedIds: [], conflictedIds: [], missingIds: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((input.sb.from("leads") as any)
    .select("id, property_id, assigned_to, status")
    .in("id", leadIds));

  if (error) {
    throw new Error(error.message ?? "Failed to load leads for queueing");
  }

  const rows = (data ?? []) as QueueLeadSelection[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const queuedIds: string[] = [];
  const conflictedIds: string[] = [];
  const missingIds: string[] = [];
  const eligibleIds: string[] = [];
  const queuedAt = new Date().toISOString();

  for (const leadId of leadIds) {
    const row = byId.get(leadId);
    if (!row) {
      missingIds.push(leadId);
      continue;
    }

    if (!canUserClaimLead({ assignedUserId: row.assigned_to, claimantUserId: input.userId })) {
      conflictedIds.push(leadId);
      continue;
    }

    eligibleIds.push(leadId);
  }

  if (eligibleIds.length === 0) {
    return { queuedIds, conflictedIds, missingIds };
  }

  const applyQueueUpdate = async (values: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((input.sb.from("leads") as any)
      .update(values)
      .in("id", eligibleIds)
      .or(`assigned_to.is.null,assigned_to.eq.${input.userId}`)
      .select("id")) as Promise<{
        data?: Array<{ id: string }>;
        error?: { message?: string | null } | null;
      }>;
  };

  let updateResult = await applyQueueUpdate({
    assigned_to: input.userId,
    dial_queue_active: true,
    dial_queue_added_at: queuedAt,
    dial_queue_added_by: input.userId,
    updated_at: queuedAt,
  });

  if (updateResult.error && isMissingDialQueueColumnError(updateResult.error)) {
    updateResult = await applyQueueUpdate({
      assigned_to: input.userId,
      updated_at: queuedAt,
    });
  }

  if (updateResult.error) {
    throw new Error(updateResult.error.message ?? `Failed to queue ${eligibleIds.length} leads`);
  }

  const updatedIdSet = new Set((updateResult.data ?? []).map((row) => row.id));
  for (const leadId of eligibleIds) {
    if (updatedIdSet.has(leadId)) {
      queuedIds.push(leadId);
    } else {
      conflictedIds.push(leadId);
    }
  }

  return { queuedIds, conflictedIds, missingIds };
}

export async function removeLeadFromDialQueue(input: {
  sb: SupabaseClientLike;
  leadId: string;
  userId: string;
}): Promise<"removed" | "not_owned" | "not_found"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((input.sb.from("leads") as any)
    .select("id, assigned_to")
    .eq("id", input.leadId)
    .maybeSingle());

  if (error) {
    throw new Error(error.message ?? "Failed to load lead");
  }
  if (!data) return "not_found";

  const assignedTo = normalizeAssignedUserId((data as { assigned_to?: string | null }).assigned_to ?? null);
  if (assignedTo !== input.userId) return "not_owned";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await ((input.sb.from("leads") as any)
    .update({
      dial_queue_active: false,
      dial_queue_added_at: null,
      dial_queue_added_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.leadId));

  if (updateErr) {
    throw new Error(updateErr.message ?? "Failed to remove lead from queue");
  }

  return "removed";
}

export async function runSkipTraceForQueuedLeads(input: {
  sb: SupabaseClientLike;
  userId: string;
}): Promise<QueueSkipTraceSummary> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data, error } = await ((input.sb.from("leads") as any)
    .select("id, property_id, assigned_to, skip_trace_status, properties(id, address, city, state, zip, owner_name, owner_flags)")
    .eq("assigned_to", input.userId)
    .eq("dial_queue_active", true)
    .order("dial_queue_added_at", { ascending: false }));

  if (error && isMissingDialQueueColumnError(error)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fallback = await ((input.sb.from("leads") as any)
      .select("id, property_id, assigned_to, skip_trace_status, properties(id, address, city, state, zip, owner_name, owner_flags)")
      .eq("assigned_to", input.userId)
      .order("updated_at", { ascending: false }));
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message ?? "Failed to load queued leads for skip trace");
  }

  const rows = (data ?? []) as Array<{
    id: string;
    property_id: string | null;
    assigned_to: string | null;
    skip_trace_status?: string | null;
    properties?: {
      id?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      owner_name?: string | null;
      owner_flags?: Record<string, unknown> | null;
    } | null;
  }>;

  const summary: QueueSkipTraceSummary = {
    checked: rows.length,
    tracedNow: 0,
    skippedAlreadyTraced: 0,
    failed: 0,
    phonesSaved: 0,
    details: [],
  };

  for (const row of rows) {
    const alreadyTraced = hasCompletedSkipTrace({
      skipTraceStatus: row.skip_trace_status,
      ownerFlags: row.properties?.owner_flags,
    });

    if (alreadyTraced) {
      summary.skippedAlreadyTraced += 1;
      summary.details.push({
        leadId: row.id,
        status: "skipped",
        reason: "already_traced",
        phonesSaved: 0,
      });
      continue;
    }

    if (!row.property_id || !row.properties?.address) {
      summary.failed += 1;
      summary.details.push({
        leadId: row.id,
        status: "failed",
        reason: "missing_address",
        phonesSaved: 0,
      });
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((input.sb.from("leads") as any)
      .update({
        skip_trace_status: "running",
        skip_trace_last_attempted_at: new Date().toISOString(),
        skip_trace_last_error: null,
      })
      .eq("id", row.id));

    const result = await runSkipTraceIntel({
      leadId: row.id,
      propertyId: row.property_id,
      address: row.properties.address ?? undefined,
      city: row.properties.city ?? undefined,
      state: row.properties.state ?? undefined,
      zip: row.properties.zip ?? undefined,
      ownerName: row.properties.owner_name ?? undefined,
      reason: "queue_bulk",
      force: false,
    });

    if (result.reason === "completed" && (result.saveFailures ?? 0) === 0) {
      summary.tracedNow += 1;
      summary.phonesSaved += result.phonesPromoted;
      summary.details.push({
        leadId: row.id,
        status: "traced",
        reason: "completed",
        phonesSaved: result.phonesPromoted,
      });
      continue;
    }

    if (result.reason === "debounced") {
      summary.skippedAlreadyTraced += 1;
      summary.details.push({
        leadId: row.id,
        status: "skipped",
        reason: "debounced_recent_run",
        phonesSaved: 0,
      });
      continue;
    }

    summary.failed += 1;
    summary.phonesSaved += result.phonesPromoted;
    summary.details.push({
      leadId: row.id,
      status: "failed",
      reason: result.reason,
      phonesSaved: result.phonesPromoted,
    });
  }

  return summary;
}
