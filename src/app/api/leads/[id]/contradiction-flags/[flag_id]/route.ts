/**
 * PATCH /api/leads/[id]/contradiction-flags/[flag_id]
 *
 * Update the review status of a single contradiction flag.
 * Used by Adam from Lead Detail or the review surface.
 *
 * Body:
 *   {
 *     status:       "real" | "false_positive" | "resolved"
 *     review_note?: string
 *   }
 *
 * Rules:
 *   - Only transitions from "unreviewed" or "real" are expected (but not enforced)
 *   - review_note is optional; encouraged for false_positive and resolved
 *   - Never auto-updates CRM state
 *
 * BOUNDARY: writes only to lead_contradiction_flags.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

type RouteContext = { params: Promise<{ id: string; flag_id: string }> };

const VALID_STATUSES = new Set(["real", "false_positive", "resolved"]);

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser(
    req.headers.get("authorization")?.replace("Bearer ", "") ?? ""
  );

  let userId = user?.id;
  if (!userId) {
    const { data: { session } } = await sb.auth.getSession();
    userId = session?.user?.id;
  }
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { flag_id } = await params;
  const body = await req.json().catch(() => ({})) as {
    status?:      string;
    review_note?: string;
  };

  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: "status must be one of: real, false_positive, resolved" },
      { status: 400 },
    );
  }

  const patch = {
    status:      body.status,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    ...(body.review_note !== undefined
      ? { review_note: body.review_note.trim().slice(0, 500) || null }
      : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as any;
  const { data, error } = await sbAny
    .from("lead_contradiction_flags")
    .update(patch)
    .eq("id", flag_id)
    .select("id, status, reviewed_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Flag not found" }, { status: 404 });

  return NextResponse.json({ ok: true, flag: data });
}
