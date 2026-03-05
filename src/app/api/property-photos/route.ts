import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/property-photos
 *
 * Fetches property photos using a multi-source strategy:
 *   1. DB cache check (instant)
 *   2. Google Place Photos via Find Place API (fast, reliable, up to 10 photos)
 *   3. Apify Zillow scraper (slow fallback, may fail)
 *   4. Google Street View as guaranteed fallback (always at least 1 photo)
 *
 * Input: { address: string, property_id?: string, lat?: number, lng?: number }
 * Returns: { photos: PropertyPhoto[], cached?: boolean }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APIFY_ACTOR = "zillowscraper~zillow-property-images-fetcher";

interface PropertyPhoto {
  url: string;
  source: "google_street_view" | "google_places" | "zillow" | "redfin" | "assessor" | "satellite";
  capturedAt: string;
  thumbnail?: string;
}

function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Google Place Photos ──────────────────────────────────────────────────

async function fetchGooglePlacePhotos(
  address: string,
  googleKey: string,
): Promise<PropertyPhoto[]> {
  const now = new Date().toISOString();
  const photos: PropertyPhoto[] = [];

  try {
    // Step 1: Find the place by address to get place_id + photo references
    const findUrl = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
    findUrl.searchParams.set("input", address);
    findUrl.searchParams.set("inputtype", "textquery");
    findUrl.searchParams.set("fields", "place_id,photos,geometry");
    findUrl.searchParams.set("key", googleKey);

    const findRes = await fetch(findUrl.toString(), {
      signal: AbortSignal.timeout(5_000),
    });

    if (!findRes.ok) {
      console.warn("[property-photos] Google Find Place error:", findRes.status);
      return photos;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findData: any = await findRes.json();

    if (findData.status !== "OK" || !findData.candidates?.length) {
      return photos;
    }

    const candidate = findData.candidates[0];
    const photoRefs = candidate.photos ?? [];

    if (photoRefs.length === 0) return photos;

    // Step 2: Resolve each photo_reference to a permanent CDN URL
    // Google Place Photo API returns a 302 redirect to a CDN URL that works without a key
    const resolvePromises = photoRefs.slice(0, 10).map(async (photo: { photo_reference: string }) => {
      try {
        const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
        photoUrl.searchParams.set("maxwidth", "800");
        photoUrl.searchParams.set("photo_reference", photo.photo_reference);
        photoUrl.searchParams.set("key", googleKey);

        const photoRes = await fetch(photoUrl.toString(), {
          redirect: "manual", // Don't follow redirect — we want the CDN URL
          signal: AbortSignal.timeout(5_000),
        });

        // The 302 Location header contains the permanent CDN URL
        const cdnUrl = photoRes.headers.get("location");
        if (cdnUrl) {
          return { url: cdnUrl, source: "google_places" as const, capturedAt: now };
        }

        // Some responses return 200 with the image directly — use our proxy URL instead
        if (photoRes.status === 200) {
          return {
            url: photoUrl.toString(),
            source: "google_places" as const,
            capturedAt: now,
          };
        }

        return null;
      } catch {
        return null;
      }
    });

    const resolved = await Promise.all(resolvePromises);
    for (const photo of resolved) {
      if (photo) photos.push(photo);
    }
  } catch (err) {
    console.warn("[property-photos] Google Place Photos error:", err);
  }

  return photos;
}

// ── Apify Zillow Photos ──────────────────────────────────────────────────

async function fetchApifyZillowPhotos(
  address: string,
  apifyToken: string,
): Promise<PropertyPhoto[]> {
  const now = new Date().toISOString();
  const photos: PropertyPhoto[] = [];

  try {
    // Start the actor run asynchronously
    const startUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${apifyToken}`;
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
      console.warn("[property-photos] Apify start error:", startRes.status);
      return photos;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startData: any = await startRes.json();
    const runId = startData?.data?.id;
    if (!runId) return photos;

    // Poll for run completion (max ~40s)
    const pollStart = Date.now();
    const MAX_POLL_MS = 40_000;
    const POLL_INTERVAL = 2_000;
    let runStatus = "";

    while (Date.now() - pollStart < MAX_POLL_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!statusRes.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusData: any = await statusRes.json();
      runStatus = statusData?.data?.status;
      if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(runStatus)) break;
    }

    if (runStatus !== "SUCCEEDED") return photos;

    // Fetch dataset items
    const datasetRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyToken}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!datasetRes.ok) return photos;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apifyData: any[] = await datasetRes.json();

    for (const item of apifyData) {
      if (typeof item === "string") {
        photos.push({ url: item, source: "zillow", capturedAt: now });
      } else if (item?.url) {
        photos.push({ url: item.url, source: "zillow", capturedAt: now, thumbnail: item.thumbnail });
      } else if (item?.imageUrl) {
        photos.push({ url: item.imageUrl, source: "zillow", capturedAt: now });
      } else if (item?.hdUrl) {
        photos.push({ url: item.hdUrl, source: "zillow", capturedAt: now });
      } else if (item?.mixedSources?.jpeg) {
        const jpegs = item.mixedSources.jpeg;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  } catch (err) {
    console.warn("[property-photos] Apify Zillow error:", err);
  }

  return photos;
}

// ── Main endpoint ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, property_id, lat, lng } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const googleKey = process.env.GOOGLE_STREET_VIEW_KEY;
    const apifyToken = process.env.APIFY_API_TOKEN;
    const now = new Date().toISOString();

    // ── 1. Check DB cache ───────────────────────────────────────────────
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

    // ── 2. Google Place Photos (primary — fast, reliable) ───────────────
    let photos: PropertyPhoto[] = [];

    if (googleKey) {
      photos = await fetchGooglePlacePhotos(address, googleKey);
    }

    // ── 3. Apify Zillow (secondary — slow, richer interior photos) ─────
    if (photos.length === 0 && apifyToken) {
      photos = await fetchApifyZillowPhotos(address, apifyToken);
    }

    // ── 4. Street View guaranteed fallback ──────────────────────────────
    // Always add a Street View photo if we have coordinates or Google key
    if (googleKey && lat && lng) {
      const svUrl = `/api/street-view?lat=${lat}&lng=${lng}&size=800x400`;
      // Only add if not already in the list
      if (!photos.some((p) => p.source === "google_street_view")) {
        photos.push({
          url: svUrl,
          source: "google_street_view",
          capturedAt: now,
        });
      }
    }

    // ── 5. Cache in DB ──────────────────────────────────────────────────
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
