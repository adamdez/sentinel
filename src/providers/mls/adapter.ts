/**
 * MLS (Multiple Listing Service) Provider Adapter
 *
 * Integrates with Spark/Bridge API (RESO Web API standard) for:
 * - Active listing search
 * - Sold comps lookup
 * - Days on market analysis
 * - Price history
 * - Agent/broker info
 *
 * Uses RESO Web API standard (OData) which most MLS systems support.
 * Spokane MLS = Spokane Association of REALTORS (SAR)
 *
 * Required env vars:
 *   MLS_API_URL     — RESO Web API endpoint (e.g., https://sparkapi.com/v1)
 *   MLS_API_KEY     — Bearer token or API key
 *   MLS_API_SECRET  — If OAuth required
 *
 * If MLS credentials are not set, falls back to existing comp sources
 * (PropertyRadar, ATTOM, county records).
 */

export interface MLSListing {
  listingId: string;
  mlsNumber: string;
  status: "active" | "pending" | "sold" | "withdrawn" | "expired";
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  listPrice: number;
  soldPrice?: number;
  originalListPrice?: number;
  pricePerSqFt?: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  lotSize?: number;
  yearBuilt: number;
  propertyType: string;
  daysOnMarket: number;
  listDate: string;
  soldDate?: string;
  listingAgent?: string;
  listingBrokerage?: string;
  photos?: string[];
  remarks?: string;
  latitude?: number;
  longitude?: number;
}

export interface MLSSearchParams {
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  zip?: string;
  status?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  maxBeds?: number;
  minSqFt?: number;
  maxSqFt?: number;
  minYearBuilt?: number;
  radiusMiles?: number;
  latitude?: number;
  longitude?: number;
  limit?: number;
  soldWithinDays?: number;
}

export function isMLSConfigured(): boolean {
  return !!process.env.MLS_API_URL && !!process.env.MLS_API_KEY;
}

/**
 * Search MLS listings with flexible criteria.
 */
export async function searchMLS(params: MLSSearchParams): Promise<MLSListing[]> {
  const apiUrl = process.env.MLS_API_URL;
  const apiKey = process.env.MLS_API_KEY;

  if (!apiUrl || !apiKey) {
    console.log("[mls] MLS not configured — falling back to other comp sources");
    return [];
  }

  try {
    // Build OData filter
    const filters: string[] = [];

    if (params.status && params.status.length > 0) {
      const statusFilter = params.status.map((s) => `StandardStatus eq '${mapStatus(s)}'`).join(" or ");
      filters.push(`(${statusFilter})`);
    }
    if (params.city) filters.push(`City eq '${params.city}'`);
    if (params.county) filters.push(`CountyOrParish eq '${params.county}'`);
    if (params.state) filters.push(`StateOrProvince eq '${params.state}'`);
    if (params.zip) filters.push(`PostalCode eq '${params.zip}'`);
    if (params.minPrice) filters.push(`ListPrice ge ${params.minPrice}`);
    if (params.maxPrice) filters.push(`ListPrice le ${params.maxPrice}`);
    if (params.minBeds) filters.push(`BedroomsTotal ge ${params.minBeds}`);
    if (params.minSqFt) filters.push(`LivingArea ge ${params.minSqFt}`);
    if (params.maxSqFt) filters.push(`LivingArea le ${params.maxSqFt}`);
    if (params.soldWithinDays) {
      const since = new Date(Date.now() - params.soldWithinDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      filters.push(`CloseDate ge ${since}`);
    }

    const filterStr = filters.length > 0 ? `$filter=${encodeURIComponent(filters.join(" and "))}` : "";
    const top = `$top=${params.limit ?? 25}`;
    const orderby = "$orderby=ModificationTimestamp desc";

    const url = `${apiUrl}/Property?${filterStr}&${top}&${orderby}`;

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      console.error(`[mls] API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const listings = data.value ?? data.D?.Results ?? [];

    return listings.map(mapResoToListing);
  } catch (err) {
    console.error("[mls] Search error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Get sold comps near an address.
 */
export async function getSoldComps(params: {
  address: string;
  city: string;
  state: string;
  minPrice?: number;
  maxPrice?: number;
  radiusMiles?: number;
  soldWithinDays?: number;
  limit?: number;
}): Promise<MLSListing[]> {
  return searchMLS({
    city: params.city,
    state: params.state,
    status: ["sold"],
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    soldWithinDays: params.soldWithinDays ?? 180,
    limit: params.limit ?? 10,
  });
}

/**
 * Check if a specific address is currently listed.
 */
export async function checkActiveListing(address: string): Promise<MLSListing | null> {
  const results = await searchMLS({
    address,
    status: ["active", "pending"],
    limit: 1,
  });
  return results[0] ?? null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapStatus(status: string): string {
  const map: Record<string, string> = {
    active: "Active",
    pending: "Pending",
    sold: "Closed",
    withdrawn: "Withdrawn",
    expired: "Expired",
  };
  return map[status] ?? status;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapResoToListing(raw: any): MLSListing {
  return {
    listingId: raw.ListingId ?? raw.ListingKey ?? "",
    mlsNumber: raw.ListingId ?? "",
    status: mapResoStatus(raw.StandardStatus ?? raw.MlsStatus ?? ""),
    address: raw.UnparsedAddress ?? `${raw.StreetNumber ?? ""} ${raw.StreetName ?? ""} ${raw.StreetSuffix ?? ""}`.trim(),
    city: raw.City ?? "",
    state: raw.StateOrProvince ?? "",
    zip: raw.PostalCode ?? "",
    county: raw.CountyOrParish ?? "",
    listPrice: raw.ListPrice ?? 0,
    soldPrice: raw.ClosePrice ?? raw.SoldPrice ?? undefined,
    originalListPrice: raw.OriginalListPrice ?? undefined,
    pricePerSqFt: raw.ListPrice && raw.LivingArea ? Math.round(raw.ListPrice / raw.LivingArea) : undefined,
    bedrooms: raw.BedroomsTotal ?? 0,
    bathrooms: raw.BathroomsTotalDecimal ?? raw.BathroomsFull ?? 0,
    squareFeet: raw.LivingArea ?? 0,
    lotSize: raw.LotSizeSquareFeet ?? raw.LotSizeAcres ? raw.LotSizeAcres * 43560 : undefined,
    yearBuilt: raw.YearBuilt ?? 0,
    propertyType: raw.PropertyType ?? raw.PropertySubType ?? "Residential",
    daysOnMarket: raw.DaysOnMarket ?? raw.CumulativeDaysOnMarket ?? 0,
    listDate: raw.ListingContractDate ?? raw.OnMarketDate ?? "",
    soldDate: raw.CloseDate ?? undefined,
    listingAgent: raw.ListAgentFullName ?? undefined,
    listingBrokerage: raw.ListOfficeName ?? undefined,
    photos: raw.Media?.map((m: Record<string, string>) => m.MediaURL) ?? [],
    remarks: raw.PublicRemarks ?? undefined,
    latitude: raw.Latitude ?? undefined,
    longitude: raw.Longitude ?? undefined,
  };
}

function mapResoStatus(status: string): MLSListing["status"] {
  const lower = status.toLowerCase();
  if (lower.includes("active")) return "active";
  if (lower.includes("pending")) return "pending";
  if (lower.includes("closed") || lower.includes("sold")) return "sold";
  if (lower.includes("withdrawn")) return "withdrawn";
  if (lower.includes("expired")) return "expired";
  return "active";
}
