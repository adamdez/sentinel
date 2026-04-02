import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createArtifact, createFact } from "@/lib/intelligence";
import { spokaneGisAdapter } from "@/providers/spokane-gis/adapter";
import { fetchSpokaneScoutSummary } from "@/providers/spokane-scout/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ADMIN_EMAILS = [
  "adam@dominionhomedeals.com",
  "nathan@dominionhomedeals.com",
  "logan@dominionhomedeals.com",
];

type LeadRow = {
  id: string;
  property_id: string | null;
  notes: string | null;
  properties: {
    id: string;
    apn: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    county: string | null;
    owner_flags: Record<string, unknown> | null;
  } | null;
};

type PhotoEntry = {
  url: string;
  source: string;
  capturedAt: string;
};

function mergePhotos(existing: unknown, incoming: PhotoEntry[]): PhotoEntry[] {
  const merged: PhotoEntry[] = [];
  const seen = new Set<string>();
  const base = Array.isArray(existing) ? existing : [];

  for (const item of [...base, ...incoming]) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { url?: unknown; source?: unknown; capturedAt?: unknown };
    const url = typeof candidate.url === "string" ? candidate.url : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    merged.push({
      url,
      source: typeof candidate.source === "string" ? candidate.source : "unknown",
      capturedAt: typeof candidate.capturedAt === "string" ? candidate.capturedAt : new Date().toISOString(),
    });
  }

  return merged;
}

function factValueToString(value: string | number | boolean): string {
  if (typeof value === "string") return value;
  return String(value);
}

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

/**
 * POST /api/admin/backfill-spokane-scout
 *
 * Backfills a Spokane CSV cohort with:
 * - Spokane GIS facts (official assessed values and parcel metadata)
 * - Spokane SCOUT summary facts (current tax balance + embedded photos)
 *
 * Default cohort selection is notes-based because the imported workbook rows
 * currently persist the workbook marker in `leads.notes`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized - admin only" }, { status: 401 });
  }

  const sb = auth.sb;
  const body = await req.json().catch(() => ({}));
  const notesMarker = typeof body.notesMarker === "string" && body.notesMarker.trim()
    ? body.notesMarker.trim()
    : "Export-20260402-122040.xlsx";
  const limit = Math.min(Math.max(Number.parseInt(String(body.limit ?? "25"), 10) || 25, 1), 100);
  const leadIds = Array.isArray(body.leadIds)
    ? body.leadIds.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leadQuery = (sb.from("leads") as any)
    .select("id, property_id, notes, properties(id, apn, address, city, state, county, owner_flags)")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (leadIds.length > 0) {
    leadQuery = leadQuery.in("id", leadIds);
  } else {
    leadQuery = leadQuery.ilike("notes", `%${notesMarker}%`);
  }

  const { data, error } = await leadQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as LeadRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, updated: 0, reason: "no_matching_leads" });
  }

  const results: Array<Record<string, unknown>> = [];
  let updated = 0;

  for (const row of rows) {
    const property = row.properties;
    if (!row.property_id || !property?.apn) {
      results.push({ leadId: row.id, skipped: "missing_property_or_apn" });
      continue;
    }

    const county = (property.county ?? "").toLowerCase();
    const state = (property.state ?? "").toUpperCase();
    if (!county.includes("spokane") || state !== "WA") {
      results.push({ leadId: row.id, apn: property.apn, skipped: "not_spokane_wa" });
      continue;
    }

    try {
      const propertyApn = property.apn;
      const [gisResult, scoutSummary] = await Promise.all([
        spokaneGisAdapter.lookupProperty({
          apn: propertyApn,
          county: property.county ?? "spokane",
          state: property.state ?? "WA",
          address: property.address ?? undefined,
        }),
        fetchSpokaneScoutSummary(propertyApn),
      ]);

      const now = new Date().toISOString();
      const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;
      const scoutData = scoutSummary
        ? {
            owner_name: scoutSummary.ownerName,
            taxpayer_name: scoutSummary.taxpayerName,
            site_address: scoutSummary.siteAddress,
            assessed_tax_year: scoutSummary.assessedTaxYear,
            assessed_value: scoutSummary.assessedValue,
            land_value: scoutSummary.landValue,
            improvement_value: scoutSummary.improvementValue,
            total_charges_owing: scoutSummary.totalChargesOwing,
            current_tax_year: scoutSummary.currentTaxYear,
            current_annual_taxes: scoutSummary.currentAnnualTaxes,
            current_remaining_charges_owing: scoutSummary.currentRemainingChargesOwing,
            year_built: scoutSummary.yearBuilt,
            gross_living_area_sqft: scoutSummary.grossLivingAreaSqft,
            bedrooms: scoutSummary.bedrooms,
            half_baths: scoutSummary.halfBaths,
            full_baths: scoutSummary.fullBaths,
            last_sale_date: scoutSummary.lastSaleDate,
            last_sale_price: scoutSummary.lastSalePrice,
            photo_count: scoutSummary.photoCount,
            source_url: scoutSummary.sourceUrl,
          }
        : null;

      if (gisResult.facts.length > 0) {
        const artifactId = await createArtifact({
          leadId: row.id,
          propertyId: row.property_id,
          sourceType: "spokane_gis",
          sourceUrl: property.apn ? `https://cp.spokanecounty.org/SCOUT/Map/?PID=${encodeURIComponent(property.apn)}` : undefined,
          sourceLabel: "Spokane County GIS",
          rawExcerpt: JSON.stringify(gisResult.rawPayload).slice(0, 10000),
        });

        for (const fact of gisResult.facts) {
          if (fact.value === null || fact.value === undefined) continue;
          await createFact({
            artifactId,
            leadId: row.id,
            factType: fact.fieldName,
            factValue: factValueToString(fact.value),
            confidence: fact.confidence === "unverified" ? "low" : fact.confidence,
            assertedBy: `spokane_gis:${fact.providerFieldPath}`,
          });
        }
      }

      if (scoutSummary) {
        const artifactId = await createArtifact({
          leadId: row.id,
          propertyId: row.property_id,
          sourceType: "spokane_scout",
          sourceUrl: scoutSummary.sourceUrl,
          sourceLabel: "Spokane County SCOUT",
          rawExcerpt: scoutSummary.rawExcerpt,
        });

        const scoutFacts: Array<{ type: string; value: string | number }> = [];
        if (scoutSummary.totalChargesOwing != null) scoutFacts.push({ type: "scout_total_charges_owing", value: scoutSummary.totalChargesOwing });
        if (scoutSummary.currentAnnualTaxes != null) scoutFacts.push({ type: "scout_current_annual_taxes", value: scoutSummary.currentAnnualTaxes });
        if (scoutSummary.currentRemainingChargesOwing != null) scoutFacts.push({ type: "scout_current_remaining_charges_owing", value: scoutSummary.currentRemainingChargesOwing });
        if (scoutSummary.yearBuilt != null) scoutFacts.push({ type: "year_built", value: scoutSummary.yearBuilt });
        if (scoutSummary.grossLivingAreaSqft != null) scoutFacts.push({ type: "square_footage", value: scoutSummary.grossLivingAreaSqft });
        if (scoutSummary.bedrooms != null) scoutFacts.push({ type: "bedrooms", value: scoutSummary.bedrooms });
        if (scoutSummary.fullBaths != null) scoutFacts.push({ type: "bathrooms_full", value: scoutSummary.fullBaths });
        if (scoutSummary.halfBaths != null) scoutFacts.push({ type: "bathrooms_half", value: scoutSummary.halfBaths });
        if (scoutSummary.lastSaleDate != null) scoutFacts.push({ type: "last_sale_date", value: scoutSummary.lastSaleDate });
        if (scoutSummary.lastSalePrice != null) scoutFacts.push({ type: "last_sale_price", value: scoutSummary.lastSalePrice });

        for (const fact of scoutFacts) {
          await createFact({
            artifactId,
            leadId: row.id,
            factType: fact.type,
            factValue: factValueToString(fact.value),
            confidence: "high",
            assertedBy: "spokane_scout",
          });
        }
      }

      const photoEntries = scoutSummary
        ? Array.from({ length: scoutSummary.photoCount }, (_, index) => ({
            url: `/api/properties/scout-photo?apn=${encodeURIComponent(propertyApn)}&index=${index}`,
            source: "spokane_scout",
            capturedAt: scoutSummary.fetchedAt,
          }))
        : [];

      const countyDataProjection = {
        ...(((ownerFlags.county_data as Record<string, unknown> | undefined) ?? {})),
        ...Object.fromEntries(
          gisResult.facts.map((fact) => [fact.fieldName, fact.value]),
        ),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (sb.from("properties") as any)
        .update({
          owner_flags: {
            ...ownerFlags,
          county_data: countyDataProjection,
            county_data_at: now,
            ...(scoutData ? { scout_data: scoutData, scout_data_at: scoutSummary?.fetchedAt ?? now } : {}),
            ...(photoEntries.length > 0 ? { photos: mergePhotos(ownerFlags.photos, photoEntries), photos_fetched_at: now } : {}),
          },
          updated_at: now,
        })
        .eq("id", row.property_id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      updated++;
        results.push({
          leadId: row.id,
          propertyId: row.property_id,
          apn: propertyApn,
          gisFacts: gisResult.facts.length,
          scoutPhotos: scoutSummary?.photoCount ?? 0,
          totalChargesOwing: scoutSummary?.totalChargesOwing ?? null,
        updated: true,
      });
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      results.push({ leadId: row.id, propertyId: row.property_id, apn: property.apn, error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    notesMarker,
    leadIdsSupplied: leadIds.length,
    processed: rows.length,
    updated,
    results,
  });
}
