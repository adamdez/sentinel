import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/campaigns/[id]
 * Get campaign details with lead count and progress stats.
 *
 * PATCH /api/campaigns/[id]
 * Update campaign (name, status, audienceFilter, templateId).
 * Status transitions: draft→active, active→paused, paused→active, any→completed, any→cancelled
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign, error } = await (sb.from("campaigns") as any)
    .select("*")
    .eq("id", id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Get campaign lead stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("campaign_leads") as any)
    .select("id, status, current_touch, last_touch_at")
    .eq("campaign_id", id);

  const stats = {
    total: leads?.length ?? 0,
    pending: leads?.filter((l: Record<string, unknown>) => l.status === "pending").length ?? 0,
    in_progress: leads?.filter((l: Record<string, unknown>) => l.status === "in_progress").length ?? 0,
    completed: leads?.filter((l: Record<string, unknown>) => l.status === "completed").length ?? 0,
    contacted: leads?.filter((l: Record<string, unknown>) => l.status === "contacted").length ?? 0,
    skipped: leads?.filter((l: Record<string, unknown>) => l.status === "skipped").length ?? 0,
  };

  return NextResponse.json({ campaign, stats });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name) updates.name = body.name;
  if (body.status) updates.status = body.status;
  if (body.audienceFilter) updates.audience_filter = body.audienceFilter;
  if (body.templateId !== undefined) updates.template_id = body.templateId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("campaigns") as any)
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "campaign.updated",
    entity_type: "campaign",
    entity_id: id,
    details: { updates: Object.keys(updates).filter((k) => k !== "updated_at") },
  }).catch(() => {});

  return NextResponse.json({ campaign: data });
}
