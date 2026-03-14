/**
 * Google Ads API Client — REST wrapper for Google Ads API v18.
 *
 * Handles OAuth token refresh, campaign/ad/keyword performance queries,
 * and mutation operations (bid adjust, pause, copy updates).
 */

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";

// ── Types ───────────────────────────────────────────────────────────

export interface GoogleAdsConfig {
  developerToken: string;
  customerId: string;
  accessToken: string;
}

export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  status: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgCpc: number;
  conversions: number;
  cost: number;
  roas: number | null;
}

export interface AdGroupMetrics {
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgCpc: number;
  conversions: number;
  cost: number;
}

export interface AdMetrics {
  adId: string;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  headline1: string;
  headline2: string;
  headline3: string;
  description1: string;
  description2: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgCpc: number;
  conversions: number;
  cost: number;
}

export interface KeywordMetrics {
  keywordId: string;
  keywordText: string;
  matchType: string;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgCpc: number;
  conversions: number;
  cost: number;
  qualityScore: number | null;
}

export interface SearchTermData {
  searchTerm: string;
  keywordText: string;
  keywordId: string;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  conversions: number;
  costMicros: number;
  cost: number;
}

export interface DailyMetricRow {
  date: string;
  campaignId: string;
  adGroupId: string | null;
  keywordId: string | null;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionValueMicros: number;
}

// ── Helper: GAQL Query ──────────────────────────────────────────────

async function gaqlQuery(config: GoogleAdsConfig, query: string): Promise<unknown[]> {
  const url = `${GOOGLE_ADS_API}/customers/${config.customerId}/googleAds:searchStream`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.accessToken}`,
    "developer-token": config.developerToken,
  };

  // Required when querying a child account through an MCC manager account
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Google Ads API ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const data = await res.json();
  // searchStream returns an array of batches, each with a results array
  const results: unknown[] = [];
  for (const batch of data) {
    if (batch.results) {
      results.push(...batch.results);
    }
  }
  return results;
}

// ── OAuth Token Refresh ─────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Token refresh failed ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── Campaign Performance ────────────────────────────────────────────

export async function fetchCampaignPerformance(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<CampaignMetrics[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_micros,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const costMicros = Number(r.metrics?.cost_micros ?? 0);
    const convValue = Number(r.metrics?.conversions_value ?? 0);
    return {
      campaignId: String(r.campaign?.id ?? ""),
      campaignName: String(r.campaign?.name ?? ""),
      status: String(r.campaign?.status ?? ""),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      ctr: Number(r.metrics?.ctr ?? 0),
      avgCpc: Number(r.metrics?.average_cpc ?? 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions ?? 0),
      cost: costMicros / 1_000_000,
      roas: costMicros > 0 ? convValue / (costMicros / 1_000_000) : null,
    };
  });
}

// ── Ad Group Performance ────────────────────────────────────────────

export async function fetchAdGroupPerformance(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<AdGroupMetrics[]> {
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_micros
    FROM ad_group
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    return {
      adGroupId: String(r.ad_group?.id ?? ""),
      adGroupName: String(r.ad_group?.name ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      campaignName: String(r.campaign?.name ?? ""),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      ctr: Number(r.metrics?.ctr ?? 0),
      avgCpc: Number(r.metrics?.average_cpc ?? 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions ?? 0),
      cost: Number(r.metrics?.cost_micros ?? 0) / 1_000_000,
    };
  });
}

// ── Ad Performance ──────────────────────────────────────────────────

export async function fetchAdPerformance(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<AdMetrics[]> {
  const query = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group.id,
      ad_group.name,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_micros
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const ad = r.ad_group_ad?.ad as Record<string, unknown> | undefined;
    const rsa = ad?.responsive_search_ad as Record<string, unknown[]> | undefined;
    const headlines = (rsa?.headlines ?? []) as Array<{ text?: string }>;
    const descriptions = (rsa?.descriptions ?? []) as Array<{ text?: string }>;
    return {
      adId: String(ad?.id ?? ""),
      adGroupId: String(r.ad_group?.id ?? ""),
      adGroupName: String(r.ad_group?.name ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      campaignName: String(r.campaign?.name ?? ""),
      headline1: headlines[0]?.text ?? "",
      headline2: headlines[1]?.text ?? "",
      headline3: headlines[2]?.text ?? "",
      description1: descriptions[0]?.text ?? "",
      description2: descriptions[1]?.text ?? "",
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      ctr: Number(r.metrics?.ctr ?? 0),
      avgCpc: Number(r.metrics?.average_cpc ?? 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions ?? 0),
      cost: Number(r.metrics?.cost_micros ?? 0) / 1_000_000,
    };
  });
}

// ── Keyword Performance ─────────────────────────────────────────────

export async function fetchKeywordPerformance(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<KeywordMetrics[]> {
  const query = `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group.id,
      ad_group.name,
      campaign.id,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_micros
    FROM ad_group_criterion
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
      AND ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const criterion = r.adGroupCriterion as Record<string, unknown> | undefined
      ?? r.ad_group_criterion as Record<string, unknown> | undefined;
    const keyword = criterion?.keyword as Record<string, unknown> | undefined;
    return {
      keywordId: String(criterion?.criterionId ?? criterion?.criterion_id ?? ""),
      keywordText: String(keyword?.text ?? ""),
      matchType: String(keyword?.matchType ?? keyword?.match_type ?? ""),
      adGroupId: String(r.adGroup?.id ?? r.ad_group?.id ?? ""),
      adGroupName: String(r.adGroup?.name ?? r.ad_group?.name ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      ctr: Number(r.metrics?.ctr ?? 0),
      avgCpc: Number(r.metrics?.average_cpc ?? r.metrics?.averageCpc ?? 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions ?? 0),
      cost: Number(r.metrics?.cost_micros ?? r.metrics?.costMicros ?? 0) / 1_000_000,
      qualityScore: null,
    };
  });
}

// ── Search Terms Report ─────────────────────────────────────────────

export async function fetchSearchTerms(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<SearchTermData[]> {
  const query = `
    SELECT
      search_term_view.search_term,
      ad_group.id,
      ad_group.name,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros
    FROM search_term_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
    LIMIT 200
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const stv = r.searchTermView as Record<string, unknown> | undefined
      ?? r.search_term_view as Record<string, unknown> | undefined;
    const costMicros = Number(r.metrics?.cost_micros ?? r.metrics?.costMicros ?? 0);
    return {
      searchTerm: String(stv?.searchTerm ?? stv?.search_term ?? ""),
      keywordText: "",
      keywordId: "",
      adGroupId: String(r.adGroup?.id ?? r.ad_group?.id ?? ""),
      adGroupName: String(r.adGroup?.name ?? r.ad_group?.name ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      campaignName: String(r.campaign?.name ?? ""),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
      costMicros,
      cost: costMicros / 1_000_000,
    };
  });
}

// ── Daily Metrics (date-segmented) ─────────────────────────────────

export async function fetchDailyMetrics(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<DailyMetricRow[]> {
  const query = `
    SELECT
      segments.date,
      campaign.id,
      ad_group.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const segments = r.segments as Record<string, unknown> | undefined;
    return {
      date: String(segments?.date ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      adGroupId: String(r.adGroup?.id ?? r.ad_group?.id ?? ""),
      keywordId: "",
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      costMicros: Number(r.metrics?.cost_micros ?? r.metrics?.costMicros ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
      conversionValueMicros: Number(r.metrics?.conversions_value ?? r.metrics?.conversionsValue ?? 0) * 1_000_000,
    };
  });
}

// ── Mutations ───────────────────────────────────────────────────────

async function mutate(config: GoogleAdsConfig, operations: unknown[]): Promise<unknown> {
  const url = `${GOOGLE_ADS_API}/customers/${config.customerId}/googleAds:mutate`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.accessToken}`,
    "developer-token": config.developerToken,
  };

  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ mutateOperations: operations }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Google Ads mutate ${res.status}: ${errBody.slice(0, 500)}`);
  }

  return res.json();
}

export async function updateKeywordBid(
  config: GoogleAdsConfig,
  adGroupId: string,
  keywordId: string,
  newBidMicros: number,
): Promise<unknown> {
  return mutate(config, [{
    adGroupCriterionOperation: {
      update: {
        resourceName: `customers/${config.customerId}/adGroupCriteria/${adGroupId}~${keywordId}`,
        cpcBidMicros: String(newBidMicros),
      },
      updateMask: "cpc_bid_micros",
    },
  }]);
}

export async function setKeywordStatus(
  config: GoogleAdsConfig,
  adGroupId: string,
  keywordId: string,
  status: "ENABLED" | "PAUSED",
): Promise<unknown> {
  return mutate(config, [{
    adGroupCriterionOperation: {
      update: {
        resourceName: `customers/${config.customerId}/adGroupCriteria/${adGroupId}~${keywordId}`,
        status,
      },
      updateMask: "status",
    },
  }]);
}

export async function updateCampaignBudget(
  config: GoogleAdsConfig,
  campaignBudgetId: string,
  newBudgetMicros: number,
): Promise<unknown> {
  return mutate(config, [{
    campaignBudgetOperation: {
      update: {
        resourceName: `customers/${config.customerId}/campaignBudgets/${campaignBudgetId}`,
        amountMicros: String(newBudgetMicros),
      },
      updateMask: "amount_micros",
    },
  }]);
}

// ── Config Helper ───────────────────────────────────────────────────

export function getGoogleAdsConfig(accessToken: string): GoogleAdsConfig {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

  if (!developerToken || !customerId) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID required");
  }

  return {
    developerToken,
    customerId: customerId.replace(/-/g, ""),
    accessToken,
  };
}
