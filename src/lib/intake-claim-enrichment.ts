import { normalizeCounty } from "@/lib/dedup";
import { resolveMarketCity } from "@/lib/inbound-intake";
import {
  getCountyData,
  isCountySupported,
  querySpokaneOwnerByAddress,
} from "@/lib/county-data";
import { fanOutAgents, isOpenClawConfigured, type PropertyPhoto } from "@/lib/openclaw-client";

type SupabaseLike = {
  from: (table: string) => {
    select: (...args: unknown[]) => unknown;
    update: (...args: unknown[]) => unknown;
  };
};

interface RunClaimEnrichmentArgs {
  sb: SupabaseLike;
  propertyId: string;
  leadId: string;
}

interface PropertyRow {
  id: string;
  owner_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  apn: string | null;
  lat?: number | null;
  lng?: number | null;
  owner_flags?: Record<string, unknown> | null;
}

function isPlaceholderValue(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0
    || normalized === "unknown"
    || normalized === "unknown owner"
    || normalized === "address tbd"
    || normalized === "tbd"
    || normalized === "n/a";
}

function hasUsableApn(apn: string | null | undefined): apn is string {
  if (!apn) return false;
  const trimmed = apn.trim();
  if (!trimmed) return false;
  return !/^(TBD|UNKNOWN|CRAWL-|TEMP-|MANUAL-|CSV-)/i.test(trimmed);
}

function mergePhotos(
  existing: unknown,
  incoming: PropertyPhoto[],
): Array<{ url: string; source: string; capturedAt: string }> {
  const base = Array.isArray(existing) ? existing : [];
  const seen = new Set<string>();
  const merged: Array<{ url: string; source: string; capturedAt: string }> = [];

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

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_STREET_VIEW_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    address,
    key: apiKey,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;
  const payload = await response.json() as {
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    status?: string;
  };
  const location = payload.results?.[0]?.geometry?.location;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }
  return { lat: location.lat, lng: location.lng };
}

function buildStreetViewPhotos(lat: number, lng: number, capturedAt: string): PropertyPhoto[] {
  const photos: PropertyPhoto[] = [];
  for (const heading of ["0", "90", "180", "270"]) {
    photos.push({
      url: `/api/street-view?lat=${lat}&lng=${lng}&size=800x400&heading=${heading}`,
      source: "google_street_view",
      capturedAt,
    });
  }
  photos.push({
    url: `/api/street-view?lat=${lat}&lng=${lng}&size=800x400&type=satellite&zoom=19`,
    source: "satellite",
    capturedAt,
  });
  return photos;
}

async function fetchProperty(
  sb: SupabaseLike,
  propertyId: string,
): Promise<PropertyRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("properties") as any)
    .select("id, owner_name, address, city, state, zip, county, apn, lat, lng, owner_flags")
    .eq("id", propertyId)
    .single();

  if (error || !data) {
    console.error("[IntakeClaimEnrichment] Failed to load property:", error);
    return null;
  }

  return data as PropertyRow;
}

export async function runClaimEnrichment({
  sb,
  propertyId,
  leadId,
}: RunClaimEnrichmentArgs): Promise<void> {
  const property = await fetchProperty(sb, propertyId);
  if (!property) return;

  const now = new Date().toISOString();
  const flags = (property.owner_flags ?? {}) as Record<string, unknown>;
  const county = normalizeCounty(property.county ?? "", "");
  const updates: Record<string, unknown> = {};
  const flagUpdates: Record<string, unknown> = {
    claim_enrichment_started_at: now,
    claim_enrichment_lead_id: leadId,
  };
  let resolvedLat = typeof property.lat === "number" ? property.lat : null;
  let resolvedLng = typeof property.lng === "number" ? property.lng : null;
  const normalizedCity = resolveMarketCity(property.city, property.zip).city;

  if (normalizedCity && normalizedCity !== property.city) {
    updates.city = normalizedCity;
  }

  try {
    let countyOwnerData: Awaited<ReturnType<typeof getCountyData>>["owner"] | null = null;
    let countySales: Awaited<ReturnType<typeof getCountyData>>["sales"] = [];

    if (county && isCountySupported(county)) {
      if (hasUsableApn(property.apn)) {
        const countyData = await getCountyData(county, property.apn);
        countyOwnerData = countyData.owner;
        countySales = countyData.sales;
      } else if (county.toLowerCase().includes("spokane") && property.address) {
        const matches = await querySpokaneOwnerByAddress(property.address, 1);
        countyOwnerData = matches[0] ?? null;
      }
    }

    if (countyOwnerData) {
      if (!hasUsableApn(property.apn) && hasUsableApn(countyOwnerData.apn)) {
        updates.apn = countyOwnerData.apn;
      }
      if (isPlaceholderValue(property.owner_name) && countyOwnerData.ownerName) {
        updates.owner_name = countyOwnerData.ownerName;
      }
      if (isPlaceholderValue(property.address) && countyOwnerData.siteAddress) {
        updates.address = countyOwnerData.siteAddress;
      }
      if (isPlaceholderValue(property.state) && countyOwnerData.siteState) {
        updates.state = countyOwnerData.siteState;
      }
      if (isPlaceholderValue(property.zip) && countyOwnerData.siteZip) {
        updates.zip = countyOwnerData.siteZip;
      }

      flagUpdates.county_data = {
        owner_name: countyOwnerData.ownerName,
        site_address: countyOwnerData.siteAddress,
        site_state: countyOwnerData.siteState,
        site_zip: countyOwnerData.siteZip,
        tax_year: countyOwnerData.taxYear,
        seg_status: countyOwnerData.segStatus,
        exemption_amount: countyOwnerData.exemptionAmount,
        sales_summary: countySales.slice(0, 5).map((sale) => ({
          parcel: sale.parcel,
          gross_sale_price: sale.grossSalePrice,
          document_date: sale.documentDate,
          year: sale.year,
        })),
      };
      flagUpdates.county_data_at = now;
    }
  } catch (error) {
    flagUpdates.claim_enrichment_county_error = error instanceof Error ? error.message : String(error);
  }

  try {
    if (isOpenClawConfigured() && property.address) {
      const { results } = await fanOutAgents([
        {
          agentId: "property_photos",
          timeout: 20_000,
          payload: {
            ownerName: property.owner_name ?? "Unknown",
            address: property.address,
            city: property.city ?? "",
            state: property.state ?? "",
            county: county || property.county || "",
            apn: property.apn ?? undefined,
            lat: typeof property.lat === "number" ? property.lat : undefined,
            lng: typeof property.lng === "number" ? property.lng : undefined,
          },
        },
      ]);

      const photoResult = results.find((result) => result.agentId === "property_photos");
      const photos = photoResult?.photos ?? [];
      if (photos.length > 0) {
        flagUpdates.photos = mergePhotos(flags.photos, photos);
        flagUpdates.photos_fetched_at = now;
      }
      if (photoResult && !photoResult.success && photoResult.error) {
        flagUpdates.claim_enrichment_photo_error = photoResult.error;
      }
    }
  } catch (error) {
    flagUpdates.claim_enrichment_photo_error = error instanceof Error ? error.message : String(error);
  }

  try {
    const alreadyHasPhotos = Array.isArray(flagUpdates.photos) ? flagUpdates.photos.length > 0 : Array.isArray(flags.photos) && flags.photos.length > 0;
    if (!alreadyHasPhotos) {
      const bestAddress = [
        (updates.address as string | undefined) ?? property.address ?? "",
        (updates.city as string | undefined) ?? property.city ?? "",
        (updates.state as string | undefined) ?? property.state ?? "",
        (updates.zip as string | undefined) ?? property.zip ?? "",
      ].filter(Boolean).join(", ");

      if ((!resolvedLat || !resolvedLng) && bestAddress) {
        const geocoded = await geocodeAddress(bestAddress);
        if (geocoded) {
          resolvedLat = geocoded.lat;
          resolvedLng = geocoded.lng;
          updates.lat = geocoded.lat;
          updates.lng = geocoded.lng;
        }
      }

      if (resolvedLat && resolvedLng) {
        const fallbackPhotos = buildStreetViewPhotos(resolvedLat, resolvedLng, now);
        flagUpdates.photos = mergePhotos(flags.photos, fallbackPhotos);
        flagUpdates.photos_fetched_at = now;
        flagUpdates.photo_fallback = "google_street_view";
      }
    }
  } catch (error) {
    flagUpdates.claim_enrichment_photo_error = error instanceof Error ? error.message : String(error);
  }

  updates.owner_flags = {
    ...flags,
    ...flagUpdates,
    claim_enrichment_completed_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (sb.from("properties") as any)
    .update(updates)
    .eq("id", propertyId);

  if (updateError) {
    console.error("[IntakeClaimEnrichment] Failed to persist enrichment:", updateError);
  }
}
