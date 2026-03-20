/**
 * POST /api/dialer/v1/sessions/[id]/promote-facts
 *
 * Promotes confirmed session_extracted_facts from a call session
 * into the intelligence pipeline (dossier_artifacts + fact_assertions).
 *
 * This is the bridge between the dialer domain (volatile) and the
 * intelligence layer (durable). Only operator-confirmed facts are promoted.
 *
 * Write path:
 *   session_extracted_facts → dossier_artifacts → fact_assertions → [review]
 *
 * Returns: { ok, promoted, contradictions, results[] }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDialerUser } from "@/lib/dialer/db";
import { createServerClient } from "@/lib/supabase";
import { promoteAllSessionFacts } from "@/lib/session-fact-promotion";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;

  // Verify session exists and belongs to this user
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session } = await (sb.from("call_sessions") as any)
    .select("id, lead_id, user_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session.lead_id) {
    return NextResponse.json(
      { error: "Session has no linked lead — cannot promote facts" },
      { status: 422 },
    );
  }

  try {
    const result = await promoteAllSessionFacts(
      sessionId,
      session.lead_id,
      user.id,
    );

    return NextResponse.json({
      ok: true,
      promoted: result.promoted,
      contradictions: result.contradictions,
      results: result.results.map(r => ({
        artifactId: r.artifactId,
        factId: r.factResult.factId,
        contradictions: r.factResult.contradictions,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dialer/promote-facts] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
