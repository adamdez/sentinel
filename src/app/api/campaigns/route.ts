import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/campaigns
 * List campaigns with optional status filter.
 *
 * POST /api/campaigns
 * Create a new outbound call campaign.
 * Body: { name, campaignType, audienceFilter?, templateId?, cadence? }
 *
 * Campaign types: "cold_call", "follow_up", "reactivation", "custom"
 * Cadence: { touchCount: number, intervalDays: number, channels: string[] }
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("campaigns") as any).select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, campaignType, audienceFilter, templateId, cadence } = body as {
    name: string;
    campaignType: string;
    audienceFilter?: Record<string, unknown>;
    templateId?: string;
    cadence?: { touchCount: number; intervalDays: number; channels: string[] };
  };

  if (!name || !campaignType) {
    return NextResponse.json({ error: "name and campaignType required" }, { status: 400 });
  }

  const VALID_TYPES = ["cold_call", "follow_up", "reactivation", "custom"];
  if (!VALID_TYPES.includes(campaignType)) {
    return NextResponse.json({ error: `Invalid campaignType. Must be: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("campaigns") as any)
    .insert({
      name,
      campaign_type: campaignType,
      status: "draft",
      audience_filter: audienceFilter ?? {},
      template_id: templateId ?? null,
      created_by: user.id,
      // Store cadence config in audience_filter for now (campaigns table is lean)
      ...(cadence ? { audience_filter: { ...audienceFilter, cadence } } : {}),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "campaign.created",
    entity_type: "campaign",
    entity_id: data.id,
    details: { name, campaignType },
  }).catch(() => {});

  return NextResponse.json({ campaign: data }, { status: 201 });
}
