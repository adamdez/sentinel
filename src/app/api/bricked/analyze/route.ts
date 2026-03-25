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

const BRICKED_BASE = "https://api.bricked.ai";

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
      brickedId: clientBrickedId,
    } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "address is required" },
        { status: 400 },
      );
    }

    // Resolve the property_id from the lead (needed for owner_flags on properties)
    let propertyId: string | undefined;
    if (leadId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lead } = await (sb.from("leads") as any)
        .select("property_id")
        .eq("id", leadId)
        .single();
      propertyId = lead?.property_id as string | undefined;
    }

    // ── Build Bricked URL ──────────────────────────────────────────────
    const url = new URL(`${BRICKED_BASE}/v1/property/create`);
    url.searchParams.set("address", address);
    if (bedrooms != null) url.searchParams.set("bedrooms", String(bedrooms));
    if (bathrooms != null) url.searchParams.set("bathrooms", String(bathrooms));
    if (squareFeet != null)
      url.searchParams.set("squareFeet", String(squareFeet));
    if (yearBuilt != null) url.searchParams.set("yearBuilt", String(yearBuilt));
    if (landUse) url.searchParams.set("landUse", landUse);
    if (repairs) url.searchParams.set("repairs", repairs);

    const brickedHeaders = { "x-api-key": brickedKey };

    // ── Try /get/{id} first if we have a cached bricked_id ──────────
    // This avoids re-running the full /create analysis when the data
    // was previously fetched but the cached response was lost client-side.
    const cachedId = clientBrickedId as string | undefined;
    let brickedRes: Response | null = null;

    if (cachedId) {
      const getRes = await fetch(`${BRICKED_BASE}/v1/property/get/${cachedId}`, {
        method: "GET",
        headers: brickedHeaders,
      });
      if (getRes.ok) {
        console.log("[Bricked] Served from /get cache:", cachedId.slice(0, 8));
        brickedRes = getRes;
      }
      // If /get fails, fall through to /create
    }

    // ── Call Bricked /create ─────────────────────────────────────────
    if (!brickedRes) {
      brickedRes = await fetch(url.toString(), {
        method: "GET",
        headers: brickedHeaders,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;

    if (brickedRes.ok) {
      data = await brickedRes.json();
    } else if (brickedRes.status === 404) {
      // Bricked 404 = "Property not found via search".
      // Try cached bricked_id from properties.owner_flags, then /list as last resort.
      data = await fallbackFromCache(sb, propertyId, brickedKey);

      if (!data) {
        data = await fallbackFromList(address, brickedKey);
      }

      if (!data) {
        console.error("[Bricked] 404 — no cache or list match for:", address);
        return NextResponse.json(
          {
            error:
              "Bricked could not find this property. It may not be in their coverage area, or the address format may differ from what they expect.",
          },
          { status: 502 },
        );
      }
      console.log("[Bricked] /create 404 — served from fallback for:", address);
    } else {
      const errText = await brickedRes.text().catch(() => "");
      console.error("[Bricked] HTTP", brickedRes.status, errText.slice(0, 500));
      return NextResponse.json(
        {
          error: `Bricked API returned ${brickedRes.status}`,
          detail: errText.slice(0, 300),
        },
        { status: 502 },
      );
    }

    // ── Side-effect: merge key values into properties.owner_flags ────
    if (propertyId) {
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

        flags.bricked_full_response = data;
        flags.bricked_fetched_at = new Date().toISOString();

        // JSONB merge into properties.owner_flags (non-blocking)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: currentProp } = await (sb.from("properties") as any)
          .select("owner_flags")
          .eq("id", propertyId)
          .single();
        const merged = {
          ...((currentProp?.owner_flags as Record<string, unknown>) ?? {}),
          ...flags,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateErr } = await (sb.from("properties") as any)
          .update({ owner_flags: merged })
          .eq("id", propertyId);
        if (updateErr) {
          console.error(
            "[Bricked] owner_flags write FAILED for property",
            propertyId,
            "error:",
            updateErr.message,
            "merged size:",
            JSON.stringify(merged).length,
          );
        } else {
          console.log(
            "[Bricked] owner_flags persisted for property",
            propertyId?.slice(0, 8),
            "size:",
            JSON.stringify(merged).length,
          );
        }
      } catch (writeErr) {
        console.error(
          "[Bricked] owner_flags write threw for property",
          propertyId,
          writeErr,
        );
      }
    }

    let zillowEstimate: number | null = null;
    let zillowEstimateUpdatedAt: string | null = null;
    let zillowEstimateSourceUrl: string | null = null;
    let zillowEstimateConfidence: string | null = null;

    if (propertyId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: property } = await (sb.from("properties") as any)
          .select("owner_flags")
          .eq("id", propertyId)
          .single();

        const ownerFlags = (property?.owner_flags ?? {}) as Record<string, unknown>;
        zillowEstimate = typeof ownerFlags.zillow_estimate === "number"
          ? ownerFlags.zillow_estimate
          : null;
        zillowEstimateUpdatedAt = typeof ownerFlags.zillow_estimate_updated_at === "string"
          ? ownerFlags.zillow_estimate_updated_at
          : null;
        zillowEstimateSourceUrl = typeof ownerFlags.zillow_estimate_source_url === "string"
          ? ownerFlags.zillow_estimate_source_url
          : null;
        zillowEstimateConfidence = typeof ownerFlags.zillow_estimate_confidence === "string"
          ? ownerFlags.zillow_estimate_confidence
          : null;
      } catch (ownerFlagsError) {
        console.warn("[Bricked] Could not load Zillow estimate from owner_flags:", ownerFlagsError);
      }
    }

    return NextResponse.json({
      ...data,
      zillowEstimate,
      zillowEstimateUpdatedAt,
      zillowEstimateSourceUrl,
      zillowEstimateConfidence,
    });
  } catch (err) {
    console.error("[Bricked] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── Fallback helpers ──────────────────────────────────────────────────

/** Try to serve cached data via /get/{cachedBrickedId} from properties.owner_flags */
async function fallbackFromCache(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string | undefined,
  brickedKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  if (!propertyId) return null;

  const { data: prop } = await sb
    .from("properties")
    .select("owner_flags")
    .eq("id", propertyId)
    .single();
  const cachedId = (prop?.owner_flags as Record<string, unknown>)
    ?.bricked_id as string | undefined;
  if (!cachedId) return null;

  const res = await fetch(`${BRICKED_BASE}/v1/property/get/${cachedId}`, {
    method: "GET",
    headers: { "x-api-key": brickedKey },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Last resort: search /list for matching address, then /get that ID */
async function fallbackFromList(
  address: string,
  brickedKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  try {
    const listRes = await fetch(`${BRICKED_BASE}/v1/property/list?page=0`, {
      method: "GET",
      headers: { "x-api-key": brickedKey },
    });
    if (!listRes.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listData = (await listRes.json()) as {
      properties: { id: string; address: string }[];
    };

    // Normalize for comparison: lowercase, strip extra whitespace/commas
    const norm = (s: string) =>
      s.toLowerCase().replace(/[,\s]+/g, " ").trim();
    const needle = norm(address);

    const match = listData.properties?.find((p) =>
      norm(p.address).includes(needle) || needle.includes(norm(p.address)),
    );
    if (!match) return null;

    const getRes = await fetch(
      `${BRICKED_BASE}/v1/property/get/${match.id}`,
      { method: "GET", headers: { "x-api-key": brickedKey } },
    );
    if (!getRes.ok) return null;
    return getRes.json();
  } catch {
    return null;
  }
}
