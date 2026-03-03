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
 * Approach: Fetches the Craigslist search page HTML which contains:
 *   1. JSON-LD structured data (schema.org ItemList) with lat/long, bedrooms, bathrooms, city
 *   2. Static listing cards with titles, links, and prices
 * Combines both sources for comprehensive extraction.
 *
 * Note: Craigslist RSS feeds (format=rss) are blocked as of 2026. HTML pages
 * with embedded JSON-LD are the reliable alternative.
 *
 * Each crawled listing is normalized to:
 *   { name, address, city, state, county, date, link, source, distressType: "fsbo" }
 *
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
      "Coeur d'Alene", "Coeur D Alene", "Post Falls", "Hayden",
      "Rathdrum", "Sandpoint", "Greenacres", "Otis Orchards",
      "Nine Mile Falls", "Colbert", "Elk", "Spirit Lake",
    ],
  },
];

// ── Regex Patterns ──────────────────────────────────────────────────

const ADDRESS_RE =
  /(\d{1,6}\s+[A-Z][A-Za-z\s.]+(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy|Drive|Street|Avenue|Road|Lane|Boulevard|Court|Place|Circle)\.?)/gi;

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
  "health issues", "price reduced", "new price",
  "reduced", "below assessed",
];

// ── Helpers ─────────────────────────────────────────────────────────

function extractAddress(text: string): string | null {
  ADDRESS_RE.lastIndex = 0;
  const match = ADDRESS_RE.exec(text);
  return match?.[1]?.trim() ?? null;
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
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[CL-FSBO] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`[CL-FSBO] Fetch error for ${url}:`, err);
    return null;
  }
}

// ── JSON-LD Item ────────────────────────────────────────────────────

interface JsonLdItem {
  name: string;
  latitude?: number;
  longitude?: number;
  numberOfBedrooms?: number;
  numberOfBathroomsTotal?: number;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
  };
}

// ── HTML Listing Card ───────────────────────────────────────────────

interface ListingCard {
  title: string;
  link: string;
  price: number | null;
}

// ── Parsers ─────────────────────────────────────────────────────────

function parseJsonLdItems(html: string): JsonLdItem[] {
  // Extract JSON-LD script with id="ld_searchpage_results"
  const scriptRe = /<script[^>]*id\s*=\s*"ld_searchpage_results"[^>]*>([\s\S]*?)<\/script>/i;
  const match = scriptRe.exec(html);
  if (!match) {
    console.warn("[CL-FSBO] No JSON-LD search results found in HTML");
    return [];
  }

  try {
    const data = JSON.parse(match[1]);
    if (data?.["@type"] !== "ItemList" || !Array.isArray(data.itemListElement)) {
      return [];
    }

    return data.itemListElement
      .map((el: { item?: JsonLdItem }) => el.item)
      .filter((item: JsonLdItem | undefined): item is JsonLdItem => !!item?.name);
  } catch (err) {
    console.warn("[CL-FSBO] Failed to parse JSON-LD:", err);
    return [];
  }
}

function parseListingCards(html: string): ListingCard[] {
  const cards: ListingCard[] = [];
  // Match each <li class="cl-static-search-result"> block
  const cardRe = /<li\s+class="cl-static-search-result"[^>]*title="([^"]*)">\s*<a\s+href="([^"]*)"[\s\S]*?<div\s+class="price">([^<]*)<\/div>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRe.exec(html)) !== null) {
    const title = stripHtml(match[1]);
    const link = match[2].trim();
    const priceStr = match[3].trim();

    let price: number | null = null;
    if (priceStr && priceStr !== "$0") {
      const parsed = parseFloat(priceStr.replace(/[$,]/g, ""));
      if (!isNaN(parsed) && parsed >= 10000 && parsed <= 10000000) {
        price = parsed;
      }
    }

    if (title && link) {
      cards.push({ title, link, price });
    }
  }

  return cards;
}

// ── Crawl a Single Market ───────────────────────────────────────────

async function crawlMarket(market: CraigslistMarket): Promise<CrawledRecord[]> {
  const records: CrawledRecord[] = [];
  const searchUrl = `https://${market.subdomain}.craigslist.org/search/rea?housing_type=6`;

  console.log(`[CL-FSBO] Fetching search page: ${searchUrl}`);
  const html = await fetchWithTimeout(searchUrl);
  if (!html) {
    console.warn(`[CL-FSBO] Failed to fetch search page for ${market.name}`);
    return records;
  }

  // Parse both data sources
  const jsonLdItems = parseJsonLdItems(html);
  const listingCards = parseListingCards(html);

  console.log(`[CL-FSBO] ${market.name}: ${jsonLdItems.length} JSON-LD items, ${listingCards.length} listing cards`);

  // Build a map from title → listing card for easy lookup
  const cardsByTitle = new Map<string, ListingCard>();
  for (const card of listingCards) {
    cardsByTitle.set(card.title.toLowerCase().trim(), card);
  }

  // Process each JSON-LD item, enriched with card data
  const seenLinks = new Set<string>();

  for (let i = 0; i < jsonLdItems.length; i++) {
    const item = jsonLdItems[i];
    const itemNameLower = item.name.toLowerCase().trim();

    // Find matching card (by title match or by position)
    const matchedCard = cardsByTitle.get(itemNameLower) ?? listingCards[i];
    const link = matchedCard?.link ?? "";
    const cardPrice = matchedCard?.price ?? null;

    // Skip duplicates (same listing URL)
    if (link && seenLinks.has(link)) continue;
    if (link) seenLinks.add(link);

    const plainTitle = stripHtml(item.name);
    const combined = plainTitle;

    // Extract address from title or JSON-LD streetAddress
    const addressFromTitle = extractAddress(combined);
    const addressFromLd = item.address?.streetAddress || null;
    const address = addressFromTitle || (addressFromLd && addressFromLd.length > 3 ? addressFromLd : null);

    // City from JSON-LD or title
    const city = item.address?.addressLocality || market.cities[0];

    // State from JSON-LD or market default
    const state = item.address?.addressRegion || market.state;

    // Price from card HTML (most reliable) or from title extraction
    const price = cardPrice ?? extractPrice(combined);

    // Bedrooms/bathrooms from JSON-LD (structured) or title extraction
    const titleBedBath = extractBedBath(combined);
    const bedrooms = item.numberOfBedrooms ?? titleBedBath.bedrooms;
    const bathrooms = item.numberOfBathroomsTotal ?? titleBedBath.bathrooms;

    // Phone from title
    const phone = extractPhone(combined);

    // Motivation keywords
    const motivationKeywords = findMotivationKeywords(combined);

    // Build record name
    const name = address ? `FSBO ${address}` : `FSBO ${plainTitle.slice(0, 60)}`;

    records.push({
      name,
      address,
      city,
      state,
      county: market.county,
      date: new Date().toISOString().slice(0, 10),
      link,
      source: "craigslist",
      distressType: "fsbo",
      rawData: {
        listing_url: link,
        listing_title: plainTitle,
        price,
        bedrooms,
        bathrooms,
        contact_phone: phone,
        geo_lat: item.latitude ?? null,
        geo_long: item.longitude ?? null,
        motivation_keywords: motivationKeywords,
        market_id: market.id,
        platform: "craigslist",
        city,
        state,
        zip: item.address?.postalCode || null,
      },
    });
  }

  // Also process any listing cards that weren't matched to JSON-LD items
  for (const card of listingCards) {
    if (card.link && !seenLinks.has(card.link)) {
      seenLinks.add(card.link);
      const combined = card.title;
      const address = extractAddress(combined);
      const { bedrooms, bathrooms } = extractBedBath(combined);
      const phone = extractPhone(combined);
      const motivationKeywords = findMotivationKeywords(combined);
      const name = address ? `FSBO ${address}` : `FSBO ${card.title.slice(0, 60)}`;

      records.push({
        name,
        address,
        city: market.cities[0],
        state: market.state,
        county: market.county,
        date: new Date().toISOString().slice(0, 10),
        link: card.link,
        source: "craigslist",
        distressType: "fsbo",
        rawData: {
          listing_url: card.link,
          listing_title: card.title,
          price: card.price,
          bedrooms,
          bathrooms,
          contact_phone: phone,
          geo_lat: null,
          geo_long: null,
          motivation_keywords: motivationKeywords,
          market_id: market.id,
          platform: "craigslist",
          city: market.cities[0],
          state: market.state,
          zip: null,
        },
      });
    }
  }

  return records;
}

// ── Exported Crawler Module ─────────────────────────────────────────

export const craigslistFsboCrawler: CrawlerModule = {
  id: "craigslist_fsbo",
  name: "Craigslist FSBO Crawler (Spokane/Kootenai)",
  // FSBO listings are self-qualified — seller publicly declared intent to sell.
  // Always ingest regardless of score; enrichment batch will re-score with full data.
  promotionThreshold: 0,
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
