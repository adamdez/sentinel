import type { AuditLogEntry } from "./types";
import { generateId } from "./utils";

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

  // TODO: Flush to database in batches
  if (auditBuffer.length >= 50) {
    flushAuditLog();
  }

  return entry;
}

export async function flushAuditLog(): Promise<void> {
  const entries = auditBuffer.splice(0, auditBuffer.length);
  if (entries.length === 0) return;

  // TODO: POST to /api/audit endpoint
  console.debug(`[Audit] Flushing ${entries.length} entries`);
}

export function getRecentAuditEntries(limit = 50): AuditLogEntry[] {
  return auditBuffer.slice(-limit);
}
