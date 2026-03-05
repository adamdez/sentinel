import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/property-lookup/suggestions
 *
 * Returns nationwide address suggestions for autocomplete using Google Geocoding.
 * When user selects a suggestion, the full formatted address is sent to
 * /api/property-lookup for the PropertyRadar deep lookup.
 *
 * Input: { query: string }
 * Returns: { suggestions: AddressSuggestion[] }
 */

export const dynamic = "force-dynamic";

interface AddressSuggestion {
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  placeId: string;
  lat: number | null;
  lng: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== "string" || query.trim().length < 5) {
      return NextResponse.json({ suggestions: [] });
    }

    // Use the same Google key as street view — Geocoding API
    const googleKey = process.env.GOOGLE_STREET_VIEW_KEY;
    if (!googleKey) {
      return NextResponse.json({ suggestions: [] });
    }

    // Google Geocoding API — supports partial addresses, returns formatted results
    const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    geoUrl.searchParams.set("address", query.trim());
    geoUrl.searchParams.set("components", "country:US");
    geoUrl.searchParams.set("key", googleKey);

    const geoRes = await fetch(geoUrl.toString(), {
      signal: AbortSignal.timeout(5_000),
    });

    if (!geoRes.ok) {
      console.error("[suggestions] Google Geocoding error:", geoRes.status);
      return NextResponse.json({ suggestions: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoData: any = await geoRes.json();

    if (geoData.status !== "OK" || !Array.isArray(geoData.results)) {
      return NextResponse.json({ suggestions: [] });
    }

    // Filter to street-level addresses (not just cities/states)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suggestions: AddressSuggestion[] = geoData.results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => {
        const types: string[] = r.types ?? [];
        // Must be a street address or premise, not just a city/state/zip
        return types.includes("street_address") ||
               types.includes("premise") ||
               types.includes("subpremise") ||
               types.includes("route");
      })
      .slice(0, 8)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const components = r.address_components ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const get = (type: string) => components.find((c: any) => c.types?.includes(type));

        const streetNumber = get("street_number")?.long_name ?? "";
        const route = get("route")?.short_name ?? "";
        const city = get("locality")?.long_name ?? get("sublocality")?.long_name ?? "";
        const state = get("administrative_area_level_1")?.short_name ?? "";
        const zip = get("postal_code")?.long_name ?? "";

        const streetAddr = [streetNumber, route].filter(Boolean).join(" ");

        return {
          address: streetAddr,
          city,
          state,
          zip,
          fullAddress: [streetAddr, city, state, zip].filter(Boolean).join(", "),
          placeId: r.place_id ?? "",
          lat: r.geometry?.location?.lat ?? null,
          lng: r.geometry?.location?.lng ?? null,
        };
      });

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[suggestions] Error:", err);
    return NextResponse.json({ suggestions: [] });
  }
}
