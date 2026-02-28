/**
 * Daily Court Docket Crawler (Divorce & Bankruptcy)
 *
 * Charter v3.1 §1: "lis pendens, divorce & bankruptcy filings" — intercept
 * distress signals from public court records before properties list.
 *
 * Sources:
 *   - Spokane County Superior Court (WA Courts public docket)
 *   - Kootenai County District Court (Idaho Repository)
 *
 * Targets: RCW ch. 26 divorce/dissolution, Title 11 bankruptcy filings.
 * Each record → { name, address, county, date, link, distressType: "divorce" | "bankruptcy" }
 *
 * Address extraction attempts to pull from docket text; often unavailable
 * from public indexes (PropertyRadar enrichment resolves later).
 */

import type { CrawlerModule, CrawledRecord } from "./predictive-crawler";
import type { DistressType } from "@/lib/types";

interface CourtSource {
  id: string;
  name: string;
  indexUrl: string;
  county: string;
  state: string;
  caseTypes: { pattern: RegExp; distressType: DistressType; label: string }[];
}

const COURT_SOURCES: CourtSource[] = [
  {
    id: "spokane_superior",
    name: "Spokane County Superior Court",
    indexUrl: "https://dw.courts.wa.gov/index.cfm?fa=home.casesearch&terms=accept&county=32",
    county: "Spokane",
    state: "WA",
    caseTypes: [
      { pattern: /\b(?:dissolution|divorce|domestic|family law)\b/i, distressType: "divorce", label: "Divorce/Dissolution" },
      { pattern: /\b(?:bankruptcy|chapter\s*(?:7|11|13)|insolvency)\b/i, distressType: "bankruptcy", label: "Bankruptcy" },
    ],
  },
  {
    id: "kootenai_district",
    name: "Kootenai County District Court",
    indexUrl: "https://www.idcourts.us/repository/caseSearch.do?roession=&county=Kootenai",
    county: "Kootenai",
    state: "ID",
    caseTypes: [
      { pattern: /\b(?:divorce|dissolution|domestic relations)\b/i, distressType: "divorce", label: "Divorce/Dissolution" },
      { pattern: /\b(?:bankruptcy|chapter\s*(?:7|11|13))\b/i, distressType: "bankruptcy", label: "Bankruptcy" },
    ],
  },
];

const ADDRESS_RE =
  /(\d{1,6}\s+[A-Z][A-Za-z\s.]+(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy)\.?)/gi;

const CITY_RE =
  /\b(Spokane|Spokane Valley|Liberty Lake|Cheney|Airway Heights|Coeur d'Alene|Post Falls|Hayden|Rathdrum|Sandpoint)\b/gi;

function extractAddress(text: string): { address: string | null; city: string | null } {
  const addrMatch = ADDRESS_RE.exec(text);
  ADDRESS_RE.lastIndex = 0;
  const cityMatch = CITY_RE.exec(text);
  CITY_RE.lastIndex = 0;
  return {
    address: addrMatch?.[1]?.trim() ?? null,
    city: cityMatch?.[1]?.trim() ?? null,
  };
}

function extractCaseNumber(text: string): string | null {
  const patterns = [
    /\b(\d{2}-\d-\d{5}-\d{1,2})\b/,
    /\b(CV-?\d{2,4}-\d{3,6})\b/i,
    /\b([A-Z]{2}\d{2}-\d{4,6})\b/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  return null;
}

function extractPartyName(text: string): string | null {
  const patterns = [
    /(?:Petitioner|Plaintiff|Debtor|In Re)\s*[:–—-]?\s*([A-Z][a-zA-Z\s,.'()-]{3,60})/,
    /class="[^"]*party[^"]*"[^>]*>([^<]{3,60})</i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:vs?\.?|v\.|VS\.)/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

function extractFilingDate(text: string): string {
  const patterns = [
    /(?:Filed|Filing Date|Date Filed)\s*[:–—]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /(\d{4}-\d{2}-\d{2})/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function extractCaseLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const re = /<a[^>]+href="([^"]*(?:case|docket|filing)[^"]*)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl).href;
      if (!links.includes(url)) links.push(url);
    } catch { /* skip */ }
  }
  return links.slice(0, 40);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DominionBot/1.0; +https://dominionhomedeals.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function classifyCase(
  text: string,
  caseTypes: CourtSource["caseTypes"]
): { distressType: DistressType; label: string } | null {
  for (const ct of caseTypes) {
    if (ct.pattern.test(text)) {
      ct.pattern.lastIndex = 0;
      return { distressType: ct.distressType, label: ct.label };
    }
  }
  return null;
}

async function crawlCourtSource(source: CourtSource): Promise<CrawledRecord[]> {
  const records: CrawledRecord[] = [];
  console.log(`[CourtCrawler] Fetching index: ${source.indexUrl}`);

  const indexHtml = await fetchWithTimeout(source.indexUrl);
  if (!indexHtml) {
    console.warn(`[CourtCrawler] Failed to fetch ${source.name}`);
    return records;
  }

  const caseLinks = extractCaseLinks(indexHtml, source.indexUrl);
  console.log(`[CourtCrawler] Found ${caseLinks.length} case links from ${source.name}`);

  const plainIndex = stripHtml(indexHtml);
  const indexEntries = parseIndexTable(plainIndex, indexHtml, source);
  records.push(...indexEntries);

  for (const link of caseLinks) {
    const html = await fetchWithTimeout(link);
    if (!html) continue;

    const text = stripHtml(html);
    const classification = classifyCase(text, source.caseTypes);
    if (!classification) continue;

    const name = extractPartyName(text);
    if (!name) continue;

    const caseNumber = extractCaseNumber(text);
    const { address, city } = extractAddress(text);
    const date = extractFilingDate(text);

    if (records.some((r) => r.name === name && r.county === source.county && r.distressType === classification.distressType)) {
      continue;
    }

    records.push({
      name,
      address,
      city,
      state: source.state,
      county: source.county,
      date,
      link,
      source: `court:${source.id}`,
      distressType: classification.distressType,
      caseType: classification.label,
      rawData: {
        case_number: caseNumber,
        court: source.name,
        snippet: text.slice(0, 500),
      },
    });
  }

  return records;
}

function parseIndexTable(plainText: string, html: string, source: CourtSource): CrawledRecord[] {
  const records: CrawledRecord[] = [];

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowText = stripHtml(rowMatch[1]);
    const classification = classifyCase(rowText, source.caseTypes);
    if (!classification) continue;

    const name = extractPartyName(rowText);
    if (!name) continue;

    const caseNumber = extractCaseNumber(rowText);
    const date = extractFilingDate(rowText);
    const { address, city } = extractAddress(rowText);

    if (records.some((r) => r.name === name && r.distressType === classification.distressType)) {
      continue;
    }

    records.push({
      name,
      address,
      city,
      state: source.state,
      county: source.county,
      date,
      link: source.indexUrl,
      source: `court:${source.id}`,
      distressType: classification.distressType,
      caseType: classification.label,
      rawData: {
        case_number: caseNumber,
        court: source.name,
        parsed_from: "index_table",
      },
    });
  }

  return records;
}

export const courtDocketCrawler: CrawlerModule = {
  id: "court_docket_daily",
  name: "Daily Court Docket Crawler (Spokane/Kootenai Divorce & Bankruptcy)",
  async crawl(): Promise<CrawledRecord[]> {
    const all: CrawledRecord[] = [];
    for (const source of COURT_SOURCES) {
      try {
        const records = await crawlCourtSource(source);
        all.push(...records);
      } catch (err) {
        console.error(`[CourtCrawler] Error crawling ${source.name}:`, err);
      }
    }
    console.log(`[CourtCrawler] Total filings extracted: ${all.length}`);
    return all;
  },
};
