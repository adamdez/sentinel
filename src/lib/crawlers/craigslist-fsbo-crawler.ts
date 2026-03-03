/**
 * Craigslist FSBO Crawler
 *
 * Charter v3.1 §1: Chase every legal upstream edge — FSBO listings on Craigslist
 * represent motivated sellers who have publicly declared intent to sell without
 * an agent. First-to-contact wins.
 *
 * Sources (WA/ID focus — expandable):
 *   - Craigslist Spokane (covers Spokane County + Kootenai County)
 *
 * Uses Craigslist's public RSS feeds:
 *   https://{city}.craigslist.org/search/rea?format=rss&housing_type=6
 *   housing_type=6 = "by owner" (FSBO)
 *
 * Each crawled listing is normalized to:
 *   { name, address, city, state, county, date, link, source, distressType: "fsbo" }
 *
 * Address extraction uses regex heuristics; geo coordinates from RSS as fallback.
 * APN resolution deferred to PropertyRadar enrichment pass.
 */

import type { CrawlerModule, CrawledRecord } from "./predictive-crawler";

// ── Market Configuration ────────────────────────────────────────────

interface CraigslistMarket {
  id: string;
  name: string;
  subdomain: string;
  county: string;
  state: string;
  cities: string[];
}

const MARKETS: CraigslistMarket[] = [
  {
    id: "cl_spokane",
    name: "Craigslist Spokane FSBO",
    subdomain: "spokane",
    county: "Spokane",
    state: "WA",
    cities: [
      "Spokane", "Spokane Valley", "Liberty Lake", "Cheney",
      "Airway Heights", "Medical Lake", "Deer Park", "Mead",
      "Coeur d'Alene", "Post Falls", "Hayden", "Rathdrum", "Sandpoint",
    ],
  },
];

// ── Regex Patterns ──────────────────────────────────────────────────

const ADDRESS_RE =
  /(\d{1,6}\s+[A-Z][A-Za-z\s.]+(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy|Drive|Street|Avenue|Road|Lane|Boulevard|Court|Place|Circle)\.?)/gi;

const CITY_RE = new RegExp(
  `\\b(${MARKETS.flatMap((m) => m.cities).join("|")})\\b`,
  "gi"
);

const PRICE_RE = /\$\s*([\d,]+(?:\.\d{2})?)/g;
const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const BR_RE = /(\d+)\s*(?:br|bed|bedroom)/gi;
const BA_RE = /(\d+(?:\.\d)?)\s*(?:ba|bath|bathroom)/gi;

const MOTIVATION_KEYWORDS = [
  "must sell", "motivated", "price reduced", "price drop",
  "relocating", "relocation", "divorce", "estate sale",
  "inherited", "as-is", "as is", "below market",
  "quick sale", "urgent", "desperate", "make offer",
  "owner financing", "owner will carry", "fixer upper",
  "fixer-upper", "handyman special", "needs work",
  "cash only", "investors welcome", "wholesale",
];

// ── Helpers ─────────────────────────────────────────────────────────

function extractAddress(text: string): { address: string | null; city: string | null } {
  ADDRESS_RE.lastIndex = 0;
  CITY_RE.lastIndex = 0;
  const addrMatch = ADDRESS_RE.exec(text);
  const cityMatch = CITY_RE.exec(text);
  return {
    address: addrMatch?.[1]?.trim() ?? null,
    city: cityMatch?.[1]?.trim() ?? null,
  };
}

function extractPrice(text: string): number | null {
  PRICE_RE.lastIndex = 0;
  const match = PRICE_RE.exec(text);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  // Filter out unreasonable prices (< $10k or > $10M)
  if (num < 10000 || num > 10000000) return null;
  return num;
}

function extractBedBath(text: string): { bedrooms: number | null; bathrooms: number | null } {
  BR_RE.lastIndex = 0;
  BA_RE.lastIndex = 0;
  const brMatch = BR_RE.exec(text);
  const baMatch = BA_RE.exec(text);
  return {
    bedrooms: brMatch ? parseInt(brMatch[1], 10) : null,
    bathrooms: baMatch ? parseFloat(baMatch[1]) : null,
  };
}

function extractPhone(text: string): string | null {
  PHONE_RE.lastIndex = 0;
  const match = PHONE_RE.exec(text);
  return match?.[0] ?? null;
}

function findMotivationKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return MOTIVATION_KEYWORDS.filter((kw) => lower.includes(kw));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DominionBot/1.0; +https://dominionhomedeals.com)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── RSS Item Parser ─────────────────────────────────────────────────

interface RSSItem {
  title: string;
  link: string;
  description: string;
  date: string;
  geoLat: number | null;
  geoLong: number | null;
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch = /<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/i.exec(block);
    const linkMatch = /<link>(.*?)<\/link>/i.exec(block);
    const descMatch = /<description><!\[CDATA\[([\s\S]*?)\]\]>|<description>([\s\S]*?)<\/description>/i.exec(block);
    const dateMatch = /<dc:date>(.*?)<\/dc:date>/i.exec(block);
    const latMatch = /<geo:lat>([\d.-]+)<\/geo:lat>/i.exec(block);
    const longMatch = /<geo:long>([\d.-]+)<\/geo:long>/i.exec(block);

    const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? "").trim();
    const link = (linkMatch?.[1] ?? "").trim();
    const description = (descMatch?.[1] ?? descMatch?.[2] ?? "").trim();
    const date = (dateMatch?.[1] ?? new Date().toISOString()).trim();

    if (!title || !link) continue;

    items.push({
      title,
      link,
      description,
      date: new Date(date).toISOString().slice(0, 10),
      geoLat: latMatch ? parseFloat(latMatch[1]) : null,
      geoLong: longMatch ? parseFloat(longMatch[1]) : null,
    });
  }

  return items;
}

// ── Crawl a Single Market ───────────────────────────────────────────

async function crawlMarket(market: CraigslistMarket): Promise<CrawledRecord[]> {
  const records: CrawledRecord[] = [];
  const rssUrl = `https://${market.subdomain}.craigslist.org/search/rea?format=rss&housing_type=6&availabilityMode=0`;

  console.log(`[CL-FSBO] Fetching RSS: ${rssUrl}`);
  const xml = await fetchWithTimeout(rssUrl);
  if (!xml) {
    console.warn(`[CL-FSBO] Failed to fetch RSS for ${market.name}`);
    return records;
  }

  const items = parseRSSItems(xml);
  console.log(`[CL-FSBO] Parsed ${items.length} listings from ${market.name}`);

  for (const item of items) {
    const plainTitle = stripHtml(item.title);
    const plainDesc = stripHtml(item.description);
    const combined = `${plainTitle} ${plainDesc}`;

    const { address, city } = extractAddress(combined);
    const price = extractPrice(combined);
    const { bedrooms, bathrooms } = extractBedBath(combined);
    const phone = extractPhone(plainDesc);
    const motivationKeywords = findMotivationKeywords(combined);

    // Build a name from the listing — use address or title snippet
    const name = address
      ? `FSBO ${address}`
      : `FSBO ${plainTitle.slice(0, 60)}`;

    records.push({
      name,
      address,
      city: city ?? market.cities[0],
      state: market.state,
      county: market.county,
      date: item.date,
      link: item.link,
      source: "craigslist",
      distressType: "fsbo",
      rawData: {
        listing_url: item.link,
        listing_title: plainTitle,
        price,
        bedrooms,
        bathrooms,
        contact_phone: phone,
        geo_lat: item.geoLat,
        geo_long: item.geoLong,
        motivation_keywords: motivationKeywords,
        description_snippet: plainDesc.slice(0, 500),
        market_id: market.id,
        platform: "craigslist",
      },
    });
  }

  return records;
}

// ── Exported Crawler Module ─────────────────────────────────────────

export const craigslistFsboCrawler: CrawlerModule = {
  id: "craigslist_fsbo",
  name: "Craigslist FSBO Crawler (Spokane/Kootenai)",
  async crawl(): Promise<CrawledRecord[]> {
    const all: CrawledRecord[] = [];
    for (const market of MARKETS) {
      try {
        const records = await crawlMarket(market);
        all.push(...records);
      } catch (err) {
        console.error(`[CL-FSBO] Error crawling ${market.name}:`, err);
      }
    }
    console.log(`[CL-FSBO] Total FSBO listings extracted: ${all.length}`);
    return all;
  },
};
