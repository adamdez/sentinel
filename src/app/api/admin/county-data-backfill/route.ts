import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { fetchSpokaneScoutSummary } from "@/providers/spokane-scout/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ADMIN_EMAILS = [
  "adam@dominionhomedeals.com",
  "nathan@dominionhomedeals.com",
  "logan@dominionhomedeals.com",
];

// ── Auth ─────────────────────────────────────────────────────────────────────

async function requireAdmin(req: NextRequest) {
  const sb = createServerClient();
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret === `Bearer ${expectedSecret}`) {
    return { ok: true, sb };
  }

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (user?.email && ADMIN_EMAILS.includes(user.email)) {
    return { ok: true, sb };
  }

  return { ok: false, sb };
}

// ── Owner-name quality check ─────────────────────────────────────────────────
// Returns true if the stored value is real — i.e. we already have a good name.
// Returns false if the value is blank / a known placeholder → scout should overwrite.

const BAD_OWNER_NAMES = new Set([
  "",
  "unknown",
  "unknown owner",
  "n/a",
  "na",
  "none",
  "null",
  "—",
  "-",
]);

function ownerNameIsBlank(name: string | null | undefined): boolean {
  if (!name) return true;
  return BAD_OWNER_NAMES.has(name.trim().toLowerCase());
}

// ── Core-field update builder ─────────────────────────────────────────────────
// Builds only the fields that scout returned something useful for,
// so we never overwrite real data with nulls.

function buildCoreUpdates(
  currentOwnerName: string | null,
  scout: {
    ownerName: string | null;
    taxpayerName: string | null;
    yearBuilt: number | null;
    grossLivingAreaSqft: number | null;
    bedrooms: number | null;
    fullBaths: number | null;
    halfBaths: number | null;
    assessedValue: number | null;
    lastSaleDate: string | null;
    lastSalePrice: number | null;
  },
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  // Owner name — only overwrite if current value is blank/unknown
  if (ownerNameIsBlank(currentOwnerName)) {
    const bestName = scout.taxpayerName?.trim() || scout.ownerName?.trim() || null;
    if (bestName && !ownerNameIsBlank(bestName)) {
      updates.owner_name = bestName;
    }
  }

  if (scout.yearBuilt != null) updates.year_built = scout.yearBuilt;
  if (scout.grossLivingAreaSqft != null) updates.sqft = scout.grossLivingAreaSqft;
  if (scout.bedrooms != null) updates.bedrooms = scout.bedrooms;

  // Bathrooms: full + half*0.5, stored as decimal
  if (scout.fullBaths != null || scout.halfBaths != null) {
    const full = scout.fullBaths ?? 0;
    const half = scout.halfBaths ?? 0;
    updates.bathrooms = full + half * 0.5;
  }

  if (scout.assessedValue != null) updates.estimated_value = scout.assessedValue;
  // last_sale_date / last_sale_price intentionally omitted from core writes —
  // column not present in current Supabase schema cache. Data lives in owner_flags.scout_data.

  return updates;
}

// ── GET — return progress stats ──────────────────────────────────────────────

/**
 * GET /api/admin/county-data-backfill
 *
 * Returns how many Spokane WA properties still need scout data.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorized - admin only" }, { status: 401 });
    }

    console.log("[county-data-backfill] GET — fetching progress stats");
    const sb = auth.sb;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: totalSpokane } = await (sb.from("properties") as any)
      .select("id", { count: "exact", head: true })
      .eq("state", "WA")
      .ilike("county", "%spokane%")
      .not("apn", "ilike", "MANUAL-%")
      .not("apn", "ilike", "CRAWL-%")
      .not("apn", "ilike", "TEMP-%");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: alreadyDone } = await (sb.from("properties") as any)
      .select("id", { count: "exact", head: true })
      .eq("state", "WA")
      .ilike("county", "%spokane%")
      .not("apn", "ilike", "MANUAL-%")
      .not("apn", "ilike", "CRAWL-%")
      .not("apn", "ilike", "TEMP-%")
      .not("owner_flags->>scout_data_at", "is", null);

    const remaining = (totalSpokane ?? 0) - (alreadyDone ?? 0);

    console.log(`[county-data-backfill] GET — total=${totalSpokane} enriched=${alreadyDone} remaining=${remaining}`);
    return NextResponse.json({
      total_spokane_properties: totalSpokane ?? 0,
      already_enriched: alreadyDone ?? 0,
      remaining,
    });
  } catch (err) {
    console.error("[county-data-backfill] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST — run backfill batch ─────────────────────────────────────────────────

/**
 * POST /api/admin/county-data-backfill
 *
 * Pulls free county data from Spokane SCOUT for properties that haven't been
 * enriched yet and writes it back to core property fields.
 *
 * Body params:
 *   limit    — properties per call, default 25, max 50
 *   offset   — skip first N properties (for pagination)
 *   force    — if true, re-run even if scout_data_at already set
 *   dry_run  — if true, fetch scout data but don't write anything
 *
 * Returns:
 *   { processed, updated, skipped, total_remaining, errors[] }
 */
export async function POST(req: NextRequest) {
  try {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized - admin only" }, { status: 401 });
  }

  const sb = auth.sb;
  const body = await req.json().catch(() => ({}));

  const limit = Math.min(Math.max(Number.parseInt(String(body.limit ?? "25"), 10) || 25, 1), 50);
  console.log(`[county-data-backfill] POST — limit=${limit} offset=${body.offset ?? 0} force=${body.force} dry_run=${body.dry_run}`);
  const offset = Math.max(Number.parseInt(String(body.offset ?? "0"), 10) || 0, 0);
  const force = body.force === true;
  const dryRun = body.dry_run === true;

  // ── 1. Find properties that need enrichment ──────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("properties") as any)
    .select("id, apn, owner_name, county, state, owner_flags")
    .eq("state", "WA")
    .ilike("county", "%spokane%")
    .not("apn", "ilike", "MANUAL-%")
    .not("apn", "ilike", "CRAWL-%")
    .not("apn", "ilike", "TEMP-%")
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (!force) {
    query = query.is("owner_flags->>scout_data_at", null);
  }

  const { data, error: queryError } = await query;

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    apn: string;
    owner_name: string | null;
    county: string | null;
    state: string | null;
    owner_flags: Record<string, unknown> | null;
  }>;

  // Count how many still need enrichment (for progress reporting)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let remainingQuery = (sb.from("properties") as any)
    .select("id", { count: "exact", head: true })
    .eq("state", "WA")
    .ilike("county", "%spokane%")
    .not("apn", "ilike", "MANUAL-%")
    .not("apn", "ilike", "CRAWL-%")
    .not("apn", "ilike", "TEMP-%");

  if (!force) {
    remainingQuery = remainingQuery.is("owner_flags->>scout_data_at", null);
  }

  const { count: remainingCount } = await remainingQuery;
  const totalRemaining = Math.max((remainingCount ?? 0) - rows.length, 0);

  if (rows.length === 0) {
    return NextResponse.json({
      processed: 0,
      updated: 0,
      skipped: 0,
      total_remaining: 0,
      errors: [],
      message: force ? "No Spokane WA properties found" : "All Spokane WA properties already enriched",
    });
  }

  // ── 2. Process each property ─────────────────────────────────────────────

  const results: Array<Record<string, unknown>> = [];
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const prop of rows) {
    try {
      const scout = await fetchSpokaneScoutSummary(prop.apn);

      if (!scout) {
        skipped++;
        results.push({ propertyId: prop.id, apn: prop.apn, skipped: "scout_returned_null" });
        // Still stamp the property so we don't keep retrying failed APNs forever
        if (!dryRun) {
          const ownerFlags = prop.owner_flags ?? {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("properties") as any)
            .update({
              owner_flags: { ...ownerFlags, scout_data_at: new Date().toISOString(), scout_data: null },
              updated_at: new Date().toISOString(),
            })
            .eq("id", prop.id);
        }
        continue;
      }

      // Build what we'd write to core fields
      const coreUpdates = buildCoreUpdates(prop.owner_name, scout);

      // Build scout_data blob for owner_flags
      const scoutData = {
        owner_name: scout.ownerName,
        taxpayer_name: scout.taxpayerName,
        site_address: scout.siteAddress,
        assessed_tax_year: scout.assessedTaxYear,
        assessed_value: scout.assessedValue,
        land_value: scout.landValue,
        improvement_value: scout.improvementValue,
        total_charges_owing: scout.totalChargesOwing,
        current_tax_year: scout.currentTaxYear,
        current_annual_taxes: scout.currentAnnualTaxes,
        current_remaining_charges_owing: scout.currentRemainingChargesOwing,
        year_built: scout.yearBuilt,
        gross_living_area_sqft: scout.grossLivingAreaSqft,
        bedrooms: scout.bedrooms,
        half_baths: scout.halfBaths,
        full_baths: scout.fullBaths,
        last_sale_date: scout.lastSaleDate,
        last_sale_price: scout.lastSalePrice,
        photo_count: scout.photoCount,
        source_url: scout.sourceUrl,
      };

      const now = new Date().toISOString();
      const ownerFlags = prop.owner_flags ?? {};

      if (!dryRun) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (sb.from("properties") as any)
          .update({
            ...coreUpdates,
            owner_flags: {
              ...ownerFlags,
              scout_data: scoutData,
              scout_data_at: scout.fetchedAt ?? now,
            },
            updated_at: now,
          })
          .eq("id", prop.id);

        if (updateError) throw new Error(updateError.message);
      }

      updated++;
      results.push({
        propertyId: prop.id,
        apn: prop.apn,
        coreFieldsSet: Object.keys(coreUpdates),
        ownerNameNow: coreUpdates.owner_name ?? prop.owner_name,
        sqft: scout.grossLivingAreaSqft,
        yearBuilt: scout.yearBuilt,
        bedrooms: scout.bedrooms,
        assessedValue: scout.assessedValue,
        taxOwing: scout.totalChargesOwing,
        dryRun,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${prop.apn}: ${msg}`);
      results.push({ propertyId: prop.id, apn: prop.apn, error: msg });
    }
  }

  console.log(`[county-data-backfill] POST — done: processed=${rows.length} updated=${updated} skipped=${skipped} errors=${errors.length} remaining=${totalRemaining}`);
  return NextResponse.json({
    processed: rows.length,
    updated,
    skipped,
    total_remaining: totalRemaining,
    dry_run: dryRun,
    errors,
    results,
  });
  } catch (err) {
    console.error("[county-data-backfill] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
