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
  searchImpressionShare: number | null;
  searchTopImpressionPct: number | null;
  searchAbsTopImpressionPct: number | null;
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

export interface NegativeKeywordData {
  criterionId: string;
  keywordText: string;
  matchType: string;
  level: "campaign" | "ad_group";
  campaignId: string;
  adGroupId: string | null;
}

export interface CampaignBudgetData {
  budgetId: string;
  campaignId: string;
  dailyBudgetMicros: number;
  deliveryMethod: string;
  isShared: boolean;
}

export interface ConversionActionData {
  conversionId: string;
  name: string;
  type: string;
  status: string;
  countingType: string;
  category: string;
}

export interface DeviceMetricRow {
  date: string;
  campaignId: string;
  device: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

export interface GeoMetricRow {
  date: string;
  campaignId: string;
  geoName: string;
  geoType: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

export interface QualityScoreData {
  criterionId: string;
  adGroupId: string;
  qualityScore: number | null;
  expectedCtr: string;
  adRelevance: string;
  landingPageExperience: string;
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

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

  const tokenController = new AbortController();
  const tokenTimeout = setTimeout(() => tokenController.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: tokenController.signal,
    });
  } finally {
    clearTimeout(tokenTimeout);
  }

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
      searchImpressionShare: r.metrics?.search_impression_share != null ? Number(r.metrics.search_impression_share) : null,
      searchTopImpressionPct: r.metrics?.search_top_impression_percentage != null ? Number(r.metrics.search_top_impression_percentage) : null,
      searchAbsTopImpressionPct: r.metrics?.search_absolute_top_impression_percentage != null ? Number(r.metrics.search_absolute_top_impression_percentage) : null,
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
  // keyword_view is an implicit join of ad_group_criterion (keywords only) + metrics.
  // In v23, do NOT select ad_group_criterion.* fields from keyword_view — they are
  // implicitly available via the keyword_view resource attributes.
  const query = `
    SELECT
      keyword_view.resource_name,
      ad_group.id,
      ad_group.name,
      campaign.id,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_micros
    FROM keyword_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    // keyword_view.resource_name format: customers/{cid}/keywordViews/{adGroupId}~{criterionId}
    const resourceName = String(r.keywordView?.resourceName ?? r.keyword_view?.resource_name ?? "");
    const parts = resourceName.split("/").pop()?.split("~") ?? [];
    const criterionId = parts[1] ?? "";
    return {
      keywordId: criterionId,
      keywordText: "",  // Not directly available from keyword_view; populated via separate lookup if needed
      matchType: "",
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

// ── Keyword Criteria (text + match type) ────────────────────────────

export interface KeywordCriterion {
  criterionId: string;
  keywordText: string;
  matchType: string;
  status: string;
  adGroupId: string;
  campaignId: string;
}

export async function fetchKeywordCriteria(
  config: GoogleAdsConfig,
): Promise<KeywordCriterion[]> {
  const query = `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group.id,
      campaign.id
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD'
      AND campaign.status != 'REMOVED'
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const criterion = r.adGroupCriterion ?? r.ad_group_criterion ?? {};
    const keyword = (criterion as Record<string, unknown>).keyword as Record<string, unknown> | undefined;
    return {
      criterionId: String((criterion as Record<string, unknown>).criterionId ?? (criterion as Record<string, unknown>).criterion_id ?? ""),
      keywordText: String(keyword?.text ?? ""),
      matchType: String(keyword?.matchType ?? keyword?.match_type ?? ""),
      status: String((criterion as Record<string, unknown>).status ?? ""),
      adGroupId: String(r.adGroup?.id ?? r.ad_group?.id ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
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
    LIMIT 500
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
  // Query at campaign level (not ad_group) to get one accurate row per date per
  // campaign. Ad-group-level queries caused multiple rows to conflict on the same
  // null ad_group_id key, silently discarding most of the data.
  const query = `
    SELECT
      segments.date,
      campaign.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
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
      adGroupId: null,
      keywordId: null,
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      costMicros: Number(r.metrics?.cost_micros ?? r.metrics?.costMicros ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
      conversionValueMicros: Number(r.metrics?.conversions_value ?? r.metrics?.conversionsValue ?? 0) * 1_000_000,
    };
  });
}

// ── Negative Keywords ────────────────────────────────────────────────

export async function fetchNegativeKeywords(
  config: GoogleAdsConfig,
): Promise<NegativeKeywordData[]> {
  // Campaign-level negative keywords
  const campaignQuery = `
    SELECT
      campaign_criterion.criterion_id,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type,
      campaign.id
    FROM campaign_criterion
    WHERE campaign_criterion.negative = TRUE
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign.status != 'REMOVED'
  `;

  // Ad-group-level negative keywords
  const adGroupQuery = `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group.id,
      campaign.id
    FROM ad_group_criterion
    WHERE ad_group_criterion.negative = TRUE
      AND ad_group_criterion.type = 'KEYWORD'
      AND campaign.status != 'REMOVED'
  `;

  const [campaignRows, adGroupRows] = await Promise.all([
    gaqlQuery(config, campaignQuery),
    gaqlQuery(config, adGroupQuery),
  ]);

  const results: NegativeKeywordData[] = [];

  for (const row of campaignRows) {
    const r = row as Record<string, Record<string, unknown>>;
    const criterion = r.campaignCriterion ?? r.campaign_criterion ?? {};
    const keyword = (criterion as Record<string, unknown>).keyword as Record<string, unknown> | undefined;
    results.push({
      criterionId: String((criterion as Record<string, unknown>).criterionId ?? (criterion as Record<string, unknown>).criterion_id ?? ""),
      keywordText: String(keyword?.text ?? ""),
      matchType: String(keyword?.matchType ?? keyword?.match_type ?? ""),
      level: "campaign",
      campaignId: String(r.campaign?.id ?? ""),
      adGroupId: null,
    });
  }

  for (const row of adGroupRows) {
    const r = row as Record<string, Record<string, unknown>>;
    const criterion = r.adGroupCriterion ?? r.ad_group_criterion ?? {};
    const keyword = (criterion as Record<string, unknown>).keyword as Record<string, unknown> | undefined;
    results.push({
      criterionId: String((criterion as Record<string, unknown>).criterionId ?? (criterion as Record<string, unknown>).criterion_id ?? ""),
      keywordText: String(keyword?.text ?? ""),
      matchType: String(keyword?.matchType ?? keyword?.match_type ?? ""),
      level: "ad_group",
      campaignId: String(r.campaign?.id ?? ""),
      adGroupId: String(r.adGroup?.id ?? r.ad_group?.id ?? ""),
    });
  }

  return results;
}

// ── Campaign Budgets ────────────────────────────────────────────────

export async function fetchCampaignBudgets(
  config: GoogleAdsConfig,
): Promise<CampaignBudgetData[]> {
  const query = `
    SELECT
      campaign_budget.id,
      campaign_budget.amount_micros,
      campaign_budget.delivery_method,
      campaign_budget.explicitly_shared,
      campaign.id
    FROM campaign_budget
    WHERE campaign.status != 'REMOVED'
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const budget = r.campaignBudget ?? r.campaign_budget ?? {};
    return {
      budgetId: String((budget as Record<string, unknown>).id ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      dailyBudgetMicros: Number((budget as Record<string, unknown>).amountMicros ?? (budget as Record<string, unknown>).amount_micros ?? 0),
      deliveryMethod: String((budget as Record<string, unknown>).deliveryMethod ?? (budget as Record<string, unknown>).delivery_method ?? ""),
      isShared: Boolean((budget as Record<string, unknown>).explicitlyShared ?? (budget as Record<string, unknown>).explicitly_shared ?? false),
    };
  });
}

// ── Conversion Actions ──────────────────────────────────────────────

export async function fetchConversionActions(
  config: GoogleAdsConfig,
): Promise<ConversionActionData[]> {
  const query = `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.counting_type,
      conversion_action.category
    FROM conversion_action
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const ca = r.conversionAction ?? r.conversion_action ?? {};
    return {
      conversionId: String((ca as Record<string, unknown>).id ?? ""),
      name: String((ca as Record<string, unknown>).name ?? ""),
      type: String((ca as Record<string, unknown>).type ?? ""),
      status: String((ca as Record<string, unknown>).status ?? ""),
      countingType: String((ca as Record<string, unknown>).countingType ?? (ca as Record<string, unknown>).counting_type ?? ""),
      category: String((ca as Record<string, unknown>).category ?? ""),
    };
  });
}

// ── Device Performance ──────────────────────────────────────────────

export async function fetchDevicePerformance(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<DeviceMetricRow[]> {
  const query = `
    SELECT
      segments.date,
      segments.device,
      campaign.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
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
      device: String(segments?.device ?? ""),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      costMicros: Number(r.metrics?.cost_micros ?? r.metrics?.costMicros ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
    };
  });
}

// ── Geo Performance ─────────────────────────────────────────────────

export async function fetchGeoPerformance(
  config: GoogleAdsConfig,
  startDate: string,
  endDate: string,
): Promise<GeoMetricRow[]> {
  const query = `
    SELECT
      segments.date,
      campaign.id,
      geographic_view.country_criterion_id,
      geographic_view.location_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM geographic_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const segments = r.segments as Record<string, unknown> | undefined;
    const geo = r.geographicView ?? r.geographic_view ?? {};
    return {
      date: String(segments?.date ?? ""),
      campaignId: String(r.campaign?.id ?? ""),
      geoName: String((geo as Record<string, unknown>).countryCriterionId ?? (geo as Record<string, unknown>).country_criterion_id ?? ""),
      geoType: String((geo as Record<string, unknown>).locationType ?? (geo as Record<string, unknown>).location_type ?? ""),
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      costMicros: Number(r.metrics?.cost_micros ?? r.metrics?.costMicros ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
    };
  });
}

// ── Quality Scores ──────────────────────────────────────────────────

export async function fetchQualityScores(
  config: GoogleAdsConfig,
): Promise<QualityScoreData[]> {
  const query = `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group.id,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD'
      AND campaign.status != 'REMOVED'
      AND ad_group_criterion.status != 'REMOVED'
  `;

  const rows = await gaqlQuery(config, query);

  return rows.map((row: unknown) => {
    const r = row as Record<string, Record<string, unknown>>;
    const criterion = r.adGroupCriterion ?? r.ad_group_criterion ?? {};
    const qualityInfo = (criterion as Record<string, unknown>).qualityInfo
      ?? (criterion as Record<string, unknown>).quality_info ?? {};
    const qi = qualityInfo as Record<string, unknown>;
    const qs = qi.qualityScore ?? qi.quality_score;
    return {
      criterionId: String((criterion as Record<string, unknown>).criterionId ?? (criterion as Record<string, unknown>).criterion_id ?? ""),
      adGroupId: String(r.adGroup?.id ?? r.ad_group?.id ?? ""),
      qualityScore: qs != null ? Number(qs) : null,
      expectedCtr: String(qi.searchPredictedCtr ?? qi.search_predicted_ctr ?? ""),
      adRelevance: String(qi.creativeQualityScore ?? qi.creative_quality_score ?? ""),
      landingPageExperience: String(qi.postClickQualityScore ?? qi.post_click_quality_score ?? ""),
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

export async function addNegativeKeyword(
  config: GoogleAdsConfig,
  campaignId: string,
  keywordText: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "EXACT",
): Promise<unknown> {
  return mutate(config, [{
    campaignCriterionOperation: {
      create: {
        campaign: `customers/${config.customerId}/campaigns/${campaignId}`,
        negative: true,
        keyword: { text: keywordText, matchType },
      },
    },
  }]);
}

export async function addKeyword(
  config: GoogleAdsConfig,
  adGroupId: string,
  keywordText: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "EXACT",
  bidMicros?: number,
): Promise<unknown> {
  const criterion: Record<string, unknown> = {
    adGroup: `customers/${config.customerId}/adGroups/${adGroupId}`,
    status: "ENABLED",
    keyword: { text: keywordText, matchType },
  };
  if (bidMicros) {
    criterion.cpcBidMicros = String(bidMicros);
  }
  return mutate(config, [{
    adGroupCriterionOperation: {
      create: criterion,
    },
  }]);
}

export async function createAdGroup(
  config: GoogleAdsConfig,
  campaignId: string,
  adGroupName: string,
): Promise<unknown> {
  return mutate(config, [{
    adGroupOperation: {
      create: {
        campaign: `customers/${config.customerId}/campaigns/${campaignId}`,
        name: adGroupName,
        status: "ENABLED",
        type: "SEARCH_STANDARD",
      },
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
