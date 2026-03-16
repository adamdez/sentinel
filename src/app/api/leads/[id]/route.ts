import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * PATCH /api/leads/[id]
 *
 * Narrow update route for lead fields that don't have a dedicated endpoint.
 * Currently supports:
 *   - monetizability_score    (number 1-10 | null) — Adam-only manual entry
 *   - dispo_friction_level    (string | null)       — Adam-only manual entry
 *   - decision_maker_note     (string | null)       — written by dossier promote path
 *
 * All writes are authenticated. No automation or AI inference here.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const allowed = [
      "monetizability_score",
      "dispo_friction_level",
      "decision_maker_note",
    ] as const;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) update[key] = body[key] ?? null;
    }

    if (Object.keys(update).length <= 1) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    // Validate monetizability_score range
    if ("monetizability_score" in body && body.monetizability_score !== null) {
      const val = Number(body.monetizability_score);
      if (!Number.isInteger(val) || val < 1 || val > 10) {
        return NextResponse.json({ error: "monetizability_score must be an integer 1-10 or null" }, { status: 400 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("leads") as any)
      .update(update)
      .eq("id", id)
      .select("id, monetizability_score, dispo_friction_level, decision_maker_note")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ lead: data });
  } catch (err) {
    console.error("[API/leads/id] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
