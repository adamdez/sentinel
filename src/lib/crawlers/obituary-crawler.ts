/**
 * Daily Obituary Crawler
 *
 * Charter v3.1 §1: "pre-probates via obituaries" — ingest deaths before
 * probate filings hit the recorder, giving us 7–14 day upstream advantage.
 *
 * Sources (WA/ID focus):
 *   - The Spokesman-Review (Spokane)
 *   - Coeur d'Alene Press
 *   - Legacy.com regional feed
 *   - Funeral home sites (Hennessey-Smith, Hazen & Jaeger, etc.)
 *
 * Each crawled obituary is normalized to:
 *   { name, address, city, state, county, date, link, source, distressType: "probate" }
 *
 * Address extraction uses regex heuristics; null when not found.
 * APN resolution deferred to PropertyRadar enrichment pass.
 */

import type { CrawlerModule, CrawledRecord } from "./predictive-crawler";

interface ObituarySource {
  id: string;
  name: string;
  url: string;
  county: string;
  state: string;
}

const SOURCES: ObituarySource[] = [
  {
    id: "spokesman_obits",
    name: "Spokesman-Review Obituaries",
    url: "https://www.legacy.com/us/obituaries/spokesman/browse",
    county: "Spokane",
    state: "WA",
  },
  {
    id: "cda_press_obits",
    name: "Coeur d'Alene Press Obituaries",
    url: "https://www.legacy.com/us/obituaries/cdapress/browse",
    county: "Kootenai",
    state: "ID",
  },
  {
    id: "hennessey_smith",
    name: "Hennessey Valley Funeral Chapel",
    url: "https://www.hennesseyvalley.com/obituaries",
    county: "Spokane",
    state: "WA",
  },
  {
    id: "hazen_jaeger",
    name: "Hazen & Jaeger Funeral Home",
    url: "https://www.hazenjaeger.com/obituaries",
    county: "Spokane",
    state: "WA",
  },
  {
    id: "yates_funeral",
    name: "Yates Funeral Homes",
    url: "https://www.yatesfuneralhomes.com/obituaries",
    county: "Kootenai",
    state: "ID",
  },
];

const ADDRESS_RE =
  /(?:resided?\s+(?:at|in|on)|(?:of|from)\s+)?\s*(\d{1,6}\s+[A-Z][A-Za-z\s.]+(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy)\.?)/gi;
const CITY_STATE_RE =
  /\b(Spokane|Spokane Valley|Liberty Lake|Cheney|Airway Heights|Coeur d'Alene|Post Falls|Hayden|Rathdrum|Sandpoint)\b/gi;

function extractAddress(text: string): { address: string | null; city: string | null } {
  const addrMatch = ADDRESS_RE.exec(text);
  ADDRESS_RE.lastIndex = 0;
  const cityMatch = CITY_STATE_RE.exec(text);
  CITY_STATE_RE.lastIndex = 0;

  return {
    address: addrMatch?.[1]?.trim() ?? null,
    city: cityMatch?.[1]?.trim() ?? null,
  };
}

function extractDate(text: string): string {
  const datePatterns = [
    /(?:passed|died|passing)\s+(?:away\s+)?(?:on\s+)?(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(\w+\s+\d{1,2},?\s+\d{4})\s*[-–]\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
  ];

  for (const re of datePatterns) {
    const match = re.exec(text);
    if (match) {
      const d = new Date(match[1]);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function extractName(text: string): string | null {
  const namePatterns = [
    /<h[1-3][^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)</i,
    /<title>([^|<–-]+)/i,
    /class="[^"]*obit[^"]*name[^"]*"[^>]*>([^<]+)</i,
  ];
  for (const re of namePatterns) {
    const match = re.exec(text);
    if (match) {
      const name = match[1].replace(/\s+obituary\b/i, "").trim();
      if (name.length > 3 && name.length < 80) return name;
    }
  }
  return null;
}

function extractObituaryLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkRe = /<a[^>]+href="([^"]*obituar[^"]*)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl).href;
      if (!links.includes(url)) links.push(url);
    } catch { /* skip malformed URLs */ }
  }
  return links.slice(0, 25);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<string | null> {
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

async function crawlSource(source: ObituarySource): Promise<CrawledRecord[]> {
  const records: CrawledRecord[] = [];
  console.log(`[ObitCrawler] Fetching index: ${source.url}`);

  const indexHtml = await fetchWithTimeout(source.url);
  if (!indexHtml) {
    console.warn(`[ObitCrawler] Failed to fetch ${source.name}`);
    return records;
  }

  const links = extractObituaryLinks(indexHtml, source.url);
  console.log(`[ObitCrawler] Found ${links.length} obituary links from ${source.name}`);

  for (const link of links) {
    const html = await fetchWithTimeout(link);
    if (!html) continue;

    const plainText = stripHtml(html);
    const name = extractName(html);
    if (!name) continue;

    const { address, city } = extractAddress(plainText);
    const date = extractDate(plainText);

    records.push({
      name,
      address,
      city,
      state: source.state,
      county: source.county,
      date,
      link,
      source: `obituary:${source.id}`,
      distressType: "probate",
      rawData: {
        funeral_source: source.name,
        snippet: plainText.slice(0, 500),
      },
    });
  }

  return records;
}

export const obituaryCrawler: CrawlerModule = {
  id: "obituary_daily",
  name: "Daily Obituary Crawler (Spokane/Kootenai)",
  async crawl(): Promise<CrawledRecord[]> {
    const all: CrawledRecord[] = [];
    for (const source of SOURCES) {
      try {
        const records = await crawlSource(source);
        all.push(...records);
      } catch (err) {
        console.error(`[ObitCrawler] Error crawling ${source.name}:`, err);
      }
    }
    console.log(`[ObitCrawler] Total obituaries extracted: ${all.length}`);
    return all;
  },
};
