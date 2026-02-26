import type { AuditLogEntry } from "./types";
import { generateId } from "./utils";
import { supabase } from "./supabase";

export type AuditAction =
  | "lead.created"
  | "lead.updated"
  | "lead.assigned"
  | "lead.status_changed"
  | "lead.promoted"
  | "lead.suppressed"
  | "contact.created"
  | "contact.updated"
  | "call.initiated"
  | "call.completed"
  | "score.computed"
  | "score.replayed"
  | "ingest.received"
  | "ingest.processed"
  | "settings.changed"
  | "user.login"
  | "user.logout"
  | "compliance.dnc_check"
  | "compliance.blocked";

const auditBuffer: AuditLogEntry[] = [];

export function logAudit(
  userId: string,
  action: AuditAction,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {}
): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: generateId(),
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    created_at: new Date().toISOString(),
  };

  auditBuffer.push(entry);

  if (auditBuffer.length >= 50) {
    flushAuditLog();
  }

  return entry;
}

export async function flushAuditLog(): Promise<void> {
  const entries = auditBuffer.splice(0, auditBuffer.length);
  if (entries.length === 0) return;

  try {
    const rows = entries.map((e) => ({
      user_id: e.user_id,
      action: e.action,
      entity_type: e.entity_type,
      entity_id: e.entity_id,
      details: e.details,
    }));

    // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("event_log") as any)
      .insert(rows) as { error: { message: string } | null };
    if (error) {
      console.warn("[Audit] Supabase flush failed:", error.message);
      auditBuffer.unshift(...entries);
    } else {
      console.debug(`[Audit] Flushed ${entries.length} entries to Supabase`);
    }
  } catch {
    console.warn("[Audit] Supabase not available — entries buffered locally");
    auditBuffer.unshift(...entries);
  }
}

export function getRecentAuditEntries(limit = 50): AuditLogEntry[] {
  return auditBuffer.slice(-limit);
}

export async function fetchAuditLog(
  filters: { userId?: string; entityType?: string; action?: string; limit?: number } = {}
) {
  const { userId, entityType, action, limit = 100 } = filters;

  // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("event_log") as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) query = query.eq("user_id", userId);
  if (entityType) query = query.eq("entity_type", entityType);
  if (action) query = query.eq("action", action);

  const { data, error } = await query as { data: Record<string, unknown>[] | null; error: { message: string } | null };
  if (error) {
    console.warn("[Audit] Failed to fetch:", error.message);
    return [];
  }
  return data ?? [];
}
