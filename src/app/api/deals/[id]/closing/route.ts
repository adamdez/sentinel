import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

const CLOSING_FIELDS = [
  "closing_target_date",
  "closing_status",
  "closing_notes",
  "title_company",
  "earnest_money_deposited",
  "inspection_complete",
  "closing_checklist",
] as const;

const VALID_CLOSING_STATUSES = [
  "under_contract",
  "title_work",
  "inspection",
  "closing_scheduled",
  "closed",
  "fell_through",
];

/**
 * GET /api/deals/[id]/closing — get closing coordination data
 * Returns closing fields, related tasks, and deal_buyers with status.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Fetch deal closing fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deal, error: dealErr } = await (sb.from("deals") as any)
      .select("id, closing_target_date, closing_status, closing_notes, title_company, earnest_money_deposited, inspection_complete, closing_checklist, contract_price, status, closed_at")
      .eq("id", id)
      .single();

    if (dealErr || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Fetch related tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tasks } = await (sb.from("tasks") as any)
      .select("id, title, description, status, due_at, priority, completed_at, created_at")
      .eq("deal_id", id)
      .order("due_at", { ascending: true, nullsFirst: false });

    // Fetch deal_buyers with buyer info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dealBuyers } = await (sb.from("deal_buyers") as any)
      .select("id, buyer_id, status, offer_amount, date_contacted, responded_at, selection_reason")
      .eq("deal_id", id);

    // Enrich deal_buyers with buyer names
    const buyerIds = (dealBuyers ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((db: any) => db.buyer_id)
      .filter(Boolean);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buyerMap: Record<string, any> = {};
    if (buyerIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: buyers } = await (sb.from("buyers") as any)
        .select("id, contact_name, company_name")
        .in("id", buyerIds);
      if (buyers) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const b of buyers as any[]) {
          buyerMap[b.id] = { contact_name: b.contact_name, company_name: b.company_name };
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichedBuyers = (dealBuyers ?? []).map((db: any) => ({
      ...db,
      buyer: buyerMap[db.buyer_id] ?? null,
    }));

    return NextResponse.json({
      closing: {
        closing_target_date: deal.closing_target_date,
        closing_status: deal.closing_status,
        closing_notes: deal.closing_notes,
        title_company: deal.title_company,
        earnest_money_deposited: deal.earnest_money_deposited,
        inspection_complete: deal.inspection_complete,
        closing_checklist: deal.closing_checklist,
        contract_price: deal.contract_price,
        deal_status: deal.status,
        closed_at: deal.closed_at,
      },
      tasks: tasks ?? [],
      deal_buyers: enrichedBuyers,
    });
  } catch (err) {
    console.error("[API/deals/closing] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/deals/[id]/closing — update closing coordination fields
 * When closing_status changes to 'closed', auto-sets closed_at if not set.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    // Verify deal exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: existErr } = await (sb.from("deals") as any)
      .select("id, closed_at")
      .eq("id", id)
      .single();

    if (existErr || !existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Validate closing_status
    if (body.closing_status && !VALID_CLOSING_STATUSES.includes(body.closing_status)) {
      return NextResponse.json(
        { error: `Invalid closing_status. Must be one of: ${VALID_CLOSING_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updated_at: new Date().toISOString() };

    for (const field of CLOSING_FIELDS) {
      if (field in body) {
        update[field] = body[field];
      }
    }

    // Auto-set closed_at when closing_status changes to 'closed'
    if (body.closing_status === "closed" && !existing.closed_at) {
      update.closed_at = new Date().toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateErr } = await (sb.from("deals") as any)
      .update(update)
      .eq("id", id)
      .select("id, closing_target_date, closing_status, closing_notes, title_company, earnest_money_deposited, inspection_complete, closing_checklist, closed_at")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ closing: updated });
  } catch (err) {
    console.error("[API/deals/closing] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
