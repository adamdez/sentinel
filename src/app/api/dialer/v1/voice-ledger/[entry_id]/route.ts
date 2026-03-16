/**
 * PATCH /api/dialer/v1/voice-ledger/[entry_id]
 *
 * Operator review/correction for a voice_interaction_ledger row.
 * Allows Adam to mark entries as reviewed, corrected, or dismissed,
 * and optionally update consent_basis, automation_tier, or risk_tier.
 *
 * Body:
 *   {
 *     review_status:   "reviewed" | "corrected" | "dismissed"
 *     review_note?:    string
 *     // Optional corrections (operator overrides computed values):
 *     consent_basis?:    string
 *     automation_tier?:  string
 *     dnc_flag?:         boolean
 *   }
 *
 * If consent_basis, automation_tier, or dnc_flag are corrected,
 * risk_tier is re-derived deterministically from the updated values.
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { deriveRiskTier, type ConsentBasis, type AutomationTier } from "@/lib/voice-consent";

const VALID_REVIEW_STATUSES = ["reviewed", "corrected", "dismissed"] as const;
const VALID_CONSENT_BASES   = ["inbound_response", "prior_opt_in", "marketing_list", "referral", "unknown"] as const;
const VALID_AUTO_TIERS      = ["operator_led", "ai_assisted", "automation_prep"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entry_id: string }> }
) {
  try {
    const sb   = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { entry_id } = await params;
    const body = await req.json().catch(() => ({}));

    const reviewStatus = body.review_status as string | undefined;
    if (!reviewStatus || !(VALID_REVIEW_STATUSES as readonly string[]).includes(reviewStatus)) {
      return NextResponse.json(
        { error: `review_status must be one of: ${VALID_REVIEW_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch current row to merge corrections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchErr } = await (sb.from("voice_interaction_ledger") as any)
      .select("consent_basis, automation_tier, dnc_flag, ai_assisted")
      .eq("id", entry_id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Ledger entry not found" }, { status: 404 });
    }

    const patch: Record<string, unknown> = {
      review_status: reviewStatus,
      review_note:   (body.review_note ?? "").trim() || null,
      reviewed_by:   user.id,
      reviewed_at:   new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    };

    // Apply operator corrections
    let consentBasis:   ConsentBasis   = existing.consent_basis   as ConsentBasis;
    let automationTier: AutomationTier = existing.automation_tier as AutomationTier;
    let dncFlag: boolean               = existing.dnc_flag        as boolean;
    let aiAssisted: boolean            = existing.ai_assisted     as boolean;

    if (body.consent_basis !== undefined) {
      if (!(VALID_CONSENT_BASES as readonly string[]).includes(body.consent_basis)) {
        return NextResponse.json({ error: `Invalid consent_basis` }, { status: 400 });
      }
      consentBasis  = body.consent_basis as ConsentBasis;
      patch.consent_basis = consentBasis;
    }
    if (body.automation_tier !== undefined) {
      if (!(VALID_AUTO_TIERS as readonly string[]).includes(body.automation_tier)) {
        return NextResponse.json({ error: `Invalid automation_tier` }, { status: 400 });
      }
      automationTier  = body.automation_tier as AutomationTier;
      patch.automation_tier = automationTier;
      patch.ai_assisted     = automationTier === "ai_assisted";
      aiAssisted            = automationTier === "ai_assisted";
    }
    if (body.dnc_flag !== undefined) {
      dncFlag       = Boolean(body.dnc_flag);
      patch.dnc_flag = dncFlag;
    }

    // Re-derive risk_tier if any correction fields were provided
    if (body.consent_basis !== undefined || body.automation_tier !== undefined || body.dnc_flag !== undefined) {
      patch.risk_tier = deriveRiskTier({ consentBasis, automationTier, dncFlag, aiAssisted });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("voice_interaction_ledger") as any)
      .update(patch)
      .eq("id", entry_id)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)  return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    return NextResponse.json({ entry: data });
  } catch (err) {
    console.error("[voice-ledger/[entry_id]] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
