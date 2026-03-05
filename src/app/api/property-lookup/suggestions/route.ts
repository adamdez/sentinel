import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/property-lookup/suggestions
 *
 * Returns nationwide address autocomplete suggestions using Google Places Autocomplete.
 * When user selects a suggestion, the full formatted address is sent to
 * /api/property-lookup for the PropertyRadar deep lookup.
 *
 * Input: { query: string, sessionToken?: string }
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
    const { query, sessionToken } = body;

    if (!query || typeof query !== "string" || query.trim().length < 5) {
      return NextResponse.json({ suggestions: [] });
    }

    const googleKey = process.env.GOOGLE_STREET_VIEW_KEY;
    if (!googleKey) {
      return NextResponse.json({ suggestions: [] });
    }

    // ── Google Places Autocomplete API ─────────────────────────────────
    // Returns multiple matching addresses as the user types, unlike Geocoding
    // which resolves a single "best guess" address.
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", query.trim());
    url.searchParams.set("types", "address");
    url.searchParams.set("components", "country:us");
    url.searchParams.set("key", googleKey);
    if (sessionToken) {
      url.searchParams.set("sessiontoken", sessionToken);
    }

    const acRes = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5_000),
    });

    if (!acRes.ok) {
      console.error("[suggestions] Places Autocomplete error:", acRes.status);
      return NextResponse.json({ suggestions: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acData: any = await acRes.json();
    if (acData.status !== "OK" || !Array.isArray(acData.predictions)) {
      console.warn("[suggestions] Places API status:", acData.status, acData.error_message ?? "");
      // If Places API isn't enabled, fall back to Geocoding
      if (acData.status === "REQUEST_DENIED" || acData.status === "OVER_QUERY_LIMIT") {
        console.warn("[suggestions] Falling back to Geocoding");
        return geocodingFallback(query, googleKey);
      }
      return NextResponse.json({ suggestions: [] });
    }

    // Parse autocomplete predictions into our suggestion format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suggestions: AddressSuggestion[] = acData.predictions.map((p: any) => {
      const main = p.structured_formatting?.main_text ?? "";
      const secondary = p.structured_formatting?.secondary_text ?? "";

      // Parse "City, State ZIP, USA" from secondary text
      const parts = secondary.replace(/, USA$/, "").split(", ");
      const city = parts[0] ?? "";
      const stateZip = parts[1] ?? "";
      const [state, zip] = stateZip.includes(" ")
        ? [stateZip.split(" ")[0], stateZip.split(" ").slice(1).join(" ")]
        : [stateZip, ""];

      return {
        address: main,
        city,
        state,
        zip,
        fullAddress: p.description?.replace(/, USA$/, "") ?? [main, city, state, zip].filter(Boolean).join(", "),
        placeId: p.place_id ?? "",
        lat: null,
        lng: null,
      };
    });

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[suggestions] Error:", err);
    return NextResponse.json({ suggestions: [] });
  }
}

/** Fallback to Geocoding if Places API isn't enabled on the key */
async function geocodingFallback(query: string, googleKey: string): Promise<NextResponse> {
  const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geoUrl.searchParams.set("address", query.trim());
  geoUrl.searchParams.set("components", "country:US");
  geoUrl.searchParams.set("key", googleKey);

  const geoRes = await fetch(geoUrl.toString(), { signal: AbortSignal.timeout(5_000) });
  if (!geoRes.ok) return NextResponse.json({ suggestions: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoData: any = await geoRes.json();
  if (geoData.status !== "OK" || !Array.isArray(geoData.results)) {
    return NextResponse.json({ suggestions: [] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suggestions = geoData.results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((r: any) => {
      const types: string[] = r.types ?? [];
      return types.includes("street_address") || types.includes("premise") ||
             types.includes("subpremise") || types.includes("route");
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
        address: streetAddr, city, state, zip,
        fullAddress: [streetAddr, city, state, zip].filter(Boolean).join(", "),
        placeId: r.place_id ?? "",
        lat: r.geometry?.location?.lat ?? null,
        lng: r.geometry?.location?.lng ?? null,
      };
    });

  return NextResponse.json({ suggestions });
}
