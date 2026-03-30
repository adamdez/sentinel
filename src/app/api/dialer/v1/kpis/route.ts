export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import {
  aggregateDialerKpis,
  resolveDialerKpiRange,
  type DialerKpiCallRecord,
} from "@/lib/dialer-kpis";

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const range = resolveDialerKpiRange({
    preset: params.get("preset"),
    from: params.get("from"),
    to: params.get("to"),
  });

  try {
    const sb = createDialerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callsQuery = (sb.from("calls_log") as any)
      .select("user_id, direction, disposition, duration_sec, started_at")
      .order("started_at", { ascending: true });

    if (range.from) callsQuery.gte("started_at", range.from);
    if (range.to) callsQuery.lte("started_at", range.to);

    const [{ data: callRows, error: callsError }, { data: teamRows, error: teamError }] = await Promise.all([
      callsQuery,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.from("user_profiles") as any)
        .select("id, role, is_active")
        .in("role", ["admin", "agent"])
        .eq("is_active", true),
    ]);

    if (callsError) {
      console.error("[dialer/kpis] calls query failed:", callsError);
      return NextResponse.json({ error: "Failed to load dialer KPI calls" }, { status: 500 });
    }

    const teamUserIds =
      teamError || !teamRows
        ? null
        : (teamRows as Array<{ id: string }>).map((row) => row.id);

    const snapshot = aggregateDialerKpis({
      calls: (callRows ?? []) as DialerKpiCallRecord[],
      userId: user.id,
      teamUserIds,
      range,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[dialer/kpis] unexpected failure:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
