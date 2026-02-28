/**
 * ATTOM Data API Wrapper
 *
 * Charter v3.1 §5.4 — Full predictive automation via ATTOM property data.
 * Budget: $500/mo. APN golden key. Compliance sacred.
 *
 * Endpoints implemented:
 *   1. Property Detail — full property record by APN+FIPS or address
 *   2. Property Snapshot — bulk properties by geoid (county FIPS)
 *   3. AVM Detail — automated valuation model
 *   4. Sale Snapshot — recent sales in a geography
 *   5. Foreclosure — pre-foreclosure and auction data
 *   6. Owner Detail — owner demographics and contact
 *
 * Auth: API key via `apikey` header (env: ATTOM_API_KEY).
 * Base URL: https://api.gateway.attomdata.com/propertyapi/v1.0.0
 *
 * Rate limits: Respect ATTOM's tier. Default 1s delay between batch calls.
 * All functions return typed responses; errors throw AttomApiError.
 */

const ATTOM_BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";

// Spokane County, WA = FIPS 53063 | Kootenai County, ID = FIPS 16055
export const COUNTY_FIPS: Record<string, string> = {
  Spokane: "53063",
  Kootenai: "16055",
};

export const FIPS_TO_STATE: Record<string, string> = {
  "53063": "WA",
  "16055": "ID",
};

// ── Error Class ──────────────────────────────────────────────────────

export class AttomApiError extends Error {
  status: number;
  endpoint: string;
  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = "AttomApiError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

// ── Core Fetch ───────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.ATTOM_API_KEY;
  if (!key) throw new AttomApiError("ATTOM_API_KEY not configured", 0, "init");
  return key;
}

async function attomFetch<T>(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${ATTOM_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: getApiKey(),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AttomApiError(
      `ATTOM ${endpoint} returned ${res.status}: ${body.slice(0, 300)}`,
      res.status,
      endpoint,
    );
  }

  return res.json() as Promise<T>;
}

// ── ATTOM Response Types ─────────────────────────────────────────────

export interface AttomProperty {
  identifier?: {
    Id?: number;
    fips?: string;
    apn?: string;
    attomId?: number;
    obPropId?: number;
  };
  lot?: {
    lotSize1?: number;
    lotSize2?: number;
    siteZoningIdent?: string;
  };
  area?: {
    locType?: string;
    countrySecSubd?: string;
    countyUse1?: string;
    munCode?: string;
    munName?: string;
    srvyRange?: string;
    srvySection?: string;
    srvyTownship?: string;
    subdName?: string;
    taxCodeArea?: string;
  };
  address?: {
    country?: string;
    countrySubd?: string;
    line1?: string;
    line2?: string;
    locality?: string;
    matchCode?: string;
    oneLine?: string;
    postal1?: string;
    postal2?: string;
    postal3?: string;
  };
  location?: {
    accuracy?: string;
    elevation?: number;
    latitude?: string;
    longitude?: string;
    distance?: number;
    geoid?: string;
  };
  summary?: {
    absenteeInd?: string;
    propClass?: string;
    propSubType?: string;
    propType?: string;
    yearBuilt?: number;
    propLandUse?: string;
    propIndicator?: string;
    legal1?: string;
  };
  utilities?: {
    heatingType?: string;
    coolingType?: string;
  };
  building?: {
    size?: {
      bldgSize?: number;
      grossSize?: number;
      grossSizeAdjusted?: number;
      groundFloorSize?: number;
      livingSize?: number;
      universalSize?: number;
    };
    rooms?: {
      bathsFull?: number;
      bathsHalf?: number;
      bathsTotal?: number;
      beds?: number;
      roomsTotal?: number;
    };
    interior?: {
      fplcCount?: number;
      fplcInd?: string;
      fplcType?: string;
    };
    construction?: {
      condition?: string;
      constructionType?: string;
      foundationType?: string;
      frameType?: string;
      roofCover?: string;
      roofShape?: string;
      wallType?: string;
    };
    parking?: {
      garageType?: string;
      prkgSize?: number;
      prkgSpaces?: string;
      prkgType?: string;
    };
    summary?: {
      archStyle?: string;
      bldgsNum?: number;
      levels?: number;
      storyDesc?: string;
      unitsCount?: string;
      view?: string;
      viewCode?: string;
    };
  };
  vintage?: {
    lastModified?: string;
    pubDate?: string;
  };
  // Assessment fields
  assessment?: {
    appraised?: { apprTtlValue?: number };
    assessed?: {
      assdImprValue?: number;
      assdLandValue?: number;
      assdTtlValue?: number;
    };
    market?: {
      mktImprValue?: number;
      mktLandValue?: number;
      mktTtlValue?: number;
    };
    tax?: {
      taxAmt?: number;
      taxPerSizeUnit?: number;
      taxYear?: number;
    };
    owner?: {
      corporateIndicator?: string;
      owner1?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      owner2?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      owner3?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      owner4?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      absenteeOwnerStatus?: string;
      mailingAddressOneLine?: string;
    };
    mortgage?: {
      FirstConcurrent?: {
        amount?: number;
        date?: string;
        lenderLastName?: string;
        rate?: number;
        term?: number;
        dueDate?: string;
      };
      SecondConcurrent?: {
        amount?: number;
        date?: string;
      };
    };
  };
  // Sale history (from sale endpoints)
  sale?: {
    amount?: { saleAmt?: number; saleRecDate?: string; saleTransDate?: string };
    calculation?: { pricePerBed?: number; pricePerSizeUnit?: number };
  };
  // AVM fields
  avm?: {
    amount?: {
      value?: number;
      high?: number;
      low?: number;
      scr?: number;
    };
    eventDate?: string;
  };
}

export interface AttomPropertyResponse {
  status?: { version?: string; code?: number; msg?: string; total?: number; page?: number; pagesize?: number };
  property?: AttomProperty[];
}

export interface AttomForeclosure {
  identifier?: AttomProperty["identifier"];
  address?: AttomProperty["address"];
  FC?: {
    FCDocDate?: string;
    FCDocNbr?: string;
    FCRecDate?: string;
    FCType?: string;
    FCStatus?: string;
    FCAuctionDate?: string;
    defaultAmount?: number;
    originalLoanAmount?: number;
    penaltyInterest?: number;
    judgmentAmount?: number;
    judgmentDate?: string;
    trusteeSaleNbr?: string;
    lenderName?: string;
    borrowerNameOwner?: string;
  };
}

export interface AttomForeclosureResponse {
  status?: { version?: string; code?: number; msg?: string; total?: number; page?: number; pagesize?: number };
  property?: AttomForeclosure[];
}

export interface AttomSale {
  identifier?: AttomProperty["identifier"];
  address?: AttomProperty["address"];
  sale?: {
    amount?: { saleAmt?: number; saleRecDate?: string; saleTransDate?: string };
    calculation?: { pricePerBed?: number; pricePerSizeUnit?: number };
  };
  assessment?: AttomProperty["assessment"];
}

export interface AttomSaleResponse {
  status?: { version?: string; code?: number; msg?: string; total?: number; page?: number; pagesize?: number };
  property?: AttomSale[];
}

// ── 1. Property Detail ───────────────────────────────────────────────

export async function getPropertyDetailByAPN(
  apn: string,
  fips: string,
): Promise<AttomProperty | null> {
  try {
    const data = await attomFetch<AttomPropertyResponse>(
      "/property/detail",
      { apn, fips },
    );
    return data.property?.[0] ?? null;
  } catch (err) {
    if (err instanceof AttomApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getPropertyDetailByAddress(
  address1: string,
  address2: string,
): Promise<AttomProperty | null> {
  try {
    const data = await attomFetch<AttomPropertyResponse>(
      "/property/detail",
      { address1, address2 },
    );
    return data.property?.[0] ?? null;
  } catch (err) {
    if (err instanceof AttomApiError && err.status === 404) return null;
    throw err;
  }
}

// ── 2. Property Snapshot (bulk by county FIPS) ───────────────────────

export async function getPropertySnapshot(
  geoid: string,
  options: {
    page?: number;
    pagesize?: number;
    orderby?: string;
    minAVM?: number;
    maxAVM?: number;
  } = {},
): Promise<AttomProperty[]> {
  const params: Record<string, string | number> = {
    geoIdV4: `CO${geoid}`,
    pagesize: options.pagesize ?? 50,
    page: options.page ?? 1,
  };
  if (options.orderby) params.orderby = options.orderby;
  if (options.minAVM) params.minAVM = options.minAVM;
  if (options.maxAVM) params.maxAVM = options.maxAVM;

  const data = await attomFetch<AttomPropertyResponse>(
    "/property/snapshot",
    params,
  );
  return data.property ?? [];
}

// ── 3. AVM Detail ────────────────────────────────────────────────────

export async function getAVMByAPN(
  apn: string,
  fips: string,
): Promise<AttomProperty | null> {
  try {
    const data = await attomFetch<AttomPropertyResponse>(
      "/attomavm/detail",
      { apn, fips },
    );
    return data.property?.[0] ?? null;
  } catch (err) {
    if (err instanceof AttomApiError && err.status === 404) return null;
    throw err;
  }
}

// ── 4. Sale Snapshot (recent sales in a county) ──────────────────────

export async function getSaleSnapshot(
  geoid: string,
  options: {
    page?: number;
    pagesize?: number;
    startsalesearchdate?: string;
    endsalesearchdate?: string;
    minsalesearchamt?: number;
  } = {},
): Promise<AttomSale[]> {
  const params: Record<string, string | number> = {
    geoIdV4: `CO${geoid}`,
    pagesize: options.pagesize ?? 50,
    page: options.page ?? 1,
  };
  if (options.startsalesearchdate) params.startsalesearchdate = options.startsalesearchdate;
  if (options.endsalesearchdate) params.endsalesearchdate = options.endsalesearchdate;
  if (options.minsalesearchamt) params.minsalesearchamt = options.minsalesearchamt;

  const data = await attomFetch<AttomSaleResponse>(
    "/sale/snapshot",
    params,
  );
  return data.property ?? [];
}

// ── 5. Foreclosure ───────────────────────────────────────────────────

export async function getForeclosures(
  geoid: string,
  options: {
    page?: number;
    pagesize?: number;
    startFCRecDate?: string;
    endFCRecDate?: string;
  } = {},
): Promise<AttomForeclosure[]> {
  const params: Record<string, string | number> = {
    geoIdV4: `CO${geoid}`,
    pagesize: options.pagesize ?? 50,
    page: options.page ?? 1,
  };
  if (options.startFCRecDate) params.startFCRecDate = options.startFCRecDate;
  if (options.endFCRecDate) params.endFCRecDate = options.endFCRecDate;

  const data = await attomFetch<AttomForeclosureResponse>(
    "/property/foreclosure",
    params,
  );
  return data.property ?? [];
}

// ── 6. Owner Detail ──────────────────────────────────────────────────

export async function getOwnerByAPN(
  apn: string,
  fips: string,
): Promise<AttomProperty | null> {
  try {
    const data = await attomFetch<AttomPropertyResponse>(
      "/property/detailowner",
      { apn, fips },
    );
    return data.property?.[0] ?? null;
  } catch (err) {
    if (err instanceof AttomApiError && err.status === 404) return null;
    throw err;
  }
}

// ── 7. Daily Delta Pull (date range filter) ──────────────────────────
// Fetches properties modified within a date range for a county.
// Uses the snapshot endpoint with `minLastModifiedDate` param.

export interface DailyDeltaOptions {
  fips: string;
  countyName: string;
  sinceDateISO: string;
  untilDateISO?: string;
  pagesize?: number;
  maxPages?: number;
}

export interface DailyDeltaResult {
  properties: AttomProperty[];
  foreclosures: AttomForeclosure[];
  totalPropertyPages: number;
  totalForeclosurePages: number;
  apiCalls: number;
}

export async function pullDailyDelta(
  opts: DailyDeltaOptions,
): Promise<DailyDeltaResult> {
  const {
    fips,
    sinceDateISO,
    untilDateISO,
    pagesize = 50,
    maxPages = 4,
  } = opts;

  const sinceDate = sinceDateISO.split("T")[0];
  const untilDate = untilDateISO?.split("T")[0] ?? new Date().toISOString().split("T")[0];

  let apiCalls = 0;
  const allProperties: AttomProperty[] = [];
  const allForeclosures: AttomForeclosure[] = [];

  // Pull property snapshots page-by-page
  for (let page = 1; page <= maxPages; page++) {
    try {
      const props = await getPropertySnapshot(fips, {
        page,
        pagesize,
      });
      apiCalls++;

      if (!props.length) break;

      // Filter by vintage date client-side (ATTOM snapshot may not support date filter directly)
      const recent = props.filter((p) => {
        const mod = p.vintage?.lastModified ?? p.vintage?.pubDate;
        if (!mod) return true;
        return mod >= sinceDate && mod <= untilDate;
      });

      allProperties.push(...recent);

      if (props.length < pagesize) break;

      // Rate limit: 1 second between calls
      await sleep(1000);
    } catch (err) {
      console.error(`[ATTOM] Property snapshot page ${page} error:`, err);
      break;
    }
  }

  // Pull foreclosures for the date range
  for (let page = 1; page <= Math.min(maxPages, 2); page++) {
    try {
      const fcs = await getForeclosures(fips, {
        page,
        pagesize,
        startFCRecDate: sinceDate,
        endFCRecDate: untilDate,
      });
      apiCalls++;

      if (!fcs.length) break;
      allForeclosures.push(...fcs);

      if (fcs.length < pagesize) break;
      await sleep(1000);
    } catch (err) {
      console.error(`[ATTOM] Foreclosure page ${page} error:`, err);
      break;
    }
  }

  return {
    properties: allProperties,
    foreclosures: allForeclosures,
    totalPropertyPages: Math.min(Math.ceil(allProperties.length / pagesize), maxPages),
    totalForeclosurePages: Math.min(Math.ceil(allForeclosures.length / pagesize), 2),
    apiCalls,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract a clean APN from ATTOM's identifier.
 * Falls back to stripping dashes/spaces.
 */
export function normalizeAttomAPN(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/[-\s]/g, "").trim();
}

/**
 * Map ATTOM FIPS to our county name.
 */
export function fipsToCounty(fips: string): string {
  if (fips === "53063") return "Spokane";
  if (fips === "16055") return "Kootenai";
  return `FIPS-${fips}`;
}

/**
 * Detect distress signals from ATTOM property data.
 */
export function detectAttomDistressSignals(
  prop: AttomProperty,
  fc?: AttomForeclosure,
): { type: string; severity: number; source: string }[] {
  const signals: { type: string; severity: number; source: string }[] = [];

  // Absentee owner
  if (
    prop.summary?.absenteeInd === "Y" ||
    prop.assessment?.owner?.absenteeOwnerStatus === "O"
  ) {
    signals.push({ type: "absentee", severity: 5, source: "attom_absentee" });
  }

  // Corporate owner
  if (prop.assessment?.owner?.corporateIndicator === "Y") {
    signals.push({ type: "absentee", severity: 3, source: "attom_corporate" });
  }

  // Tax delinquency (assessed but no payment signals)
  const taxAmt = prop.assessment?.tax?.taxAmt ?? 0;
  const assessedVal = prop.assessment?.assessed?.assdTtlValue ?? 0;
  if (assessedVal > 0 && taxAmt > assessedVal * 0.03) {
    signals.push({ type: "tax_lien", severity: 7, source: "attom_tax_delinquency" });
  }

  // Foreclosure signals
  if (fc?.FC) {
    const fcType = (fc.FC.FCType ?? "").toLowerCase();
    const fcStatus = (fc.FC.FCStatus ?? "").toLowerCase();

    if (fcStatus.includes("auction") || fcType.includes("auction")) {
      signals.push({ type: "pre_foreclosure", severity: 9, source: "attom_fc_auction" });
    } else if (fcType.includes("lis pendens") || fcType.includes("notice")) {
      signals.push({ type: "pre_foreclosure", severity: 7, source: "attom_fc_notice" });
    } else {
      signals.push({ type: "pre_foreclosure", severity: 6, source: "attom_fc_default" });
    }
  }

  // Vacant property inference (no living size or extremely old with no recent sale)
  const yearBuilt = prop.summary?.yearBuilt ?? 0;
  const livingSize = prop.building?.size?.livingSize ?? prop.building?.size?.bldgSize ?? 0;
  if (yearBuilt > 0 && yearBuilt < 1960 && livingSize < 600) {
    signals.push({ type: "vacant", severity: 4, source: "attom_condition" });
  }

  return signals;
}

/**
 * Compute equity percent from ATTOM's AVM and mortgage data.
 */
export function computeAttomEquity(prop: AttomProperty): number | null {
  const avmValue = prop.avm?.amount?.value
    ?? prop.assessment?.market?.mktTtlValue
    ?? prop.assessment?.assessed?.assdTtlValue;
  if (!avmValue || avmValue <= 0) return null;

  const loanBalance = prop.assessment?.mortgage?.FirstConcurrent?.amount ?? 0;
  const secondLoan = prop.assessment?.mortgage?.SecondConcurrent?.amount ?? 0;
  const totalLoans = loanBalance + secondLoan;

  if (totalLoans <= 0) return 100; // Free and clear
  const equity = ((avmValue - totalLoans) / avmValue) * 100;
  return Math.max(Math.min(Math.round(equity * 10) / 10, 100), -50);
}

/**
 * Budget tracking helper — estimates API cost per call.
 * ATTOM pricing varies by plan; assume ~$0.05/record for standard tier.
 */
export function estimateCost(apiCalls: number, avgRecordsPerCall: number = 25): string {
  const estimated = apiCalls * avgRecordsPerCall * 0.05;
  return `~$${estimated.toFixed(2)}`;
}
