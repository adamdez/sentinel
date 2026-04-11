export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { DEEP_DIVE_READY_NEXT_ACTION, evaluateDeepDiveReadiness } from "@/lib/deep-dive";
import type { UnifiedResearchMetadata } from "@/lib/research-run-types";

type RouteContext = { params: Promise<{ lead_id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const authHeader = req.headers.get("authorization");
  const user = await getDialerUser(authHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_id } = await params;
  if (!lead_id) return NextResponse.json({ error: "lead_id is required" }, { status: 400 });

  const body = await req.json().catch(() => ({} as { next_action?: string; next_action_due_at?: string }));
  const nextAction = typeof body.next_action === "string" && body.next_action.trim().length > 0
    ? body.next_action.trim()
    : DEEP_DIVE_READY_NEXT_ACTION;
  const nextActionDueAt = typeof body.next_action_due_at === "string" && !Number.isNaN(new Date(body.next_action_due_at).getTime())
    ? body.next_action_due_at
    : new Date().toISOString();

  const sb = createDialerClient(authHeader);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select("id, assigned_to, status")
    .eq("id", lead_id)
    .maybeSingle();

  if (leadErr) {
    return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (lead.assigned_to !== user.id) {
    return NextResponse.json({ error: "Lead must be assigned to you" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dossier, error: dossierErr } = await (sb.from("dossiers") as any)
    .select("likely_decision_maker, raw_ai_output, created_at")
    .eq("lead_id", lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dossierErr) {
    return NextResponse.json({ error: "Failed to load research status" }, { status: 500 });
  }

  const raw = (dossier?.raw_ai_output as Record<string, unknown> | null) ?? null;
  const metadata = raw && typeof raw.research_run === "object"
    ? raw.research_run as UnifiedResearchMetadata
    : null;
  const readiness = evaluateDeepDiveReadiness({
    research_quality: metadata?.run_quality ?? null,
    research_gap_count: metadata?.research_gaps?.length ?? 0,
    likely_decision_maker:
      (typeof dossier?.likely_decision_maker === "string" ? dossier.likely_decision_maker : null)
      ?? metadata?.people_intel?.next_of_kin?.[0]?.name
      ?? null,
  });

  if (!readiness.ready) {
    return NextResponse.json({
      error: "Deep Dive prep is not ready to return to calling.",
      blockers: readiness.blockers,
    }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb.from("leads") as any)
    .update({
      next_action: nextAction,
      next_action_due_at: nextActionDueAt,
    })
    .eq("id", lead_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dialer_events") as any)
    .insert({
      event_type: "queue.deep_dive.ready",
      user_id: user.id,
      lead_id,
      metadata: {
        next_action: nextAction,
        next_action_due_at: nextActionDueAt,
      },
    });

  return NextResponse.json({
    ok: true,
    lead_id,
    next_action: nextAction,
    next_action_due_at: nextActionDueAt,
  });
}
