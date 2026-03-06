import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const ADMIN_EMAILS = [
  "adam@dominionhomedeals.com",
  "nathan@dominionhomedeals.com",
  "logan@dominionhomedeals.com",
];

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * POST /api/admin/backfill-photos
 *
 * Extracts photos from existing `owner_flags.pr_raw` data for all properties
 * that have PR data but no photos yet. Zero additional API cost — purely
 * reads from data already stored in the DB.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  // Auth: CRON_SECRET or admin session
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  let authorized = false;

  if (expectedSecret && cronSecret === `Bearer ${expectedSecret}`) {
    authorized = true;
  } else {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user?.email && ADMIN_EMAILS.includes(user.email)) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });
  }

  try {
    console.log("[BackfillPhotos] Starting photo extraction from pr_raw...");

    // Fetch properties that have pr_raw but no photos
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

    // Filter to only those missing photos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const needsPhotos = properties.filter((p: any) => {
      const flags = p.owner_flags ?? {};
      const photos = flags.photos;
      return !Array.isArray(photos) || photos.length === 0;
    });

    console.log(`[BackfillPhotos] ${needsPhotos.length} of ${properties.length} properties need photo backfill`);

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process in chunks of 100
    for (let i = 0; i < needsPhotos.length; i += 100) {
      const chunk = needsPhotos.slice(i, i + 100);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const prop of chunk as any[]) {
        try {
          const flags = prop.owner_flags ?? {};
          const pr = flags.pr_raw;
          if (!pr) {
            skipped++;
            continue;
          }

          const now = new Date().toISOString();
          const extractedPhotos: { url: string; source: string; capturedAt: string }[] = [];

          // PR photo arrays
          const prPhotos = pr.Photos || pr.photos;
          if (Array.isArray(prPhotos)) {
            for (const url of prPhotos) {
              if (typeof url === "string" && url.startsWith("http")) {
                extractedPhotos.push({ url, source: "assessor", capturedAt: now });
              }
            }
          }

          // Single property image URL
          if (typeof pr.PropertyImageUrl === "string" && pr.PropertyImageUrl.startsWith("http")) {
            extractedPhotos.push({ url: pr.PropertyImageUrl, source: "assessor", capturedAt: now });
          }

          // Google Street View from coordinates
          const lat = toNumber(pr.Latitude);
          const lng = toNumber(pr.Longitude);
          if (lat && lng) {
            extractedPhotos.push({
              url: `/api/street-view?lat=${lat}&lng=${lng}`,
              source: "google_street_view",
              capturedAt: now,
            });
          }

          if (extractedPhotos.length === 0) {
            skipped++;
            continue;
          }

          // Update property with extracted photos
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateErr } = await (sb.from("properties") as any)
            .update({
              owner_flags: {
                ...flags,
                photos: extractedPhotos,
                photos_fetched_at: now,
              },
            })
            .eq("id", prop.id);

          if (updateErr) {
            errors.push(`${prop.id}: ${updateErr.message}`);
          } else {
            updated++;
          }
        } catch (err) {
          errors.push(`${prop.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "admin.backfill_photos",
      entity_type: "system",
      entity_id: "backfill_photos",
      details: {
        total: properties.length,
        needsPhotos: needsPhotos.length,
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
      needsPhotos: needsPhotos.length,
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
