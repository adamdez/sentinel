import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/street-view?lat=...&lng=...&size=640x480
 *
 * Server-side proxy for Google Street View Static API.
 * Keeps the API key secret (never exposed to client).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const size = searchParams.get("size") ?? "640x480";

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_STREET_VIEW_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Street View not configured" }, { status: 503 });
  }

  const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&key=${apiKey}`;

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
