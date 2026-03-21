import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * POST /api/review/vapi-post-call/promote
 *
 * Manually promotes an approved vapi_post_call_promote review_queue item
 * to the leads table. This endpoint is the explicit promotion path for
 * operators who want to manually trigger the CRM write after reviewing.
 *
 * Write path: review_queue (approved) -> leads.next_action, leads.notes
 *
 * Body: { reviewItemId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { reviewItemId } = body;

    if (!reviewItemId) {
      return NextResponse.json(
        { error: "reviewItemId is required" },
        { status: 400 },
      );
    }

    // 1. Fetch the review_queue item
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: item, error: fetchErr } = await (sb.from("review_queue") as any)
      .select("*")
      .eq("id", reviewItemId)
      .single();

    if (fetchErr || !item) {
      return NextResponse.json(
        { error: "Review item not found" },
        { status: 404 },
      );
    }

    // 2. Verify it's an approved vapi_post_call_promote item
    if (item.action !== "vapi_post_call_promote") {
      return NextResponse.json(
        { error: `Wrong action type: ${item.action}` },
        { status: 400 },
      );
    }

    if (item.status !== "approved") {
      return NextResponse.json(
        { error: `Item is not approved (status: ${item.status})` },
        { status: 409 },
      );
    }

    const leadId = item.entity_id;
    if (!leadId) {
      return NextResponse.json(
        { error: "No lead_id on review item" },
        { status: 400 },
      );
    }

    // 3. Fetch current lead to append notes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadErr } = await (sb.from("leads") as any)
      .select("id, notes")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // 4. Extract proposal fields
    const proposal = item.proposal as {
      next_action?: string;
      next_action_due_at?: string;
      deal_temperature?: string;
      promises_made?: string[];
      objections_raised?: string[];
      decision_maker_confidence?: string;
      voice_session_id?: string;
    };

    // Build appended note
    const now = new Date();
    const dateLabel = now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const noteParts = [
      `[Vapi post-call ${dateLabel}]`,
      proposal.deal_temperature ? `Temperature: ${proposal.deal_temperature}` : null,
      proposal.next_action ? `Next action: ${proposal.next_action}` : null,
      proposal.promises_made?.length
        ? `Promises: ${proposal.promises_made.join("; ")}`
        : null,
      proposal.objections_raised?.length
        ? `Objections: ${proposal.objections_raised.join("; ")}`
        : null,
      proposal.decision_maker_confidence
        ? `DM confidence: ${proposal.decision_maker_confidence}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const updatedNotes = lead.notes
      ? `${lead.notes}\n\n${noteParts}`
      : noteParts;

    // 5. Write to leads table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (sb.from("leads") as any)
      .update({
        next_action: proposal.next_action ?? null,
        next_action_due_at: proposal.next_action_due_at ?? null,
        notes: updatedNotes,
        updated_at: now.toISOString(),
      })
      .eq("id", leadId);

    if (updateErr) {
      return NextResponse.json(
        { error: `Lead update failed: ${updateErr.message}` },
        { status: 500 },
      );
    }

    // 6. Log event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any)
      .insert({
        action: "vapi_post_call.promoted",
        entity_type: "lead",
        entity_id: leadId,
        details: {
          review_item_id: reviewItemId,
          deal_temperature: proposal.deal_temperature,
          next_action: proposal.next_action,
          promoted_by: user.id,
          voice_session_id: proposal.voice_session_id,
        },
      })
      .catch(() => {});

    // 7. Mark review_queue item as promoted
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("review_queue") as any)
      .update({
        status: "promoted",
        updated_at: now.toISOString(),
      })
      .eq("id", reviewItemId);

    // 8. Fire n8n webhook (fire-and-forget)
    import("@/lib/n8n-dispatch")
      .then(({ n8nReviewApproved }) => {
        n8nReviewApproved({
          reviewItemId,
          agentName: "post-call-analysis",
          leadId,
          proposalType: "vapi_post_call_promote",
          approvedBy: user.id,
        }).catch(() => {});
      })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      promoted: {
        review_item_id: reviewItemId,
        lead_id: leadId,
        next_action: proposal.next_action,
        deal_temperature: proposal.deal_temperature,
        promoted_at: now.toISOString(),
        promoted_by: user.id,
      },
    });
  } catch (err) {
    console.error("[API/review/vapi-post-call/promote] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
