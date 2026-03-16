import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import {
  getSourcePolicies,
  POLICY_LABELS,
  POLICY_DESCRIPTIONS,
} from "@/lib/source-policy";
import type { SourcePolicy } from "@/lib/source-policy";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/source-policies
 *
 * Returns all source policy rows for the admin UI.
 * Each row includes: source_type, policy, rationale, updated_at.
 * Also returns the policy labels and descriptions for the UI to render.
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const policies = await getSourcePolicies();

    return NextResponse.json({
      policies,
      meta: {
        policy_labels:       POLICY_LABELS,
        policy_descriptions: POLICY_DESCRIPTIONS,
      },
    });
  } catch (err) {
    console.error("[API/settings/source-policies] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/source-policies
 *
 * Updates the policy for one source type.
 * Body: { source_type: string, policy: "approved"|"review_required"|"blocked", rationale?: string }
 *
 * Uses upsert so this works even if the seed migration hasn't run yet.
 */
export async function PATCH(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const sourceType = (body.source_type ?? "").trim();
    if (!sourceType) {
      return NextResponse.json({ error: "source_type is required" }, { status: 400 });
    }

    const policy: SourcePolicy = body.policy;
    if (!["approved", "review_required", "blocked"].includes(policy)) {
      return NextResponse.json(
        { error: "policy must be one of: approved, review_required, blocked" },
        { status: 400 }
      );
    }

    const rationale = (body.rationale ?? "").trim() || null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("source_policies") as any)
      .upsert(
        {
          source_type: sourceType,
          policy,
          rationale,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source_type" }
      )
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ policy_row: data });
  } catch (err) {
    console.error("[API/settings/source-policies] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
