/**
 * Craigslist FSBO Crawler v2
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
 * v2 Improvements:
 *   - Junk filtering: rentals, ISO posts, obituaries, commercial, off-topic
 *   - Out-of-area filtering: only WA, ID, MT states accepted
 *   - City-to-ZIP lookup for Spokane/CdA area (~35 cities)
 *   - County inference from city/state (Kootenai, Bonner, etc.)
 *   - Stricter address validation (3+ words, valid street suffix)
 *   - Owner name: "Unknown" (not listing title)
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

// ── Junk Filtering ──────────────────────────────────────────────────

/** Titles matching any of these patterns are filtered out before ingestion */
const JUNK_TITLE_PATTERNS: RegExp[] = [
  /\b(obituar|memorial|funeral|rest in peace|rip)\b/i,
  /\b(ISO|in search of|looking for|wanted to buy|WTB)\b/i,
  /\b(for rent|rental|lease|per month|\/mo\b|deposit required)\b/i,
  /\b(trade|swap|exchange|barter)\b/i,
  /\b(commercial|warehouse|office space|retail space|industrial)\b/i,
  /\b(lot only|land only|vacant lot|raw land|acreage only)\b/i,
  /\b(roommate|room for rent|shared housing|sublet)\b/i,
  /\b(storage unit|parking spot|garage for rent)\b/i,
  /\b(mobile home lot|rv lot|rv space|rv park)\b/i,
];

/** Only accept listings in these states (filter out distant cross-posts) */
const VALID_STATES = new Set(["WA", "ID", "MT"]);

function isJunkListing(title: string): boolean {
  return JUNK_TITLE_PATTERNS.some((pat) => pat.test(title));
}

function isOutOfArea(state: string | null): boolean {
  if (!state) return false;
  return !VALID_STATES.has(state.toUpperCase());
}

// ── City → ZIP Lookup ───────────────────────────────────────────────

/** Maps city names (lowercased) to ZIP codes for the Spokane/CdA operating area */
const CITY_ZIP_MAP: Record<string, string> = {
  // Spokane County, WA
  "spokane": "99201", "spokane valley": "99206", "liberty lake": "99019",
  "cheney": "99004", "airway heights": "99001", "medical lake": "99022",
  "deer park": "99006", "mead": "99021", "greenacres": "99016",
  "otis orchards": "99027", "nine mile falls": "99026", "colbert": "99005",
  "elk": "99009", "four lakes": "99014", "valleyford": "99036",
  "spangle": "99031", "rockford": "99030", "fairfield": "99012",
  "latah": "99018", "waverly": "99039", "marshall": "99020",
  // Kootenai County, ID
  "coeur d'alene": "83814", "coeur d alene": "83814", "cda": "83814",
  "post falls": "83854", "hayden": "83835", "rathdrum": "83858",
  "spirit lake": "83869", "athol": "83801", "harrison": "83833",
  "worley": "83876", "dalton gardens": "83815", "hauser": "83854",
  "huetter": "83854",
  // Bonner County, ID
  "sandpoint": "83864", "ponderay": "83852", "priest river": "83856",
  "priest lake": "83856", "sagle": "83860", "hope": "83836",
  "clark fork": "83811",
  // Shoshone County, ID
  "kellogg": "83837", "wallace": "83873", "silverton": "83867",
  // Stevens County, WA
  "chewelah": "99109", "colville": "99114", "kettle falls": "99141",
  // Other nearby
  "moscow": "83843", "pullman": "99163", "lewiston": "83501",
  "clarkston": "99403", "oldtown": "83822", "newport": "99156",
  "bonners ferry": "83805",
  // Sanders County, MT
  "plains": "59859", "thompson falls": "59873", "trout creek": "59874",
  // Mineral County, MT
  "saint regis": "59866", "st. regis": "59866", "superior": "59872",
};

/** Returns the inferred county based on city + state */
function inferCounty(city: string, state: string): string {
  const key = city.toLowerCase().trim();
  const st = state.toUpperCase();

  // Idaho cities
  if (st === "ID") {
    if (["coeur d'alene", "coeur d alene", "cda", "post falls", "hayden",
         "rathdrum", "spirit lake", "athol", "harrison", "worley",
         "dalton gardens", "hauser", "huetter"].includes(key)) return "Kootenai";
    if (["sandpoint", "ponderay", "priest river", "priest lake", "sagle",
         "hope", "clark fork", "bonners ferry"].includes(key)) return "Bonner";
    if (["kellogg", "wallace", "silverton"].includes(key)) return "Shoshone";
    if (["oldtown"].includes(key)) return "Bonner";
    if (["moscow"].includes(key)) return "Latah";
    if (["lewiston"].includes(key)) return "Nez Perce";
    if (["medimont"].includes(key)) return "Kootenai";
  }
  // Montana cities
  if (st === "MT") {
    if (["plains", "thompson falls", "trout creek"].includes(key)) return "Sanders";
    if (["saint regis", "st. regis", "superior"].includes(key)) return "Mineral";
    if (["somers", "bigfork", "kalispell", "whitefish"].includes(key)) return "Flathead";
    if (["missoula"].includes(key)) return "Missoula";
  }
  // WA cities
  if (st === "WA") {
    if (["spokane", "spokane valley", "liberty lake", "cheney",
         "airway heights", "medical lake", "deer park", "mead",
         "greenacres", "otis orchards", "nine mile falls", "colbert", "elk",
         "four lakes", "valleyford", "spangle", "rockford", "fairfield",
         "latah", "waverly", "marshall"].includes(key)) return "Spokane";
    if (["chewelah", "colville", "kettle falls"].includes(key)) return "Stevens";
    if (["pullman"].includes(key)) return "Whitman";
    if (["clarkston"].includes(key)) return "Asotin";
    if (["newport"].includes(key)) return "Pend Oreille";
  }

  return "Spokane"; // Default for the market
}

function lookupZip(city: string): string | null {
  return CITY_ZIP_MAP[city.toLowerCase().trim()] ?? null;
}

// ── Regex Patterns ──────────────────────────────────────────────────

/**
 * Stricter address regex: requires a number, at least 2 words of street name,
 * and a valid street suffix. This avoids false positives like "15 AM at the..."
 */
const ADDRESS_RE =
  /(\d{1,6}\s+(?:[A-Z][A-Za-z]+\s+){1,4}(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy|Drive|Street|Avenue|Road|Lane|Boulevard|Court|Place|Circle|Trail|Trl|Pike|Run|Pass)\.?(?:\s+(?:N|S|E|W|NE|NW|SE|SW|#\d+|Apt\s*\d+|Unit\s*\d+|Ste\s*\d+))?)/gi;

const PRICE_RE = /\$\s*([\d,]+(?:\.\d{2})?)/g;
const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const BR_RE = /(\d+)\s*(?:br|bed|bedroom)/gi;
const BA_RE = /(\d+(?:\.\d)?)\s*(?:ba|bath|bathroom)/gi;
const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/g;

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
  if (!match) return null;
  const addr = match[1].trim();
  // Validate: address must have at least 3 words (number + street name + suffix)
  const wordCount = addr.split(/\s+/).length;
  if (wordCount < 3) return null;
  return addr;
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

function extractZipFromText(text: string): string | null {
  ZIP_RE.lastIndex = 0;
  const match = ZIP_RE.exec(text);
  if (!match) return null;
  const zip = match[1];
  // Basic validation: US ZIPs in our area start with 83xxx (ID), 99xxx (WA), 59xxx (MT)
  if (zip.startsWith("83") || zip.startsWith("99") || zip.startsWith("59")) {
    return zip;
  }
  return null;
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
  let filteredJunk = 0;
  let filteredArea = 0;

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

    // ── v2: Junk filter ──
    if (isJunkListing(plainTitle)) {
      filteredJunk++;
      continue;
    }

    // City from JSON-LD or market default
    const city = item.address?.addressLocality || market.cities[0];

    // State from JSON-LD or market default
    const state = item.address?.addressRegion || market.state;

    // ── v2: Out-of-area filter ──
    if (isOutOfArea(state)) {
      filteredArea++;
      continue;
    }

    // Extract address from title or JSON-LD streetAddress
    const addressFromTitle = extractAddress(plainTitle);
    const addressFromLd = item.address?.streetAddress || null;
    const address = addressFromTitle || (addressFromLd && addressFromLd.length > 5 ? addressFromLd : null);

    // ── v2: ZIP code resolution (3-tier: JSON-LD → title → city lookup) ──
    const zipFromLd = item.address?.postalCode || null;
    const zipFromTitle = extractZipFromText(plainTitle);
    const zipFromCity = lookupZip(city);
    const zip = zipFromLd || zipFromTitle || zipFromCity || "";

    // ── v2: County inference from city/state ──
    const inferredCounty = inferCounty(city, state);

    // Price from card HTML (most reliable) or from title extraction
    const price = cardPrice ?? extractPrice(plainTitle);

    // Bedrooms/bathrooms from JSON-LD (structured) or title extraction
    const titleBedBath = extractBedBath(plainTitle);
    const bedrooms = item.numberOfBedrooms ?? titleBedBath.bedrooms;
    const bathrooms = item.numberOfBathroomsTotal ?? titleBedBath.bathrooms;

    // Phone from title
    const phone = extractPhone(plainTitle);

    // Motivation keywords
    const motivationKeywords = findMotivationKeywords(plainTitle);

    // ── v2: Owner name — never use listing title ──
    // Owner is unknown until skip-trace; use a descriptive placeholder
    const ownerName = address
      ? `FSBO Owner — ${address}`
      : `FSBO Owner — ${city}, ${state}`;

    records.push({
      name: ownerName,
      address,
      city,
      state,
      // IMPORTANT: Keep county = market.county so upsert matches existing records
      // (property upsert uses onConflict: "apn,county"). Store inferredCounty in rawData
      // for display; enrichment will correct county from PropertyRadar.
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
        zip,
        inferred_county: inferredCounty,
      },
    });
  }

  // Also process any listing cards that weren't matched to JSON-LD items
  for (const card of listingCards) {
    if (card.link && !seenLinks.has(card.link)) {
      seenLinks.add(card.link);
      const title = card.title;

      // ── v2: Junk filter ──
      if (isJunkListing(title)) {
        filteredJunk++;
        continue;
      }

      const address = extractAddress(title);
      const { bedrooms, bathrooms } = extractBedBath(title);
      const phone = extractPhone(title);
      const motivationKeywords = findMotivationKeywords(title);
      const zipFromTitle = extractZipFromText(title);
      const zipFromCity = lookupZip(market.cities[0]);
      const zip = zipFromTitle || zipFromCity || "";

      const ownerName = address
        ? `FSBO Owner — ${address}`
        : `FSBO Owner — ${market.cities[0]}, ${market.state}`;

      records.push({
        name: ownerName,
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
          zip,
          inferred_county: market.county,
        },
      });
    }
  }

  console.log(`[CL-FSBO] ${market.name}: ${records.length} valid listings (filtered: ${filteredJunk} junk, ${filteredArea} out-of-area)`);

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
