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
  next_action: string | null;
}

export function isDriveByNextAction(nextAction: string | null | undefined): boolean {
  return typeof nextAction === "string" && nextAction.toLowerCase().startsWith("drive by");
}

const TERMINAL_QUEUE_DISPOSITIONS = new Set([
  "dead_lead",
  "disqualified",
  "not_interested",
]);

const AUTO_CYCLE_QUEUE_EVICT_STATUSES = new Set([
  "exited",
]);

export function shouldEvictFromDialQueueForDisposition(disposition: string | null | undefined): boolean {
  return typeof disposition === "string" && TERMINAL_QUEUE_DISPOSITIONS.has(disposition.toLowerCase());
}

export function shouldEvictFromDialQueueForAutoCycleStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && AUTO_CYCLE_QUEUE_EVICT_STATUSES.has(status.toLowerCase());
}

async function clearLeadFromDialQueue(
  sb: SupabaseClientLike,
  leadId: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("leads") as any)
    .update({
      dial_queue_active: false,
      dial_queue_added_at: null,
      dial_queue_added_by: null,
    })
    .eq("id", leadId)
    .eq("dial_queue_active", true);
  return !error;
}

/**
 * If the new next_action is Drive By, clear dial queue membership.
 * Call this on every write path that sets next_action.
 * Returns true if queue eviction occurred.
 */
export async function evictFromDialQueueIfDriveBy(
  sb: SupabaseClientLike,
  leadId: string,
  nextAction: string | null | undefined,
): Promise<boolean> {
  if (!isDriveByNextAction(nextAction)) return false;
  const removed = await clearLeadFromDialQueue(sb, leadId);
  if (!removed) {
    console.warn(`[DialQueue] evict-on-drive-by failed for ${leadId}`);
  }
  return removed;
}

/**
 * Terminal closeouts should clear explicit queue membership so the lead does
 * not remain "queued" in the database while being hidden by render filters.
 */
export async function evictFromDialQueueIfTerminalDisposition(
  sb: SupabaseClientLike,
  leadId: string,
  disposition: string | null | undefined,
): Promise<boolean> {
  if (!shouldEvictFromDialQueueForDisposition(disposition)) return false;
  const removed = await clearLeadFromDialQueue(sb, leadId);
  if (!removed) {
    console.warn(`[DialQueue] evict-on-terminal-disposition failed for ${leadId}`);
  }
  return removed;
}

export async function evictFromDialQueueIfAutoCycleStatusStopsImmediateWork(
  sb: SupabaseClientLike,
  leadId: string,
  cycleStatus: string | null | undefined,
): Promise<boolean> {
  if (!shouldEvictFromDialQueueForAutoCycleStatus(cycleStatus)) return false;
  const removed = await clearLeadFromDialQueue(sb, leadId);
  if (!removed) {
    console.warn(`[DialQueue] evict-on-auto-cycle-status failed for ${leadId}`);
  }
  return removed;
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
  persistedUpdates: number;
  details: Array<{
    leadId: string;
    status: "traced" | "skipped" | "failed";
    reason: string;
    phonesSaved: number;
    persisted: boolean;
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
    .select("id, property_id, assigned_to, status, next_action")
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

    if (isDriveByNextAction(row.next_action)) {
      conflictedIds.push(leadId);
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
    persistedUpdates: 0,
    details: [],
  };

  const persistFailureReason = async (row: QueueSkipTraceLeadRow, reason: string): Promise<boolean> => {
    const timestamp = new Date().toISOString();
    let persisted = false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((input.sb.from("leads") as any)
        .update({
          skip_trace_status: "failed",
          skip_trace_last_attempted_at: timestamp,
          skip_trace_last_error: reason.slice(0, 500),
        })
        .eq("id", row.id));
      persisted = !error;
    } catch {}

    if (row.property_id) {
      try {
        const baseFlags = (row.properties?.owner_flags ?? {}) as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await ((input.sb.from("properties") as any)
          .update({
            owner_flags: {
              ...baseFlags,
              skip_trace_failure_reason: reason,
              skip_trace_failed_at: timestamp,
            },
            updated_at: timestamp,
          })
          .eq("id", row.property_id));
        persisted = persisted || !error;
      } catch {}
    }

    return persisted;
  };

  const clearFailureReason = async (row: QueueSkipTraceLeadRow): Promise<boolean> => {
    if (!row.property_id) return false;
    const timestamp = new Date().toISOString();
    const baseFlags = (row.properties?.owner_flags ?? {}) as Record<string, unknown>;
    const nextFlags = { ...baseFlags } as Record<string, unknown>;
    delete nextFlags.skip_trace_failure_reason;
    delete nextFlags.skip_trace_failed_at;
    delete nextFlags.skip_trace_last_error;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((input.sb.from("properties") as any)
        .update({ owner_flags: nextFlags, updated_at: timestamp })
        .eq("id", row.property_id));
      return !error;
    } catch {
      return false;
    }
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
        persistedUpdates: 0,
        detail: {
          leadId: row.id,
          status: "skipped",
          reason: "already_traced",
          phonesSaved: 0,
          persisted: false,
        } as QueueSkipTraceSummary["details"][number],
      };
    }

    if (!row.property_id || !row.properties?.address) {
      const persisted = await persistFailureReason(row, "missing_address");
      return {
        tracedNow: 0,
        skippedAlreadyTraced: 0,
        failed: 1,
        phonesSaved: 0,
        persistedUpdates: persisted ? 1 : 0,
        detail: {
          leadId: row.id,
          status: "failed",
          reason: "missing_address",
          phonesSaved: 0,
          persisted,
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
        const persisted = await clearFailureReason(row);
        return {
          tracedNow: 1,
          skippedAlreadyTraced: 0,
          failed: 0,
          phonesSaved: result.phonesPromoted,
          persistedUpdates: persisted ? 1 : 0,
          detail: {
            leadId: row.id,
            status: "traced",
            reason: "completed",
            phonesSaved: result.phonesPromoted,
            persisted: true,
          } as QueueSkipTraceSummary["details"][number],
        };
      }

      if (result.reason === "debounced") {
        return {
          tracedNow: 0,
          skippedAlreadyTraced: 1,
          failed: 0,
          phonesSaved: 0,
          persistedUpdates: 0,
          detail: {
            leadId: row.id,
            status: "skipped",
            reason: "debounced_recent_run",
            phonesSaved: 0,
            persisted: false,
          } as QueueSkipTraceSummary["details"][number],
        };
      }

      const persisted = await persistFailureReason(row, result.reason);
      return {
        tracedNow: 0,
        skippedAlreadyTraced: 0,
        failed: 1,
        phonesSaved: result.phonesPromoted,
        persistedUpdates: persisted ? 1 : 0,
        detail: {
          leadId: row.id,
          status: "failed",
          reason: result.reason,
          phonesSaved: result.phonesPromoted,
          persisted,
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

      const persisted = await persistFailureReason(row, message);
      return {
        tracedNow: 0,
        skippedAlreadyTraced: 0,
        failed: 1,
        phonesSaved: 0,
        persistedUpdates: persisted ? 1 : 0,
        detail: {
          leadId: row.id,
          status: "failed",
          reason: message,
          phonesSaved: 0,
          persisted,
        } as QueueSkipTraceSummary["details"][number],
      };
    }
  });

  for (const result of results) {
    summary.tracedNow += result.tracedNow;
    summary.skippedAlreadyTraced += result.skippedAlreadyTraced;
    summary.failed += result.failed;
    summary.phonesSaved += result.phonesSaved;
    summary.persistedUpdates += result.persistedUpdates ?? 0;
    summary.details.push(result.detail);
  }

  return summary;
}
