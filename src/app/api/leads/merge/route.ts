import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * POST /api/leads/merge
 *
 * Merge two duplicate leads into one. The "winner" keeps its ID.
 * The "loser" lead's related records (calls, tasks, deals, artifacts, facts)
 * are reassigned to the winner, then the loser is soft-deleted (status: dead).
 *
 * Body: {
 *   winnerId: string,  // Lead ID to keep
 *   loserId: string,   // Lead ID to merge into winner then deactivate
 * }
 *
 * Merge strategy:
 * - Winner keeps its own field values where non-null
 * - Loser's non-null fields fill winner's null fields (enrich, not overwrite)
 * - All calls_log, tasks, deals, dossier_artifacts, fact_assertions,
 *   dialer_sessions, campaign_leads reassigned to winner
 * - Loser set to status: "dead" with merge metadata
 * - Full audit trail in event_log
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { winnerId, loserId } = body as { winnerId: string; loserId: string };

  if (!winnerId || !loserId) {
    return NextResponse.json({ error: "winnerId and loserId required" }, { status: 400 });
  }
  if (winnerId === loserId) {
    return NextResponse.json({ error: "Cannot merge a lead with itself" }, { status: 400 });
  }

  // Fetch both leads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: winner } = await (sb.from("leads") as any)
    .select("*")
    .eq("id", winnerId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: loser } = await (sb.from("leads") as any)
    .select("*")
    .eq("id", loserId)
    .single();

  if (!winner) return NextResponse.json({ error: "Winner lead not found" }, { status: 404 });
  if (!loser) return NextResponse.json({ error: "Loser lead not found" }, { status: 404 });

  const now = new Date().toISOString();

  // ── Step 1: Enrich winner with loser's non-null fields ──
  const enrichFields = [
    "phone", "email", "first_name", "last_name", "source",
    "notes", "next_action", "next_follow_up_at", "next_call_scheduled_at",
    "seller_situation_summary_short", "recommended_call_angle",
    "likely_decision_maker", "top_fact_1", "top_fact_2", "top_fact_3",
  ];

  const enrichUpdates: Record<string, unknown> = { updated_at: now };
  for (const field of enrichFields) {
    if (winner[field] === null && loser[field] !== null) {
      enrichUpdates[field] = loser[field];
    }
  }

  // Merge notes (append loser's notes)
  if (loser.notes && winner.notes) {
    enrichUpdates.notes = `${winner.notes}\n\n--- Merged from duplicate ---\n${loser.notes}`;
  }

  // Take higher call counts
  if ((loser.total_calls ?? 0) > 0) {
    enrichUpdates.total_calls = (winner.total_calls ?? 0) + (loser.total_calls ?? 0);
  }
  if ((loser.live_answers ?? 0) > 0) {
    enrichUpdates.live_answers = (winner.live_answers ?? 0) + (loser.live_answers ?? 0);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("leads") as any)
    .update(enrichUpdates)
    .eq("id", winnerId);

  // ── Step 2: Reassign related records ──
  const reassignTables = [
    { table: "calls_log", column: "lead_id" },
    { table: "tasks", column: "lead_id" },
    { table: "deals", column: "lead_id" },
    { table: "dossier_artifacts", column: "lead_id" },
    { table: "fact_assertions", column: "lead_id" },
    { table: "dialer_sessions", column: "lead_id" },
    { table: "campaign_leads", column: "lead_id" },
    { table: "voice_sessions", column: "lead_id" },
    { table: "event_log", column: "entity_id" },
  ];

  const reassignCounts: Record<string, number> = {};

  for (const { table, column } of reassignTables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (sb.from(table) as any)
        .update({ [column]: winnerId })
        .eq(column, loserId);
      reassignCounts[table] = count ?? 0;
    } catch {
      reassignCounts[table] = -1; // Table may not exist yet
    }
  }

  // ── Step 3: Deactivate loser ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("leads") as any)
    .update({
      status: "dead",
      next_action: null,
      notes: `[MERGED] Merged into lead ${winnerId} on ${now}. Original status: ${loser.status}`,
      updated_at: now,
    })
    .eq("id", loserId);

  // ── Step 4: Audit log ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "lead.merged",
    entity_type: "lead",
    entity_id: winnerId,
    details: {
      winnerId,
      loserId,
      loserStatus: loser.status,
      fieldsEnriched: Object.keys(enrichUpdates).filter((k) => k !== "updated_at"),
      reassignCounts,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    winnerId,
    loserId,
    fieldsEnriched: Object.keys(enrichUpdates).filter((k) => k !== "updated_at").length,
    reassignCounts,
  });
}
