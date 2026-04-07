import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_EMAILS = [
  "adam@dominionhomedeals.com",
  "nathan@dominionhomedeals.com",
  "logan@dominionhomedeals.com",
];

async function requireAdmin(req: NextRequest) {
  const sb = createServerClient();
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && cronSecret === `Bearer ${expectedSecret}`) {
    return { ok: true, sb };
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user?.email && ADMIN_EMAILS.includes(user.email)) {
    return { ok: true, sb };
  }
  return { ok: false, sb };
}

type ScoutEventDetails = {
  source_system?: string;
  source_run_id?: string;
  source_record_id?: string;
  ingest_mode?: string;
  ingest_status?: "created" | "enriched" | "skipped" | "failed";
  failure_reason?: string | null;
  entity_ids?: {
    property_id?: string | null;
    lead_id?: string | null;
  };
  persisted_updates?: number;
};

function asDetails(value: unknown): ScoutEventDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ScoutEventDetails;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = auth.sb;
  const url = new URL(req.url);
  const runId = (url.searchParams.get("runId") ?? "").trim();
  const sourceSystem = (url.searchParams.get("sourceSystem") ?? "").trim();
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "500", 10) || 500, 50), 5000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("event_log") as any)
    .select("id, created_at, details")
    .eq("action", "SCOUT_INGEST")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ id: string; created_at: string; details: unknown }>;
  const filtered = rows.filter((row) => {
    const details = asDetails(row.details);
    if (runId && details.source_run_id !== runId) return false;
    if (sourceSystem && details.source_system !== sourceSystem) return false;
    return true;
  });

  const counters = {
    total_candidates: filtered.length,
    leads_created: 0,
    client_files_enriched: 0,
    skipped: 0,
    failed: 0,
    persisted_updates: 0,
  };
  const failureReasons = new Map<string, number>();

  const items = filtered.map((row) => {
    const details = asDetails(row.details);
    const status = details.ingest_status ?? "failed";
    const failureReason = details.failure_reason ?? null;
    const persistedUpdates = typeof details.persisted_updates === "number" ? details.persisted_updates : 0;

    counters.persisted_updates += persistedUpdates;
    if (status === "created") counters.leads_created += 1;
    if (status === "enriched") counters.client_files_enriched += 1;
    if (status === "skipped") counters.skipped += 1;
    if (status === "failed") counters.failed += 1;

    if (failureReason) {
      failureReasons.set(failureReason, (failureReasons.get(failureReason) ?? 0) + 1);
    }

    return {
      id: row.id,
      created_at: row.created_at,
      source_system: details.source_system ?? null,
      source_run_id: details.source_run_id ?? null,
      source_record_id: details.source_record_id ?? null,
      ingest_mode: details.ingest_mode ?? null,
      ingest_status: status,
      failure_reason: failureReason,
      persisted_updates: persistedUpdates,
      entity_ids: details.entity_ids ?? { property_id: null, lead_id: null },
    };
  });

  const topFailureReasons = Array.from(failureReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  return NextResponse.json({
    ok: true,
    filters: { runId: runId || null, sourceSystem: sourceSystem || null, limit },
    summary: counters,
    top_failure_reasons: topFailureReasons,
    items,
  });
}

