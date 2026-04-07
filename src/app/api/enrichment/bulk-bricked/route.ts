/**
 * POST /api/enrichment/bulk-bricked
 *
 * Processes Bricked AI analysis directly (no Inngest — bypassed due to
 * registration issues). Processes up to `batchSize` leads per call.
 * Call repeatedly to work through the full backlog.
 *
 * Body: { leadIds?, force?, batchSize? (default 15), offset? (default 0) }
 * Auth: authenticated user bearer token OR CRON_SECRET.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireUserOrCron } from "@/lib/api-auth";

const BRICKED_BASE = "https://api.bricked.ai";
const DEFAULT_BATCH_SIZE = 15;
const DELAY_MS = 1500;

export async function POST(req: NextRequest) {
  const auth = await requireUserOrCron(req, createServerClient());
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brickedKey = process.env.BRICKED_API_KEY;
  if (!brickedKey) {
    return NextResponse.json({ error: "BRICKED_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    leadIds,
    force,
    batchSize = DEFAULT_BATCH_SIZE,
    offset = 0,
  } = body as {
    leadIds?: string[];
    force?: boolean;
    batchSize?: number;
    offset?: number;
  };

  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("leads") as any)
    .select(`
      id,
      property_id,
      properties!inner (
        id, address, city, state, zip,
        bedrooms, bathrooms, sqft, year_built,
        owner_flags
      )
    `)
    .not("property_id", "is", null);

  if (leadIds && leadIds.length > 0) {
    query = query.in("id", leadIds);
  }

  const { data: rows, error: queryErr } = await query
    .order("created_at", { ascending: true })
    .range(offset, offset + batchSize * 2);

  if (queryErr) {
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligible = (rows ?? []).filter((row: any) => {
    const prop = row.properties;
    if (!prop?.address) return false;
    if (force) return true;
    const flags = (prop.owner_flags ?? {}) as Record<string, unknown>;
    return !flags.bricked_id;
  }).slice(0, batchSize);

  if (eligible.length === 0) {
    return NextResponse.json({
      done: true,
      message: "No more leads to analyze",
      processed: 0,
      errors: 0,
    });
  }

  const results: Array<{
    leadId: string;
    address: string;
    success: boolean;
    brickedId?: string;
    arv?: number;
    error?: string;
  }> = [];

  for (let i = 0; i < eligible.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = eligible[i] as any;
    const prop = row.properties;
    const fullAddress = [prop.address, prop.city, prop.state, prop.zip]
      .filter(Boolean)
      .join(", ");

    try {
      const existingId = (prop.owner_flags as Record<string, unknown>)?.bricked_id as string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;

      if (existingId && !force) {
        const getRes = await fetch(`${BRICKED_BASE}/v1/property/get/${existingId}`, {
          method: "GET",
          headers: { "x-api-key": brickedKey },
        });
        if (getRes.ok) data = await getRes.json();
      }

      if (!data) {
        const url = new URL(`${BRICKED_BASE}/v1/property/create`);
        url.searchParams.set("address", fullAddress);
        if (prop.bedrooms) url.searchParams.set("bedrooms", String(prop.bedrooms));
        if (prop.bathrooms) url.searchParams.set("bathrooms", String(prop.bathrooms));
        if (prop.sqft) url.searchParams.set("squareFeet", String(prop.sqft));
        if (prop.year_built) url.searchParams.set("yearBuilt", String(prop.year_built));

        const res = await fetch(url.toString(), {
          method: "GET",
          headers: { "x-api-key": brickedKey },
        });

        if (res.ok) {
          data = await res.json();
        } else {
          const errText = await res.text().catch(() => "");
          const errMsg = res.status === 404
            ? `Not found: ${errText.slice(0, 200)}`
            : `HTTP ${res.status}: ${errText.slice(0, 200)}`;
          console.error(`[BulkBricked] ${fullAddress} -> ${errMsg}`);
          results.push({ leadId: row.id, address: fullAddress, success: false, error: errMsg });
          continue;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flags: Record<string, any> = {};
      if (data.arv) {
        flags.bricked_arv = data.arv;
        flags.comp_arv = data.arv;
      }
      if (data.cmv) flags.bricked_cmv = data.cmv;
      if (data.totalRepairCost) flags.bricked_repair_cost = data.totalRepairCost;
      if (data.shareLink) flags.bricked_share_link = data.shareLink;
      if (data.dashboardLink) flags.bricked_dashboard_link = data.dashboardLink;
      if (data.id) flags.bricked_id = data.id;
      if (data.repairs?.length) flags.bricked_repairs = data.repairs;
      if (data.comps?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        flags.comp_count = data.comps.filter((c: any) => c.selected).length;
      }
      if (data.property?.mortgageDebt?.estimatedEquity) {
        flags.bricked_equity = data.property.mortgageDebt.estimatedEquity;
      }
      if (data.property?.mortgageDebt?.openMortgageBalance) {
        flags.bricked_open_mortgage = data.property.mortgageDebt.openMortgageBalance;
      }
      if (data.property?.ownership?.owners?.length) {
        flags.bricked_owner_names = data.property.ownership.owners
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((o: any) => [o.firstName, o.lastName].filter(Boolean).join(" "))
          .filter(Boolean)
          .join("; ");
      }
      if (data.property?.ownership?.ownershipLength) {
        flags.bricked_ownership_years = data.property.ownership.ownershipLength;
      }
      if (data.property?.details?.renovationScore?.hasScore) {
        flags.bricked_renovation_score = data.property.details.renovationScore.score;
      }
      if (data.property?.images?.length) {
        flags.bricked_subject_images = data.property.images;
      }

      flags.bricked_full_response = data;
      flags.bricked_fetched_at = new Date().toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentProp } = await (sb.from("properties") as any)
        .select("owner_flags")
        .eq("id", prop.id)
        .single();
      const merged = {
        ...((currentProp?.owner_flags as Record<string, unknown>) ?? {}),
        ...flags,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (sb.from("properties") as any)
        .update({ owner_flags: merged })
        .eq("id", prop.id);

      if (updateErr) {
        console.error(`[BulkBricked] DB write failed ${prop.id}:`, updateErr.message);
      }

      results.push({
        leadId: row.id,
        address: fullAddress,
        success: true,
        brickedId: data.id,
        arv: data.arv,
      });

      console.log(`[BulkBricked] OK ${fullAddress} -> ARV $${Math.round(data.arv ?? 0)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[BulkBricked] ${fullAddress} threw:`, msg);
      results.push({ leadId: row.id, address: fullAddress, success: false, error: msg });
    }

    if (i < eligible.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;

  console.log(`[BulkBricked] Batch done: ${successCount} success, ${errorCount} errors`);

  return NextResponse.json({
    done: false,
    processed: successCount,
    errors: errorCount,
    nextOffset: offset + batchSize * 2,
    results,
  });
}
