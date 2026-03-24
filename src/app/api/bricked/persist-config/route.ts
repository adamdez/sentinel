import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/bricked/persist-config
 *
 * Merges caller-supplied keys into properties.owner_flags for a given lead.
 * Used by the Bricked panel to persist deal config, repair edits, and comp selection
 * without re-calling the Bricked API.
 *
 * Body: { leadId: string, [key]: value, ... }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const {
    data: { user },
  } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { leadId, ...patch } = body as { leadId: string; [key: string]: unknown };

    if (!leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400 });
    }

    const allowedKeys = new Set([
      "deal_config",
      "bricked_repairs_edited",
      "bricked_comp_selection",
    ]);
    const safePatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (allowedKeys.has(k)) safePatch[k] = v;
    }
    if (Object.keys(safePatch).length === 0) {
      return NextResponse.json({ ok: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("property_id")
      .eq("id", leadId)
      .single();
    const propertyId = lead?.property_id as string | undefined;
    if (!propertyId) {
      return NextResponse.json({ error: "Lead or property not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prop } = await (sb.from("properties") as any)
      .select("owner_flags")
      .eq("id", propertyId)
      .single();

    const merged = {
      ...((prop?.owner_flags as Record<string, unknown>) ?? {}),
      ...safePatch,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any)
      .update({ owner_flags: merged })
      .eq("id", propertyId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[bricked/persist-config] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
