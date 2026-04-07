import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireUserOrCron } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * POST /api/admin/backfill-photos
 *
 * Extracts photos from existing `owner_flags.pr_raw` data for all properties
 * that have PR data but no photos yet. Zero additional API cost; it only reads
 * from data already stored in the database.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const auth = await requireUserOrCron(req, sb);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[BackfillPhotos] Starting photo extraction from pr_raw...");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: properties, error: queryErr } = await (sb.from("properties") as any)
      .select("id, owner_flags")
      .not("owner_flags->pr_raw", "is", null)
      .limit(2000);

    if (queryErr) {
      console.error("[BackfillPhotos] Query error:", queryErr.message);
      return NextResponse.json({ error: "Query failed", detail: queryErr.message }, { status: 500 });
    }

    if (!properties || properties.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: "No properties with pr_raw found" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const needsBackfill = properties.filter((property: any) => {
      const flags = property.owner_flags ?? {};
      const photos = flags.photos;
      const missingPhotos = !Array.isArray(photos) || photos.length === 0;
      const missingTaxValue = flags.tax_assessed_value == null;
      return missingPhotos || missingTaxValue;
    });

    console.log(`[BackfillPhotos] ${needsBackfill.length} of ${properties.length} properties need backfill`);

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < needsBackfill.length; i += 100) {
      const chunk = needsBackfill.slice(i, i + 100);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const property of chunk as any[]) {
        try {
          const flags = property.owner_flags ?? {};
          const pr = flags.pr_raw;
          if (!pr) {
            skipped++;
            continue;
          }

          const now = new Date().toISOString();
          const extractedPhotos: Array<{ url: string; source: string; capturedAt: string }> = [];

          const prPhotos = pr.Photos || pr.photos;
          if (Array.isArray(prPhotos)) {
            for (const url of prPhotos) {
              if (typeof url === "string" && url.startsWith("http")) {
                extractedPhotos.push({ url, source: "assessor", capturedAt: now });
              }
            }
          }

          if (typeof pr.PropertyImageUrl === "string" && pr.PropertyImageUrl.startsWith("http")) {
            extractedPhotos.push({ url: pr.PropertyImageUrl, source: "assessor", capturedAt: now });
          }

          const lat = toNumber(pr.Latitude);
          const lng = toNumber(pr.Longitude);
          if (lat && lng) {
            extractedPhotos.push({
              url: `/api/street-view?lat=${lat}&lng=${lng}`,
              source: "google_street_view",
              capturedAt: now,
            });
          }

          const assessedValue = toNumber(pr.AssessedValue);

          if (extractedPhotos.length === 0 && assessedValue == null) {
            skipped++;
            continue;
          }

          const updatedFlags: Record<string, unknown> = { ...flags };
          if (extractedPhotos.length > 0) {
            updatedFlags.photos = extractedPhotos;
            updatedFlags.photos_fetched_at = now;
          }
          if (assessedValue != null && !flags.tax_assessed_value) {
            updatedFlags.tax_assessed_value = Math.round(assessedValue);
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateErr } = await (sb.from("properties") as any)
            .update({ owner_flags: updatedFlags })
            .eq("id", property.id);

          if (updateErr) {
            errors.push(`${property.id}: ${updateErr.message}`);
          } else {
            updated++;
          }
        } catch (err) {
          errors.push(`${property.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "admin.backfill_photos",
      entity_type: "system",
      entity_id: "backfill_photos",
      details: {
        total: properties.length,
        needsBackfill: needsBackfill.length,
        updated,
        skipped,
        errors: errors.length,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[BackfillPhotos] Done: ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      total: properties.length,
      needsBackfill: needsBackfill.length,
      updated,
      skipped,
      errors: errors.length,
      errorSample: errors.slice(0, 5),
    });
  } catch (err) {
    console.error("[BackfillPhotos] Error:", err);
    return NextResponse.json(
      { error: "Backfill failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
