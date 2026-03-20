import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { resolveReviewItem } from "@/lib/control-plane";

/**
 * GET /api/control-plane/review-queue
 *
 * List pending review items. Supports filtering by agent_name, entity_type.
 * Default: pending items sorted by priority DESC then created_at ASC.
 *
 * PATCH /api/control-plane/review-queue
 *
 * Approve or reject a review item. On approval, executes the proposed action
 * (e.g., sync dossier to lead, accept/reject facts).
 * Body: { id, status: 'approved'|'rejected', review_notes? }
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const agentName = searchParams.get("agent_name");
  const entityType = searchParams.get("entity_type");
  const status = searchParams.get("status") ?? "pending";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("review_queue") as any)
    .select("*")
    .eq("status", status)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (agentName) query = query.eq("agent_name", agentName);
  if (entityType) query = query.eq("entity_type", entityType);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: data?.length ?? 0 });
}

export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, status, review_notes } = body;

  if (!id || !status || !["approved", "rejected"].includes(status)) {
    return NextResponse.json(
      { error: "Required: id, status ('approved' or 'rejected')" },
      { status: 422 }
    );
  }

  try {
    const result = await resolveReviewItem(id, status, user.id, review_notes);
    return NextResponse.json({ data: { id, status, ...result } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const is404 = msg.includes("not found") || msg.includes("already resolved");
    return NextResponse.json(
      { error: msg },
      { status: is404 ? 404 : 500 }
    );
  }
}
