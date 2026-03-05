import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/property-photos
 *
 * Fetches property photos from Zillow via Apify, with DB caching.
 * Input: { address: string, property_id?: string }
 * Returns: { photos: PropertyPhoto[] }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Apify sync runs take 15-45s

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

    // ── Call Apify Zillow Property Images Fetcher (async start + poll) ─
    // Start the actor run asynchronously
    const startUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${token}`;
    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchType: "address",
        searchQuery: address,
        maxItems: 30,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => "");
      console.error("[property-photos] Apify start error:", startRes.status, errText.slice(0, 300));
      return NextResponse.json({ error: "Photo fetch failed", photos: [] }, { status: 502 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startData: any = await startRes.json();
    const runId = startData?.data?.id;
    if (!runId) {
      console.error("[property-photos] No run ID from Apify");
      return NextResponse.json({ error: "Photo fetch failed", photos: [] }, { status: 502 });
    }

    // Poll for run completion (max ~50s to stay within maxDuration)
    const pollStart = Date.now();
    const MAX_POLL_MS = 50_000;
    const POLL_INTERVAL = 2_000;
    let runStatus = "";

    while (Date.now() - pollStart < MAX_POLL_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!statusRes.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusData: any = await statusRes.json();
      runStatus = statusData?.data?.status;
      if (runStatus === "SUCCEEDED" || runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
        break;
      }
    }

    if (runStatus !== "SUCCEEDED") {
      console.error("[property-photos] Apify run did not succeed:", runStatus || "TIMEOUT");
      return NextResponse.json({ error: "Photo fetch timed out", photos: [] }, { status: 504 });
    }

    // Fetch dataset items
    const datasetRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`,
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!datasetRes.ok) {
      console.error("[property-photos] Dataset fetch error:", datasetRes.status);
      return NextResponse.json({ error: "Photo fetch failed", photos: [] }, { status: 502 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apifyData: any[] = await datasetRes.json();

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
