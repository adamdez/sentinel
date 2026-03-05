import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/property-photos
 *
 * Fetches property photos from Zillow via Apify, with DB caching.
 * Input: { address: string, property_id?: string }
 * Returns: { photos: PropertyPhoto[] }
 */

const APIFY_ACTOR = "zillowscraper~zillow-property-images-fetcher";

interface PropertyPhoto {
  url: string;
  source: "google_street_view" | "zillow" | "redfin" | "assessor" | "satellite";
  capturedAt: string;
  thumbnail?: string;
}

function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, property_id } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Apify not configured" }, { status: 503 });
    }

    // ── Check cache first if property_id provided ─────────────────────
    if (property_id) {
      const sb = createServerClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb.from("properties") as any)
        .select("owner_flags")
        .eq("id", property_id)
        .single();

      const cached = data?.owner_flags?.photos as PropertyPhoto[] | undefined;
      if (cached && cached.length > 0) {
        return NextResponse.json({ photos: cached, cached: true });
      }
    }

    // ── Call Apify Zillow Property Images Fetcher ─────────────────────
    const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`;

    const apifyRes = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchType: "address",
        searchQuery: address,
        maxItems: 30,
      }),
      signal: AbortSignal.timeout(60_000), // 60s timeout for Apify
    });

    if (!apifyRes.ok) {
      const errText = await apifyRes.text().catch(() => "");
      console.error("[property-photos] Apify error:", apifyRes.status, errText.slice(0, 300));
      return NextResponse.json(
        { error: "Photo fetch failed", photos: [] },
        { status: 502 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apifyData: any[] = await apifyRes.json();

    // ── Normalize to PropertyPhoto[] ──────────────────────────────────
    const now = new Date().toISOString();
    const photos: PropertyPhoto[] = [];

    for (const item of apifyData) {
      // Apify returns items with image URLs — extract them
      if (typeof item === "string") {
        photos.push({ url: item, source: "zillow", capturedAt: now });
      } else if (item?.url) {
        photos.push({ url: item.url, source: "zillow", capturedAt: now, thumbnail: item.thumbnail });
      } else if (item?.imageUrl) {
        photos.push({ url: item.imageUrl, source: "zillow", capturedAt: now });
      } else if (item?.hdUrl) {
        photos.push({ url: item.hdUrl, source: "zillow", capturedAt: now });
      } else if (item?.mixedSources?.jpeg) {
        // Zillow's nested format — grab the largest resolution
        const jpegs = item.mixedSources.jpeg;
        const largest = Array.isArray(jpegs)
          ? jpegs.reduce(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (best: any, j: any) => (j.width > (best?.width ?? 0) ? j : best),
              null,
            )
          : null;
        if (largest?.url) {
          photos.push({ url: largest.url, source: "zillow", capturedAt: now });
        }
      }
    }

    // ── Cache in DB if property_id provided ───────────────────────────
    if (property_id && photos.length > 0) {
      const sb = createServerClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (sb.from("properties") as any)
        .select("owner_flags")
        .eq("id", property_id)
        .single();

      const flags = existing?.owner_flags ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("properties") as any)
        .update({
          owner_flags: { ...flags, photos, photos_fetched_at: now },
          updated_at: now,
        })
        .eq("id", property_id);
    }

    return NextResponse.json({ photos, cached: false });
  } catch (err) {
    console.error("[property-photos] Error:", err);
    return NextResponse.json({ error: "Internal server error", photos: [] }, { status: 500 });
  }
}
