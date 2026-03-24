import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/leads/[id]/phones
 *
 * Returns all phone numbers for a lead from the lead_phones table,
 * ordered by position. Includes status tracking and next-phone logic
 * for dialer phone cycling.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: leadId } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: phones, error } = await (sb.from("lead_phones") as any)
      .select("*")
      .eq("lead_id", leadId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/leads/[id]/phones] query error:", error);
      return NextResponse.json({ error: "Failed to fetch phones" }, { status: 500 });
    }

    const rows = (phones ?? []) as Array<Record<string, unknown>>;
    const activePhones = rows.filter((p) => p.status === "active");
    const deadPhones = rows.filter((p) => p.status !== "active");

    // next_phone: lowest-position active phone that hasn't been called, or the one called longest ago
    let nextPhone: Record<string, unknown> | null = null;
    const uncalled = activePhones.filter((p) => !p.last_called_at);
    if (uncalled.length > 0) {
      nextPhone = uncalled[0];
    } else if (activePhones.length > 0) {
      nextPhone = activePhones.reduce((oldest, p) =>
        !oldest || (p.last_called_at && (!oldest.last_called_at || (p.last_called_at as string) < (oldest.last_called_at as string)))
          ? p
          : oldest
      , null as Record<string, unknown> | null);
    }

    return NextResponse.json({
      phones: rows,
      active_count: activePhones.length,
      dead_count: deadPhones.length,
      next_phone: nextPhone,
    });
  } catch (err) {
    console.error("[GET /api/leads/[id]/phones] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
