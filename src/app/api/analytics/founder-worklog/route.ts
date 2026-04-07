import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { computeFounderHoursFromWorkLogs } from "@/lib/founder-worklog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await getAuthenticatedUser(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const from = req.nextUrl.searchParams.get("from")
    ?? new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const to = req.nextUrl.searchParams.get("to") ?? now.toISOString();

  const queryUserId = req.nextUrl.searchParams.get("user_id");
  const scopeUserIds = queryUserId ? [queryUserId] : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("founder_work_logs") as any)
    .select("id, user_id, started_at, ended_at, source, note, metadata, created_at, updated_at")
    .lt("started_at", to)
    .or(`ended_at.is.null,ended_at.gte.${from}`)
    .order("started_at", { ascending: false });

  if (scopeUserIds && scopeUserIds.length > 0) {
    query = query.in("user_id", scopeUserIds);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string | null;
    started_at: string | null;
    ended_at: string | null;
    source: string | null;
    note: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
  }>;

  const summaryUserIds = scopeUserIds
    ?? Array.from(
      new Set(
        rows
          .map((row) => row.user_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );

  const total = computeFounderHoursFromWorkLogs(rows, from, to, summaryUserIds);
  const byUser = summaryUserIds.map((id) => ({
    user_id: id,
    ...computeFounderHoursFromWorkLogs(rows, from, to, [id]),
  }));

  return NextResponse.json({
    from,
    to,
    rows,
    summary: {
      founderHours: total.founderHours,
      totalMinutes: total.totalMinutes,
      rawIntervals: total.rawIntervals,
      mergedIntervals: total.mergedIntervals,
      byUser,
    },
  });
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await getAuthenticatedUser(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const targetUserId = typeof body.user_id === "string" && body.user_id.length > 0 ? body.user_id : user.id;

  const startedAt = typeof body.started_at === "string" ? body.started_at : new Date().toISOString();
  const endedAt = typeof body.ended_at === "string" ? body.ended_at : null;
  const source = typeof body.source === "string" && body.source.trim().length > 0 ? body.source.trim() : "manual";
  const note = typeof body.note === "string" ? body.note.trim() : null;

  const startedMs = new Date(startedAt).getTime();
  const endedMs = endedAt ? new Date(endedAt).getTime() : null;
  if (!Number.isFinite(startedMs)) {
    return NextResponse.json({ error: "Invalid started_at" }, { status: 400 });
  }
  if (endedMs != null && !Number.isFinite(endedMs)) {
    return NextResponse.json({ error: "Invalid ended_at" }, { status: 400 });
  }
  if (endedMs != null && endedMs <= startedMs) {
    return NextResponse.json({ error: "ended_at must be after started_at" }, { status: 400 });
  }

  const record = {
    user_id: targetUserId,
    started_at: startedAt,
    ended_at: endedAt,
    source,
    note,
    metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {},
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("founder_work_logs") as any)
    .insert(record)
    .select("id, user_id, started_at, ended_at, source, note, metadata, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data }, { status: 201 });
}
