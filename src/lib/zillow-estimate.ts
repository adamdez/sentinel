import { createServerClient } from "@/lib/supabase";
import { firecrawlAdapter } from "@/providers/firecrawl/adapter";

type ServerClient = ReturnType<typeof createServerClient>;

export interface ZillowEstimateRefreshResult {
  status: "updated" | "missing" | "skipped" | "error";
  estimate: number | null;
  sourceUrl: string | null;
  error?: string;
}

export async function refreshZillowEstimateForProperty(params: {
  propertyId: string;
  sb?: ServerClient;
}): Promise<ZillowEstimateRefreshResult> {
  const sb = params.sb ?? createServerClient();
  const nowIso = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property, error: propertyError } = await (sb.from("properties") as any)
    .select("id, address, city, state, zip, owner_flags")
    .eq("id", params.propertyId)
    .single();

  if (propertyError || !property) {
    return {
      status: "error",
      estimate: null,
      sourceUrl: null,
      error: propertyError?.message ?? "Property not found",
    };
  }

  const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;

  if (!firecrawlAdapter.isConfigured()) {
    return {
      status: "skipped",
      estimate: typeof ownerFlags.zillow_estimate === "number" ? ownerFlags.zillow_estimate : null,
      sourceUrl: typeof ownerFlags.zillow_estimate_source_url === "string"
        ? ownerFlags.zillow_estimate_source_url
        : null,
      error: "FIRECRAWL_API_KEY not configured",
    };
  }

  if (typeof property.address !== "string" || property.address.trim().length === 0) {
    return {
      status: "error",
      estimate: typeof ownerFlags.zillow_estimate === "number" ? ownerFlags.zillow_estimate : null,
      sourceUrl: typeof ownerFlags.zillow_estimate_source_url === "string"
        ? ownerFlags.zillow_estimate_source_url
        : null,
      error: "Property address missing",
    };
  }

  try {
    const result = await firecrawlAdapter.lookupZillowEstimate({
      address: property.address,
      city: typeof property.city === "string" ? property.city : undefined,
      state: typeof property.state === "string" ? property.state : undefined,
      zip: typeof property.zip === "string" ? property.zip : undefined,
    });

    const nextFlags: Record<string, unknown> = {
      ...ownerFlags,
      zillow_estimate_attempted_at: nowIso,
      zillow_estimate_provider: "firecrawl",
      zillow_estimate_last_error: result.error ?? null,
      zillow_estimate_last_status: result.estimate != null ? "updated" : "missing",
    };

    if (result.estimate != null) {
      nextFlags.zillow_estimate = result.estimate;
      nextFlags.zillow_estimate_updated_at = result.fetchedAt;
      nextFlags.zillow_estimate_source_url = result.sourceUrl;
      nextFlags.zillow_estimate_confidence = result.confidence;
      nextFlags.zillow_rent_estimate = result.rentEstimate;
      nextFlags.zillow_listing_price = result.listingPrice;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (sb.from("properties") as any)
      .update({ owner_flags: nextFlags })
      .eq("id", params.propertyId);

    if (updateError) {
      return {
        status: "error",
        estimate: result.estimate,
        sourceUrl: result.sourceUrl,
        error: updateError.message,
      };
    }

    return {
      status: result.estimate != null ? "updated" : "missing",
      estimate: result.estimate,
      sourceUrl: result.sourceUrl,
      error: result.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Zillow refresh error";
    const nextFlags: Record<string, unknown> = {
      ...ownerFlags,
      zillow_estimate_attempted_at: nowIso,
      zillow_estimate_provider: "firecrawl",
      zillow_estimate_last_status: "error",
      zillow_estimate_last_error: message,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any)
      .update({ owner_flags: nextFlags })
      .eq("id", params.propertyId);

    return {
      status: "error",
      estimate: typeof ownerFlags.zillow_estimate === "number" ? ownerFlags.zillow_estimate : null,
      sourceUrl: typeof ownerFlags.zillow_estimate_source_url === "string"
        ? ownerFlags.zillow_estimate_source_url
        : null,
      error: message,
    };
  }
}

export async function refreshZillowEstimateForLeadAssignment(params: {
  leadId: string;
  propertyId?: string | null;
  sb?: ServerClient;
}): Promise<ZillowEstimateRefreshResult> {
  const sb = params.sb ?? createServerClient();
  let propertyId = params.propertyId ?? null;

  if (!propertyId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadError } = await (sb.from("leads") as any)
      .select("property_id")
      .eq("id", params.leadId)
      .single();

    if (leadError || !lead?.property_id) {
      return {
        status: "error",
        estimate: null,
        sourceUrl: null,
        error: leadError?.message ?? "Lead property not found",
      };
    }

    propertyId = lead.property_id as string;
  }

  return refreshZillowEstimateForProperty({
    propertyId,
    sb,
  });
}
