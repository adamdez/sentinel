import type { SupabaseClient } from "@supabase/supabase-js";

export interface RelatedOwnerLeadSummary {
  leadId: string;
  propertyId: string;
  ownerName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  status: string | null;
  priority: number | null;
}

export function normalizeOwnerCollisionName(raw: string | null | undefined): string {
  if (!raw) return "";

  return raw
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildOwnerCollisionKey(raw: string | null | undefined): string | null {
  const normalized = normalizeOwnerCollisionName(raw);
  if (!normalized) return null;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return tokens[0];

  const stableTokens = tokens.filter((token, index) => index < 2 || token.length > 1);
  if (stableTokens.length === 0) return null;

  return stableTokens.slice(0, 2).join(" ");
}

export function ownerCollisionLabel(count: number): string {
  return `Possible same owner on ${count} other file${count === 1 ? "" : "s"}`;
}

function ownerCollisionQueryToken(raw: string | null | undefined): string | null {
  const key = buildOwnerCollisionKey(raw);
  if (!key) return null;

  return key.split(" ")[0] ?? null;
}

function leadStatusRank(status: string | null | undefined): number {
  switch ((status ?? "").toLowerCase()) {
    case "lead":
      return 7;
    case "negotiation":
      return 6;
    case "disposition":
      return 5;
    case "nurture":
      return 4;
    case "prospect":
    case "staging":
      return 3;
    case "closed":
      return 2;
    case "dead":
      return 1;
    default:
      return 0;
  }
}

export function filterRelatedOwnerLeads(
  leads: RelatedOwnerLeadSummary[],
  options?: {
    excludeLeadId?: string | null;
    excludePropertyId?: string | null;
    limit?: number;
  },
): RelatedOwnerLeadSummary[] {
  const filtered = leads.filter((lead) => {
    if (options?.excludeLeadId && lead.leadId === options.excludeLeadId) return false;
    if (options?.excludePropertyId && lead.propertyId === options.excludePropertyId) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const statusRank = leadStatusRank(b.status) - leadStatusRank(a.status);
    if (statusRank !== 0) return statusRank;

    const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;

    return (a.address ?? "").localeCompare(b.address ?? "");
  });

  return filtered.slice(0, options?.limit ?? filtered.length);
}

export async function fetchRelatedOwnerLeadCandidates(
  sb: SupabaseClient,
  ownerName: string | null | undefined,
): Promise<RelatedOwnerLeadSummary[]> {
  const lookupKey = buildOwnerCollisionKey(ownerName);
  const queryToken = ownerCollisionQueryToken(ownerName);
  if (!lookupKey || !queryToken) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: properties } = await (sb.from("properties") as any)
    .select("id, owner_name, address, city, state, zip, owner_phone")
    .ilike("owner_name", `%${queryToken}%`)
    .limit(80);

  const matchingProperties = ((properties ?? []) as Array<{
    id: string;
    owner_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    owner_phone: string | null;
  }>).filter((property) => buildOwnerCollisionKey(property.owner_name) === lookupKey);

  if (matchingProperties.length === 0) return [];

  const propertyIds = matchingProperties.map((property) => property.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select("id, property_id, status, priority")
    .in("property_id", propertyIds);

  const leadRows = (leads ?? []) as Array<{
    id: string;
    property_id: string | null;
    status: string | null;
    priority: number | null;
  }>;

  const bestLeadByProperty = new Map<string, {
    id: string;
    property_id: string | null;
    status: string | null;
    priority: number | null;
  }>();

  for (const lead of leadRows) {
    if (!lead.property_id) continue;
    const existing = bestLeadByProperty.get(lead.property_id);
    if (!existing) {
      bestLeadByProperty.set(lead.property_id, lead);
      continue;
    }

    const existingRank = leadStatusRank(existing.status) * 1000 + (existing.priority ?? 0);
    const nextRank = leadStatusRank(lead.status) * 1000 + (lead.priority ?? 0);
    if (nextRank > existingRank) {
      bestLeadByProperty.set(lead.property_id, lead);
    }
  }

  return matchingProperties.flatMap((property) => {
    const lead = bestLeadByProperty.get(property.id);
    if (!lead) return [];

    return [{
      leadId: lead.id,
      propertyId: property.id,
      ownerName: property.owner_name ?? null,
      address: property.address ?? null,
      city: property.city ?? null,
      state: property.state ?? null,
      zip: property.zip ?? null,
      phone: property.owner_phone ?? null,
      status: lead.status ?? null,
      priority: lead.priority ?? null,
    }];
  });
}
