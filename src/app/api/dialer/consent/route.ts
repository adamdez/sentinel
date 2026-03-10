import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

type ConsentBody = {
  leadId?: string;
};

/**
 * POST /api/dialer/consent
 *
 * Records one-time call consent for a lead from the dialer flow.
 * Keeps write logic server-side so auth + audit stays consistent.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ConsentBody;
  try {
    body = (await req.json()) as ConsentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leadId = body.leadId;
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const grantedAt = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateErr } = await (sb.from("leads") as any)
    .update({
      call_consent: true,
      call_consent_at: grantedAt,
    })
    .eq("id", leadId)
    .select("id")
    .single();

  if (updateErr) {
    console.error("[Dialer/consent] Lead update failed:", updateErr);
    return NextResponse.json({ error: "Failed to save consent" }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Non-blocking audit event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "dialer.consent_granted",
    entity_type: "lead",
    entity_id: leadId,
    details: {
      granted_at: grantedAt,
    },
  }).then(({ error: auditErr }: { error: unknown }) => {
    if (auditErr) {
      console.error("[Dialer/consent] Audit log failed (non-fatal):", auditErr);
    }
  });

  return NextResponse.json({
    success: true,
    leadId,
    call_consent: true,
    call_consent_at: grantedAt,
  });
}
