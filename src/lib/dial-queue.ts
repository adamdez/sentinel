import { canUserClaimLead, normalizeAssignedUserId } from "@/lib/lead-ownership";
import { runSkipTraceIntel } from "@/lib/skiptrace-intel";
import { runWithConcurrency } from "@/lib/async-batch";

type SupabaseClientLike = {
  from: (table: string) => any;
};

const QUEUE_SKIP_TRACE_CONCURRENCY = 3;
const QUEUE_SKIP_TRACE_PROPERTY_SELECT = "properties(id, address, city, state, zip, owner_name, owner_flags)";

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

function isMissingSkipTraceColumnError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("skip_trace_status")
    || message.includes("skip_trace_completed_at")
    || message.includes("skip_trace_last_attempted_at")
    || message.includes("skip_trace_last_error")
  );
}

type QueueSkipTraceLeadRow = {
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
};

function buildQueueSkipTraceSelect(includeSkipTraceStatus: boolean): string {
  return includeSkipTraceStatus
    ? `id, property_id, assigned_to, skip_trace_status, ${QUEUE_SKIP_TRACE_PROPERTY_SELECT}`
    : `id, property_id, assigned_to, ${QUEUE_SKIP_TRACE_PROPERTY_SELECT}`;
}

async function queryQueuedLeadsForSkipTrace(input: {
  sb: SupabaseClientLike;
  userId: string;
}, options: {
  includeDialQueueColumns: boolean;
  includeSkipTraceStatus: boolean;
}): Promise<{
  data?: QueueSkipTraceLeadRow[] | null;
  error?: { message?: string | null; code?: string | null } | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = ((input.sb.from("leads") as any)
    .select(buildQueueSkipTraceSelect(options.includeSkipTraceStatus))
    .eq("assigned_to", input.userId));

  if (options.includeDialQueueColumns) {
    query = query
      .eq("dial_queue_active", true)
      .order("dial_queue_added_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  return query as Promise<{
    data?: QueueSkipTraceLeadRow[] | null;
    error?: { message?: string | null; code?: string | null } | null;
  }>;
}

async function loadQueuedLeadsForSkipTrace(input: {
  sb: SupabaseClientLike;
  userId: string;
}): Promise<QueueSkipTraceLeadRow[]> {
  let result = await queryQueuedLeadsForSkipTrace(input, {
    includeDialQueueColumns: true,
    includeSkipTraceStatus: true,
  });

  if (!result.error) {
    return (result.data ?? []) as QueueSkipTraceLeadRow[];
  }

  const missingDialQueueColumns = isMissingDialQueueColumnError(result.error);
  const missingSkipTraceColumns = isMissingSkipTraceColumnError(result.error);

  if (!missingDialQueueColumns && !missingSkipTraceColumns) {
    throw new Error(result.error.message ?? "Failed to load queued leads for skip trace");
  }

  result = await queryQueuedLeadsForSkipTrace(input, {
    includeDialQueueColumns: !missingDialQueueColumns,
    includeSkipTraceStatus: !missingSkipTraceColumns,
  });

  if (!result.error) {
    return (result.data ?? []) as QueueSkipTraceLeadRow[];
  }

  const fallbackMissingDialQueueColumns = missingDialQueueColumns || isMissingDialQueueColumnError(result.error);
  const fallbackMissingSkipTraceColumns = missingSkipTraceColumns || isMissingSkipTraceColumnError(result.error);

  if (fallbackMissingDialQueueColumns || fallbackMissingSkipTraceColumns) {
    const finalFallback = await queryQueuedLeadsForSkipTrace(input, {
      includeDialQueueColumns: false,
      includeSkipTraceStatus: false,
    });

    if (!finalFallback.error) {
      return (finalFallback.data ?? []) as QueueSkipTraceLeadRow[];
    }

    throw new Error(finalFallback.error.message ?? "Failed to load queued leads for skip trace");
  }

  throw new Error(result.error.message ?? "Failed to load queued leads for skip trace");
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
  const unclaimedEligibleIds: string[] = [];
  const ownedEligibleIds: string[] = [];
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
    if (normalizeAssignedUserId(row.assigned_to) === input.userId) {
      ownedEligibleIds.push(leadId);
    } else {
      unclaimedEligibleIds.push(leadId);
    }
  }

  if (eligibleIds.length === 0) {
    return { queuedIds, conflictedIds, missingIds };
  }

  const applyQueueUpdate = async (
    ids: string[],
    values: Record<string, unknown>,
    assignmentFilter: "unclaimed" | "owned",
  ) => {
    if (ids.length === 0) {
      return { data: [], error: null };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = ((input.sb.from("leads") as any)
      .update(values)
      .in("id", ids));

    query = assignmentFilter === "unclaimed"
      ? query.is("assigned_to", null)
      : query.eq("assigned_to", input.userId);

    return query.select("id") as Promise<{
        data?: Array<{ id: string }>;
        error?: { message?: string | null } | null;
      }>;
  };

  const queueValuesWithMetadata = {
    assigned_to: input.userId,
    dial_queue_active: true,
    dial_queue_added_at: queuedAt,
    dial_queue_added_by: input.userId,
    updated_at: queuedAt,
  };
  const queueValuesWithoutMetadata = {
    assigned_to: input.userId,
    updated_at: queuedAt,
  };

  const queueSubset = async (ids: string[], assignmentFilter: "unclaimed" | "owned") => {
    let updateResult = await applyQueueUpdate(ids, queueValuesWithMetadata, assignmentFilter);

    if (updateResult.error && isMissingDialQueueColumnError(updateResult.error)) {
      updateResult = await applyQueueUpdate(ids, queueValuesWithoutMetadata, assignmentFilter);
    }

    if (updateResult.error) {
      throw new Error(updateResult.error.message ?? `Failed to queue ${ids.length} leads`);
    }

    return (updateResult.data ?? []).map((row) => row.id);
  };

  const updatedIdSet = new Set([
    ...(await queueSubset(unclaimedEligibleIds, "unclaimed")),
    ...(await queueSubset(ownedEligibleIds, "owned")),
  ]);

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
  const rows = await loadQueuedLeadsForSkipTrace(input);

  const summary: QueueSkipTraceSummary = {
    checked: rows.length,
    tracedNow: 0,
    skippedAlreadyTraced: 0,
    failed: 0,
    phonesSaved: 0,
    details: [],
  };

  const results = await runWithConcurrency(rows, QUEUE_SKIP_TRACE_CONCURRENCY, async (row) => {
    const alreadyTraced = hasCompletedSkipTrace({
      skipTraceStatus: row.skip_trace_status,
      ownerFlags: row.properties?.owner_flags,
    });

    if (alreadyTraced) {
      return {
        tracedNow: 0,
        skippedAlreadyTraced: 1,
        failed: 0,
        phonesSaved: 0,
        detail: {
          leadId: row.id,
          status: "skipped",
          reason: "already_traced",
          phonesSaved: 0,
        } as QueueSkipTraceSummary["details"][number],
      };
    }

    if (!row.property_id || !row.properties?.address) {
      return {
        tracedNow: 0,
        skippedAlreadyTraced: 0,
        failed: 1,
        phonesSaved: 0,
        detail: {
          leadId: row.id,
          status: "failed",
          reason: "missing_address",
          phonesSaved: 0,
        } as QueueSkipTraceSummary["details"][number],
      };
    }

    try {
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
        return {
          tracedNow: 1,
          skippedAlreadyTraced: 0,
          failed: 0,
          phonesSaved: result.phonesPromoted,
          detail: {
            leadId: row.id,
            status: "traced",
            reason: "completed",
            phonesSaved: result.phonesPromoted,
          } as QueueSkipTraceSummary["details"][number],
        };
      }

      if (result.reason === "debounced") {
        return {
          tracedNow: 0,
          skippedAlreadyTraced: 1,
          failed: 0,
          phonesSaved: 0,
          detail: {
            leadId: row.id,
            status: "skipped",
            reason: "debounced_recent_run",
            phonesSaved: 0,
          } as QueueSkipTraceSummary["details"][number],
        };
      }

      return {
        tracedNow: 0,
        skippedAlreadyTraced: 0,
        failed: 1,
        phonesSaved: result.phonesPromoted,
        detail: {
          leadId: row.id,
          status: "failed",
          reason: result.reason,
          phonesSaved: result.phonesPromoted,
        } as QueueSkipTraceSummary["details"][number],
      };
    } catch (error) {
      const message = getErrorMessage(error) || "unexpected_error";
      console.error(`[dial-queue] queued skip trace failed for lead ${row.id}:`, error);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ((input.sb.from("leads") as any)
          .update({
            skip_trace_status: "failed",
            skip_trace_last_error: message.slice(0, 500),
          })
          .eq("id", row.id));
      } catch {}

      return {
        tracedNow: 0,
        skippedAlreadyTraced: 0,
        failed: 1,
        phonesSaved: 0,
        detail: {
          leadId: row.id,
          status: "failed",
          reason: message,
          phonesSaved: 0,
        } as QueueSkipTraceSummary["details"][number],
      };
    }
  });

  for (const result of results) {
    summary.tracedNow += result.tracedNow;
    summary.skippedAlreadyTraced += result.skippedAlreadyTraced;
    summary.failed += result.failed;
    summary.phonesSaved += result.phonesSaved;
    summary.details.push(result.detail);
  }

  return summary;
}
