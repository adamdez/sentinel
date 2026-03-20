import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/campaigns/[id]/leads
 * List leads assigned to this campaign with touch progress.
 *
 * POST /api/campaigns/[id]/leads
 * Add leads to a campaign. Accepts { leadIds: string[] } or { filter: {...} }.
 * Automatically checks DNC status and skips flagged leads.
 *
 * DELETE /api/campaigns/[id]/leads
 * Remove leads from campaign. Body: { leadIds: string[] }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("campaign_leads") as any)
    .select("*, leads(id, first_name, last_name, phone, status, next_action, property_id)")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  let leadIds: string[] = [];

  if (body.leadIds && Array.isArray(body.leadIds)) {
    leadIds = body.leadIds;
  } else if (body.filter) {
    // Build lead query from filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("leads") as any).select("id");

    if (body.filter.status) query = query.eq("status", body.filter.status);
    if (body.filter.source) query = query.eq("source", body.filter.source);
    if (body.filter.county) {
      query = query.not("property_id", "is", null);
    }
    query = query.limit(body.filter.limit ?? 200);

    const { data: filteredLeads } = await query;
    leadIds = (filteredLeads ?? []).map((l: Record<string, unknown>) => l.id as string);
  }

  if (leadIds.length === 0) {
    return NextResponse.json({ error: "No leads to add" }, { status: 400 });
  }

  // Check DNC status — skip any lead whose contact has dnc_status = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dncLeads } = await (sb.from("leads") as any)
    .select("id, phone")
    .in("id", leadIds);

  const phones = (dncLeads ?? [])
    .map((l: Record<string, unknown>) => l.phone as string)
    .filter(Boolean);

  let dncPhones = new Set<string>();
  if (phones.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dncContacts } = await (sb.from("contacts") as any)
      .select("phone")
      .in("phone", phones)
      .eq("dnc_status", true);

    dncPhones = new Set((dncContacts ?? []).map((c: Record<string, unknown>) => c.phone as string));
  }

  // Also check leads table for opt_out
  const dncLeadIds = new Set(
    (dncLeads ?? [])
      .filter((l: Record<string, unknown>) => l.phone && dncPhones.has(l.phone as string))
      .map((l: Record<string, unknown>) => l.id as string),
  );

  // Check for existing campaign_leads to avoid duplicates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("campaign_leads") as any)
    .select("lead_id")
    .eq("campaign_id", id)
    .in("lead_id", leadIds);

  const existingIds = new Set((existing ?? []).map((e: Record<string, unknown>) => e.lead_id as string));

  const toInsert = leadIds
    .filter((lid) => !existingIds.has(lid))
    .map((lid) => ({
      campaign_id: id,
      lead_id: lid,
      status: dncLeadIds.has(lid) ? "skipped" : "pending",
      current_touch: 0,
      skip_reason: dncLeadIds.has(lid) ? "dnc" : null,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({ added: 0, skipped: 0, duplicates: leadIds.length });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("campaign_leads") as any).insert(toInsert);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const added = toInsert.filter((r) => r.status === "pending").length;
  const skippedDnc = toInsert.filter((r) => r.status === "skipped").length;

  // Update campaign sent_count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("campaigns") as any)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "campaign.leads_added",
    entity_type: "campaign",
    entity_id: id,
    details: { added, skippedDnc, duplicates: existingIds.size },
  }).catch(() => {});

  return NextResponse.json({ added, skippedDnc, duplicates: existingIds.size });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { leadIds } = body as { leadIds: string[] };

  if (!leadIds || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("campaign_leads") as any)
    .delete()
    .eq("campaign_id", id)
    .in("lead_id", leadIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ removed: leadIds.length });
}
