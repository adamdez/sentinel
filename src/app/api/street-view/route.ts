import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/street-view?lat=...&lng=...&size=640x480&heading=0&type=streetview
 *
 * Server-side proxy for Google Street View Static API and Google Maps Static API.
 * Keeps the API key secret (never exposed to client).
 *
 * Production: set `GOOGLE_STREET_VIEW_KEY` in Vercel (same key used by Places + Static Street View + Static Maps).
 * Returns 503 JSON `{ error: "Street View not configured" }` if the env var is missing.
 *
 * Parameters:
 *   lat, lng  — required coordinates
 *   size      — image size (default 640x480)
 *   heading   — camera heading 0-360 (default: auto / best view)
 *   pitch     — camera pitch (default 0)
 *   fov       — field of view (default 90)
 *   type      — "streetview" (default) or "satellite" for aerial view
 *   zoom      — satellite zoom level (default 19)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const size = searchParams.get("size") ?? "640x480";
  const heading = searchParams.get("heading");
  const pitch = searchParams.get("pitch") ?? "0";
  const fov = searchParams.get("fov") ?? "90";
  const type = searchParams.get("type") ?? "streetview";
  const zoom = searchParams.get("zoom") ?? "19";

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_STREET_VIEW_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Street View not configured" }, { status: 503 });
  }

  let url: string;

  if (type === "satellite") {
    // Google Maps Static API — satellite/aerial view
    url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}&maptype=satellite&key=${apiKey}`;
  } else {
    // Google Street View Static API
    url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&pitch=${pitch}&fov=${fov}&key=${apiKey}`;
    if (heading) {
      url += `&heading=${heading}`;
    }
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `Google API ${res.status}` }, { status: 502 });
    }

    const imageBuffer = await res.arrayBuffer();
    return new Response(imageBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, immutable", // 7 day cache
      },
    });
  } catch (err) {
    console.error("[StreetView] Proxy error:", err);
    return NextResponse.json({ error: "Failed to fetch Street View" }, { status: 500 });
  }
}
