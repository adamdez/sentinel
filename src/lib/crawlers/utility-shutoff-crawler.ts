/**
 * Utility Shut-Off Crawler
 *
 * Charter v3.1 §1: "water shut-offs" — upstream distress signal indicating
 * severe financial hardship. 35-point base weight (highest in engine).
 *
 * Sources (WA/ID focus):
 *   - Spokane County code enforcement / utility liens (my.spokanecity.org)
 *   - City of Spokane code violations open data
 *   - Kootenai County / City of Coeur d'Alene public records
 *   - Idaho DEQ public notices
 *
 * Each crawled record is normalized to:
 *   { name, address, city, state, county, date, link, source, distressType: "water_shutoff" }
 *
 * APN extraction attempted from page content; synthetic APN fallback via
 * address hash when not found. Idempotent via fingerprint dedup.
 */

import type { CrawlerModule, CrawledRecord } from "./predictive-crawler";

interface UtilitySource {
  id: string;
  name: string;
  url: string;
  county: string;
  state: string;
  /** Which type of public data this source exposes */
  dataType: "code_violations" | "utility_liens" | "shutoff_notices" | "deq_notices";
}

const SOURCES: UtilitySource[] = [
  {
    id: "spokane_code_violations",
    name: "City of Spokane Code Violations",
    url: "https://my.spokanecity.org/opendata/code-enforcement/",
    county: "Spokane",
    state: "WA",
    dataType: "code_violations",
  },
  {
    id: "spokane_utility_liens",
    name: "Spokane County Utility Liens",
    url: "https://www.spokanecounty.org/681/Liens",
    county: "Spokane",
    state: "WA",
    dataType: "utility_liens",
  },
  {
    id: "spokane_shutoff_notices",
    name: "City of Spokane Utility Shut-Off Notices",
    url: "https://my.spokanecity.org/utilities/account/shutoff-notices/",
    county: "Spokane",
    state: "WA",
    dataType: "shutoff_notices",
  },
  {
    id: "cda_code_violations",
    name: "City of Coeur d'Alene Code Violations",
    url: "https://www.cdaid.org/code-enforcement",
    county: "Kootenai",
    state: "ID",
    dataType: "code_violations",
  },
  {
    id: "kootenai_utility_liens",
    name: "Kootenai County Public Records — Utility Liens",
    url: "https://www.kcgov.us/223/Recorded-Documents",
    county: "Kootenai",
    state: "ID",
    dataType: "utility_liens",
  },
  {
    id: "idaho_deq_notices",
    name: "Idaho DEQ Public Water Notices",
    url: "https://www2.deq.idaho.gov/water/compliance/violations.cfm",
    county: "Kootenai",
    state: "ID",
    dataType: "deq_notices",
  },
];

const ADDRESS_RE =
  /(\d{1,6}\s+[A-Z][A-Za-z0-9\s.#]+(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy)\.?)/gi;

const APN_RE = /\b(\d{4,5}[\s.-]\d{3,5}[\s.-]\d{3,5}(?:[\s.-]\d{1,4})?)\b/g;

const CITY_RE =
  /\b(Spokane|Spokane Valley|Liberty Lake|Cheney|Airway Heights|Medical Lake|Coeur d'Alene|Post Falls|Hayden|Rathdrum|Sandpoint|Dalton Gardens)\b/gi;

const AMOUNT_RE = /\$[\d,]+(?:\.\d{2})?/g;

const DATE_RE =
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\w+\s+\d{1,2},?\s+\d{4})/g;

function extractAddress(text: string): string | null {
  const match = ADDRESS_RE.exec(text);
  ADDRESS_RE.lastIndex = 0;
  return match?.[1]?.trim() ?? null;
}

function extractApn(text: string): string | null {
  const match = APN_RE.exec(text);
  APN_RE.lastIndex = 0;
  return match?.[1]?.replace(/\s/g, "") ?? null;
}

function extractCity(text: string): string | null {
  const match = CITY_RE.exec(text);
  CITY_RE.lastIndex = 0;
  return match?.[1]?.trim() ?? null;
}

function extractAmount(text: string): string | null {
  const match = AMOUNT_RE.exec(text);
  AMOUNT_RE.lastIndex = 0;
  return match?.[0] ?? null;
}

function extractDate(text: string): string {
  const match = DATE_RE.exec(text);
  DATE_RE.lastIndex = 0;
  if (match) {
    const d = new Date(match[0]);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function extractOwnerName(text: string): string | null {
  const ownerPatterns = [
    /(?:owner|property\s+owner|taxpayer|homeowner)[:\s]+([A-Z][A-Za-z\s,.'-]{3,60})/i,
    /(?:name|resident)[:\s]+([A-Z][A-Za-z\s,.'-]{3,60})/i,
    /(?:lien\s+against|notice\s+to)[:\s]+([A-Z][A-Za-z\s,.'-]{3,60})/i,
  ];
  for (const re of ownerPatterns) {
    const match = re.exec(text);
    if (match) {
      const name = match[1].trim().replace(/[,.]$/, "");
      if (name.length > 3 && name.length < 80) return name;
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractRecordBlocks(html: string): string[] {
  const blocks: string[] = [];

  const tableRowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRowRe.exec(html)) !== null) {
    const rowText = stripHtml(match[1]);
    if (rowText.length > 20 && ADDRESS_RE.test(rowText)) {
      ADDRESS_RE.lastIndex = 0;
      blocks.push(rowText);
    }
  }

  if (blocks.length === 0) {
    const listRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    while ((match = listRe.exec(html)) !== null) {
      const itemText = stripHtml(match[1]);
      if (itemText.length > 20 && ADDRESS_RE.test(itemText)) {
        ADDRESS_RE.lastIndex = 0;
        blocks.push(itemText);
      }
    }
  }

  if (blocks.length === 0) {
    const divRe = /<div[^>]*class="[^"]*(?:violation|lien|notice|record|result|item)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    while ((match = divRe.exec(html)) !== null) {
      const blockText = stripHtml(match[1]);
      if (blockText.length > 20 && ADDRESS_RE.test(blockText)) {
        ADDRESS_RE.lastIndex = 0;
        blocks.push(blockText);
      }
    }
  }

  return blocks.slice(0, 50);
}

function extractDetailLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkRe = /<a[^>]+href="([^"]*(?:violation|lien|notice|case|detail|shutoff)[^"]*)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl).href;
      if (!links.includes(url)) links.push(url);
    } catch { /* skip malformed */ }
  }
  return links.slice(0, 30);
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DominionBot/1.0; +https://dominionhomedeals.com)",
        Accept: "text/html,application/xhtml+xml,application/json",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function crawlSource(source: UtilitySource): Promise<CrawledRecord[]> {
  const records: CrawledRecord[] = [];
  console.log(`[UtilityShutoff] Fetching: ${source.name} (${source.url})`);

  const indexHtml = await fetchWithTimeout(source.url);
  if (!indexHtml) {
    console.warn(`[UtilityShutoff] Failed to fetch ${source.name}`);
    return records;
  }

  const blocks = extractRecordBlocks(indexHtml);
  console.log(`[UtilityShutoff] Found ${blocks.length} record blocks from ${source.name}`);

  for (const block of blocks) {
    const address = extractAddress(block);
    if (!address) continue;

    const owner = extractOwnerName(block);
    const city = extractCity(block) ?? (source.county === "Spokane" ? "Spokane" : "Coeur d'Alene");
    const date = extractDate(block);
    const amountOwed = extractAmount(block);
    const apn = extractApn(block);

    records.push({
      name: owner ?? `Owner at ${address}`,
      address,
      city,
      state: source.state,
      county: source.county,
      date,
      link: source.url,
      source: `utility_shutoff:${source.id}`,
      distressType: "water_shutoff",
      rawData: {
        data_type: source.dataType,
        source_name: source.name,
        amount_owed: amountOwed,
        apn_from_source: apn,
        raw_block: block.slice(0, 500),
      },
    });
  }

  const detailLinks = extractDetailLinks(indexHtml, source.url);
  if (detailLinks.length > 0) {
    console.log(`[UtilityShutoff] Following ${detailLinks.length} detail links from ${source.name}`);
  }

  for (const link of detailLinks) {
    const detailHtml = await fetchWithTimeout(link);
    if (!detailHtml) continue;

    const plainText = stripHtml(detailHtml);
    const address = extractAddress(plainText);
    if (!address) continue;

    const alreadyHave = records.some((r) => r.address === address && r.county === source.county);
    if (alreadyHave) continue;

    const owner = extractOwnerName(plainText);
    const city = extractCity(plainText) ?? (source.county === "Spokane" ? "Spokane" : "Coeur d'Alene");
    const date = extractDate(plainText);
    const amountOwed = extractAmount(plainText);
    const apn = extractApn(plainText);

    records.push({
      name: owner ?? `Owner at ${address}`,
      address,
      city,
      state: source.state,
      county: source.county,
      date,
      link,
      source: `utility_shutoff:${source.id}`,
      distressType: "water_shutoff",
      rawData: {
        data_type: source.dataType,
        source_name: source.name,
        amount_owed: amountOwed,
        apn_from_source: apn,
        raw_block: plainText.slice(0, 500),
      },
    });
  }

  return records;
}

export const utilityShutoffCrawler: CrawlerModule = {
  id: "utility_shutoff",
  name: "Utility Shut-Off Crawler (Spokane/Kootenai)",
  async crawl(): Promise<CrawledRecord[]> {
    const all: CrawledRecord[] = [];
    for (const source of SOURCES) {
      try {
        const records = await crawlSource(source);
        all.push(...records);
      } catch (err) {
        console.error(`[UtilityShutoff] Error crawling ${source.name}:`, err);
      }
    }
    console.log(`[UtilityShutoff] Total records extracted: ${all.length}`);
    return all;
  },
};
