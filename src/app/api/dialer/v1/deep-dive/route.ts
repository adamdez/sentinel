export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { DEEP_DIVE_NEXT_ACTION, isDeepDiveNextAction } from "@/lib/deep-dive";

type DeepDiveLeadRow = {
  id: string;
  status: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  last_contact_at: string | null;
  total_calls: number | null;
  notes: string | null;
  created_at: string;
  properties: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    owner_name: string | null;
    owner_phone: string | null;
  } | null;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const user = await getDialerUser(authHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createDialerClient(authHeader);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads, error: leadErr } = await (sb.from("leads") as any)
    .select(`
      id,
      status,
      next_action,
      next_action_due_at,
      last_contact_at,
      total_calls,
      notes,
      created_at,
      properties (
        address,
        city,
        state,
        zip,
        county,
        owner_name,
        owner_phone
      )
    `)
    .eq("assigned_to", user.id)
    .ilike("next_action", `${DEEP_DIVE_NEXT_ACTION}%`)
    .not("status", "in", '("dead","closed")')
    .order("next_action_due_at", { ascending: true, nullsFirst: false })
    .limit(200);

  if (leadErr) {
    console.error("[deep-dive] lead query failed:", leadErr.message);
    return NextResponse.json({ error: "Failed to load deep-dive queue" }, { status: 500 });
  }

  const deepDiveLeads = ((leads ?? []) as DeepDiveLeadRow[]).filter((lead) => isDeepDiveNextAction(lead.next_action));
  const leadIds = deepDiveLeads.map((lead) => lead.id);

  let latestEventByLead = new Map<string, { created_at: string; reason: string | null }>();
  let dossierStatusByLead = new Map<string, string | null>();
  let prepStatusByLead = new Map<string, string | null>();

  if (leadIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events } = await (sb.from("dialer_events") as any)
      .select("lead_id, created_at, metadata")
      .eq("event_type", "queue.deep_dive")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    for (const event of (events ?? []) as Array<{ lead_id: string; created_at: string; metadata?: { reason?: string | null } }>) {
      if (!latestEventByLead.has(event.lead_id)) {
        latestEventByLead.set(event.lead_id, {
          created_at: event.created_at,
          reason: typeof event.metadata?.reason === "string" && event.metadata.reason.trim().length > 0
            ? event.metadata.reason.trim()
            : null,
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dossiers } = await (sb.from("dossiers") as any)
      .select("lead_id, status, created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    for (const dossier of (dossiers ?? []) as Array<{ lead_id: string; status: string | null }>) {
      if (!dossierStatusByLead.has(dossier.lead_id)) {
        dossierStatusByLead.set(dossier.lead_id, dossier.status ?? null);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prepFrames } = await (sb.from("outbound_prep_frames") as any)
      .select("lead_id, review_status, created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    for (const frame of (prepFrames ?? []) as Array<{ lead_id: string; review_status: string | null }>) {
      if (!prepStatusByLead.has(frame.lead_id)) {
        prepStatusByLead.set(frame.lead_id, frame.review_status ?? null);
      }
    }
  }

  const items = deepDiveLeads.map((lead) => {
    const parkedEvent = latestEventByLead.get(lead.id);
    return {
      id: lead.id,
      status: lead.status,
      next_action: lead.next_action,
      next_action_due_at: lead.next_action_due_at,
      last_contact_at: lead.last_contact_at,
      total_calls: lead.total_calls ?? 0,
      notes: lead.notes,
      parked_at: parkedEvent?.created_at ?? null,
      parked_reason: parkedEvent?.reason ?? null,
      latest_dossier_status: dossierStatusByLead.get(lead.id) ?? null,
      latest_prep_status: prepStatusByLead.get(lead.id) ?? null,
      properties: lead.properties,
    };
  });

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    items,
  });
}
