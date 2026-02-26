import { NextRequest, NextResponse } from "next/server";
import type { AuditLogEntry } from "@/lib/types";

/**
 * GET /api/audit
 *
 * Returns recent audit log entries. Supports pagination.
 * Domain: Analytics Domain — read-only, never mutates operational data.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // TODO: Query audit_log table with pagination
  // TODO: RBAC check — only admin and viewer with audit:read permission

  const stubEntries: AuditLogEntry[] = [
    {
      id: "audit-001",
      user_id: "user-adam",
      action: "lead.promoted",
      entity_type: "lead_instance",
      entity_id: "lead-001",
      details: { property_id: "prop-001", score: 94, model_version: "v1.1" },
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "audit-002",
      user_id: "user-adam",
      action: "call.initiated",
      entity_type: "lead_instance",
      entity_id: "lead-001",
      details: { phone: "+16025550142", duration_seconds: 145 },
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "audit-003",
      user_id: "system",
      action: "ingest.processed",
      entity_type: "distress_event",
      entity_id: "event-batch-001",
      details: { source: "probate_scraper", records_processed: 12 },
      created_at: new Date(Date.now() - 10800000).toISOString(),
    },
  ];

  return NextResponse.json({
    entries: stubEntries.slice(offset, offset + limit),
    total: stubEntries.length,
    limit,
    offset,
  });
}

/**
 * POST /api/audit
 *
 * Receives audit log entries in batch for persistence.
 */
export async function POST(request: NextRequest) {
  try {
    const { entries } = (await request.json()) as { entries: AuditLogEntry[] };

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "entries[] required" },
        { status: 400 }
      );
    }

    // TODO: Bulk insert into audit_log table
    // TODO: Append-only — no updates or deletes allowed

    return NextResponse.json({
      success: true,
      persisted: entries.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Audit] Error persisting entries:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
