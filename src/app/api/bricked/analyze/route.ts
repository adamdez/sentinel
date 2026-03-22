import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/bricked/analyze
 *
 * Dedicated Bricked AI endpoint — returns the FULL response, nothing stripped.
 *
 * Body: {
 *   address: string (required),
 *   leadId?: string,
 *   bedrooms?: number,
 *   bathrooms?: number,
 *   squareFeet?: number,
 *   yearBuilt?: number,
 *   landUse?: string,
 *   repairs?: string,
 * }
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

  const brickedKey = process.env.BRICKED_API_KEY;
  if (!brickedKey) {
    return NextResponse.json(
      { error: "BRICKED_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const {
      address,
      leadId,
      bedrooms,
      bathrooms,
      squareFeet,
      yearBuilt,
      landUse,
      repairs,
    } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "address is required" },
        { status: 400 },
      );
    }

    // ── Build Bricked URL ──────────────────────────────────────────────
    const url = new URL("https://api.bricked.ai/v1/property/create");
    url.searchParams.set("address", address);
    if (bedrooms != null) url.searchParams.set("bedrooms", String(bedrooms));
    if (bathrooms != null) url.searchParams.set("bathrooms", String(bathrooms));
    if (squareFeet != null)
      url.searchParams.set("squareFeet", String(squareFeet));
    if (yearBuilt != null) url.searchParams.set("yearBuilt", String(yearBuilt));
    if (landUse) url.searchParams.set("landUse", landUse);
    if (repairs) url.searchParams.set("repairs", repairs);

    // ── Call Bricked ───────────────────────────────────────────────────
    const brickedRes = await fetch(url.toString(), {
      method: "GET",
      headers: { "x-api-key": brickedKey },
    });

    if (!brickedRes.ok) {
      const errText = await brickedRes.text().catch(() => "");
      console.error(
        "[Bricked] HTTP",
        brickedRes.status,
        errText.slice(0, 500),
      );
      return NextResponse.json(
        {
          error: `Bricked API returned ${brickedRes.status}`,
          detail: errText.slice(0, 300),
        },
        { status: 502 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await brickedRes.json()) as any;

    // ── Side-effect: merge key values into lead owner_flags ───────────
    if (leadId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const flags: Record<string, any> = {};
        if (data.arv) flags.bricked_arv = data.arv;
        if (data.arv) flags.comp_arv = data.arv;
        if (data.cmv) flags.bricked_cmv = data.cmv;
        if (data.totalRepairCost)
          flags.bricked_repair_cost = data.totalRepairCost;
        if (data.shareLink) flags.bricked_share_link = data.shareLink;
        if (data.dashboardLink)
          flags.bricked_dashboard_link = data.dashboardLink;
        if (data.id) flags.bricked_id = data.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data.repairs?.length) flags.bricked_repairs = data.repairs;
        if (data.comps?.length)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          flags.comp_count = data.comps.filter((c: any) => c.selected).length;
        if (data.property?.mortgageDebt?.estimatedEquity)
          flags.bricked_equity = data.property.mortgageDebt.estimatedEquity;
        if (data.property?.mortgageDebt?.openMortgageBalance)
          flags.bricked_open_mortgage =
            data.property.mortgageDebt.openMortgageBalance;
        if (data.property?.ownership?.owners?.length) {
          flags.bricked_owner_names = data.property.ownership.owners
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((o: any) =>
              [o.firstName, o.lastName].filter(Boolean).join(" "),
            )
            .filter(Boolean)
            .join("; ");
        }
        if (data.property?.ownership?.ownershipLength)
          flags.bricked_ownership_years =
            data.property.ownership.ownershipLength;
        if (data.property?.details?.renovationScore?.hasScore)
          flags.bricked_renovation_score =
            data.property.details.renovationScore.score;
        if (data.property?.images?.length)
          flags.bricked_subject_images = data.property.images;

        // Non-blocking JSONB merge
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: currentLead } = await (sb.from("leads") as any)
          .select("owner_flags")
          .eq("id", leadId)
          .single();
        const merged = {
          ...((currentLead?.owner_flags as Record<string, unknown>) ?? {}),
          ...flags,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("leads") as any)
          .update({ owner_flags: merged })
          .eq("id", leadId)
          .then(() => {})
          .catch(() => {});
      } catch {
        // Non-blocking — don't fail the response
        console.warn("[Bricked] Failed to update owner_flags for lead", leadId);
      }
    }

    // ── Return FULL Bricked response ─────────────────────────────────
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Bricked] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
