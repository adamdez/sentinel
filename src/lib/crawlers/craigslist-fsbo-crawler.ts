/**
 * Craigslist FSBO Crawler v3
 *
 * Charter v3.1 §1: Chase every legal upstream edge — FSBO listings on Craigslist
 * represent motivated sellers who have publicly declared intent to sell without
 * an agent. First-to-contact wins.
 *
 * v3: Two-pass approach:
 *   Pass 1 — Fetch search results page for listing URLs, basic city/state, prices
 *   Pass 2 — Follow each listing link to scrape the DETAIL page for:
 *            street address, ZIP, sqft, lot size, phone number, contact name,
 *            full description, posted/updated dates
 *
 * The search page JSON-LD has almost no useful data (streetAddress is blank,
 * no ZIP, no sqft, no phone). The detail page has everything.
 *
 * Performance: ~94 listings × ~1-2s each = ~2-3 min. maxDuration is 300s.
 * Uses controlled concurrency (5 parallel fetches) to stay fast but polite.
 */

import type { CrawlerModule, CrawledRecord } from "./predictive-crawler";

// ── Market Configuration ────────────────────────────────────────────

interface CraigslistMarket {
  id: string;
  name: string;
  subdomain: string;
  county: string;
  state: string;
}

const MARKETS: CraigslistMarket[] = [
  {
    id: "cl_spokane",
    name: "Craigslist Spokane FSBO",
    subdomain: "spokane",
    county: "Spokane",
    state: "WA",
  },
];

// ── Junk Filtering ──────────────────────────────────────────────────

const JUNK_TITLE_PATTERNS: RegExp[] = [
  /\b(obituar|memorial|funeral|rest in peace|rip)\b/i,
  /\b(ISO|in search of|looking for|wanted to buy|WTB)\b/i,
  /\b(for rent|rental|lease|per month|\/mo\b|deposit required)\b/i,
  /\b(trade|swap|exchange|barter)\b/i,
  /\b(commercial|warehouse|office space|retail space|industrial)\b/i,
  /\b(roommate|room for rent|shared housing|sublet)\b/i,
  /\b(storage unit|parking spot|garage for rent)\b/i,
];

// MLS pattern — listings with MLS numbers are agent-listed, NOT true FSBO
// Common formats: "MLS# 12345678", "MLS 12345678", "MLS#12345678", "MLS ID: 12345678"
const MLS_RE = /\bMLS\s*#?\s*:?\s*\d{5,}/i;

const VALID_STATES = new Set(["WA", "ID", "MT"]);

function isJunkListing(title: string, body?: string): boolean {
  if (JUNK_TITLE_PATTERNS.some((pat) => pat.test(title))) return true;
  // Also check body for rental signals that slip through titles
  if (body && /\b(for rent|rental only|lease only|tenant|renter)\b/i.test(body)) return true;
  return false;
}

/** Returns true if listing contains an MLS number (agent-listed, not FSBO) */
function hasMLSNumber(title: string, body?: string): boolean {
  if (MLS_RE.test(title)) return true;
  if (body && MLS_RE.test(body)) return true;
  // Also catch "listed by" / "listing agent" / "listing courtesy of" patterns
  if (body && /\b(listing\s+agent|listed\s+by|courtesy\s+of|listing\s+courtesy|broker\s*:)\b/i.test(body)) return true;
  return false;
}

function isOutOfArea(state: string | null): boolean {
  if (!state) return false;
  return !VALID_STATES.has(state.toUpperCase());
}

// ── City → ZIP Lookup ───────────────────────────────────────────────

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
  "clark fork": "83811", "colburn": "83865",
  // Clearwater County, ID
  "elk river": "83827", "orofino": "83544",
  // Benewah County, ID
  "medimont": "83842", "st. maries": "83861", "santa": "83866",
  // Shoshone County, ID
  "kellogg": "83837", "wallace": "83873", "silverton": "83867",
  // Stevens County, WA
  "chewelah": "99109", "colville": "99114", "kettle falls": "99141",
  // Okanogan County, WA
  "wauconda": "98859", "okanogan": "98840", "omak": "98841",
  // Other nearby
  "moscow": "83843", "pullman": "99163", "lewiston": "83501",
  "clarkston": "99403", "oldtown": "83822", "newport": "99156",
  "bonners ferry": "83805",
  // Flathead County, MT
  "somers": "59932", "bigfork": "59911", "kalispell": "59901",
  "whitefish": "59937", "lakeside": "59922", "columbia falls": "59912",
  // Sanders County, MT
  "plains": "59859", "thompson falls": "59873", "trout creek": "59874",
  // Mineral County, MT
  "saint regis": "59866", "st. regis": "59866", "superior": "59872",
};

export function inferCounty(city: string, state: string): string | null {
  const key = city.toLowerCase().trim();
  const st = state.toUpperCase();

  if (st === "ID") {
    if (["coeur d'alene", "coeur d alene", "cda", "post falls", "hayden",
         "rathdrum", "spirit lake", "athol", "harrison", "worley",
         "dalton gardens", "hauser", "huetter"].includes(key)) return "Kootenai";
    if (["sandpoint", "ponderay", "priest river", "priest lake", "sagle",
         "hope", "clark fork", "bonners ferry", "colburn"].includes(key)) return "Bonner";
    if (["kellogg", "wallace", "silverton"].includes(key)) return "Shoshone";
    if (["oldtown"].includes(key)) return "Bonner";
    if (["moscow"].includes(key)) return "Latah";
    if (["lewiston"].includes(key)) return "Nez Perce";
    if (["medimont", "st. maries", "santa"].includes(key)) return "Benewah";
    if (["elk river", "orofino"].includes(key)) return "Clearwater";
  }
  if (st === "MT") {
    if (["plains", "thompson falls", "trout creek"].includes(key)) return "Sanders";
    if (["saint regis", "st. regis", "superior"].includes(key)) return "Mineral";
    if (["somers", "bigfork", "kalispell", "whitefish", "lakeside", "columbia falls"].includes(key)) return "Flathead";
    if (["missoula"].includes(key)) return "Missoula";
  }
  if (st === "WA") {
    if (["spokane", "spokane valley", "liberty lake", "cheney",
         "airway heights", "medical lake", "deer park", "mead",
         "greenacres", "otis orchards", "nine mile falls", "colbert", "elk",
         "four lakes", "valleyford", "spangle", "rockford", "fairfield",
         "latah", "waverly", "marshall"].includes(key)) return "Spokane";
    if (["chewelah", "colville", "kettle falls"].includes(key)) return "Stevens";
    if (["wauconda", "okanogan", "omak"].includes(key)) return "Okanogan";
    if (["pullman"].includes(key)) return "Whitman";
    if (["clarkston"].includes(key)) return "Asotin";
    if (["newport"].includes(key)) return "Pend Oreille";
  }
  return null;
}

function lookupZip(city: string): string | null {
  return CITY_ZIP_MAP[city.toLowerCase().trim()] ?? null;
}

// ── Regex Patterns ──────────────────────────────────────────────────

// Relaxed address regex for detail page parsing — the detail page has cleaner data
const ADDRESS_RE =
  /(\d{1,6}\s+[A-Za-z][\w\s.'-]{2,60}(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy|Drive|Street|Avenue|Road|Lane|Boulevard|Court|Place|Circle|Trail|Trl|Pike|Run|Pass)\.?(?:\s+(?:N|S|E|W|NE|NW|SE|SW|#\s*\d+|Apt\.?\s*\d+|Unit\s*\d+|Ste\.?\s*\d+))?)/i;

const PRICE_RE = /\$\s*([\d,]+(?:\.\d{2})?)/;
const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/g;
const SQFT_RE = /(\d[\d,]*)\s*(?:sq\.?\s*(?:ft|feet)|sqft|square\s*(?:ft|feet))/i;
const LOT_RE = /(\d+(?:\.\d+)?)\s*(?:acres?|ac\b)/i;

const MOTIVATION_KEYWORDS = [
  "must sell", "motivated", "price reduced", "price drop",
  "relocating", "relocation", "divorce", "estate sale",
  "inherited", "as-is", "as is", "below market",
  "quick sale", "urgent", "desperate", "make offer",
  "owner financing", "owner will carry", "fixer upper",
  "fixer-upper", "handyman special", "needs work",
  "cash only", "investors welcome", "wholesale",
  "health issues", "new price", "reduced", "below assessed",
];

// ── Extraction Helpers ──────────────────────────────────────────────

function extractAddress(text: string): string | null {
  ADDRESS_RE.lastIndex = 0;
  const match = ADDRESS_RE.exec(text);
  if (!match) return null;
  const addr = match[1].trim();
  if (addr.split(/\s+/).length < 3) return null;
  return addr;
}

/**
 * Parse addresses from CL title patterns like:
 * "For Sale: 311 S Third AVE, Sandpoint, ID 83864"
 * "811 E Seasons Rd, Athol, ID 83801 - Beautiful Home"
 */
function extractAddressFromTitle(title: string): { address: string | null; city: string | null; state: string | null; zip: string | null } {
  // Pattern: "address, City, ST ZIP"
  const fullPattern = /(\d{1,6}\s+[A-Za-z][\w\s.'-]+(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy|Drive|Street|Avenue|Road|Lane|Boulevard|Court|Place|Circle|Trail|Trl|Pass)\.?(?:\s+[NSEW]{1,2})?)\s*,\s*([A-Za-z\s]+?)\s*,\s*([A-Z]{2})\s+(\d{5})/i;
  const m = fullPattern.exec(title);
  if (m) {
    return { address: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
  }

  // Pattern without ZIP: "address, City, ST"
  const noZipPattern = /(\d{1,6}\s+[A-Za-z][\w\s.'-]+(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Way|Pl|Cir|Ter|Loop|Hwy|Drive|Street|Avenue|Road|Lane|Boulevard|Court|Place|Circle|Trail|Trl|Pass)\.?(?:\s+[NSEW]{1,2})?)\s*,\s*([A-Za-z\s]+?)\s*,\s*([A-Z]{2})\b/i;
  const m2 = noZipPattern.exec(title);
  if (m2) {
    return { address: m2[1].trim(), city: m2[2].trim(), state: m2[3].toUpperCase(), zip: null };
  }

  // Just try address extraction
  const addr = extractAddress(title);
  return { address: addr, city: null, state: null, zip: null };
}

function extractPrice(text: string): number | null {
  PRICE_RE.lastIndex = 0;
  const match = PRICE_RE.exec(text);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  if (num < 10000 || num > 10000000) return null;
  return num;
}

/**
 * Decode obfuscated phone numbers that CL sellers use to avoid spam bots.
 * Common patterns:
 *   "5O9.993.3719"   (letter O for zero)
 *   "5 0 9 - 9 9 3 - 3 7 1 9"   (extra spaces)
 *   "five oh nine 993 3719"   (word substitution — too complex, skip)
 *   "509-99TREE-TREE7l9"   (word substitution + letter l for 1 — partial decode)
 */
function deobfuscateDigits(text: string): string {
  return text
    .replace(/[Oo]/g, "0")      // letter O → 0
    .replace(/[Ii!|l]/g, "1")   // letter I/l/|/! → 1
    .replace(/[Ss\$]/g, "5")    // letter S/$ → 5
    .replace(/[Bb]/g, "8")      // letter B → 8
    .replace(/\b(?:zero|ZERO)\b/g, "0")
    .replace(/\b(?:one|ONE)\b/g, "1")
    .replace(/\b(?:two|TWO)\b/g, "2")
    .replace(/\b(?:three|THREE|tree|TREE)\b/g, "3")
    .replace(/\b(?:four|FOUR|for|FOR)\b/g, "4")
    .replace(/\b(?:five|FIVE)\b/g, "5")
    .replace(/\b(?:six|SIX)\b/g, "6")
    .replace(/\b(?:seven|SEVEN)\b/g, "7")
    .replace(/\b(?:eight|EIGHT)\b/g, "8")
    .replace(/\b(?:nine|NINE|niner|NINER)\b/g, "9");
}

function extractPhones(text: string): string[] {
  const phones: string[] = [];

  // Pass 1: Standard phone regex on raw text
  let match: RegExpExecArray | null;
  PHONE_RE.lastIndex = 0;
  while ((match = PHONE_RE.exec(text)) !== null) {
    const p = match[0].replace(/[^\d]/g, "");
    if (p.length === 10 && !p.startsWith("000") && !p.startsWith("555") && !p.startsWith("123")) {
      phones.push(p);
    }
  }

  // Pass 2: Deobfuscate text and try again (catches "5O9.993.3719", word subs, etc.)
  if (phones.length === 0) {
    const decoded = deobfuscateDigits(text);
    // After deobfuscation, try matching spaced-out digits like "5 0 9 9 9 3 3 7 1 9"
    // First try standard regex on decoded text
    PHONE_RE.lastIndex = 0;
    while ((match = PHONE_RE.exec(decoded)) !== null) {
      const p = match[0].replace(/[^\d]/g, "");
      if (p.length === 10 && !p.startsWith("000") && !p.startsWith("555") && !p.startsWith("123")) {
        phones.push(p);
      }
    }

    // Also try finding 10 digits with single-character separators (including spaces)
    if (phones.length === 0) {
      const spacedRe = /(\d)\s*[-.\s]\s*(\d)\s*[-.\s]\s*(\d)\s*[-.\s]\s*(\d)\s*[-.\s]\s*(\d)\s*[-.\s]\s*(\d)\s*[-.\s]\s*(\d)\s*[-.\s]\s*(\d)\s*[-.\s]\s*(\d)\s*[-.\s]\s*(\d)/g;
      while ((match = spacedRe.exec(decoded)) !== null) {
        const p = match.slice(1, 11).join("");
        if (p.length === 10 && !p.startsWith("000") && !p.startsWith("555") && !p.startsWith("123")) {
          phones.push(p);
        }
      }
    }
  }

  // Validate area codes — reject obviously fake ones
  // Valid US area codes: 2xx-9xx (never start with 0 or 1), and some are unassigned
  // For our market, valid area codes are: 208 (ID), 406 (MT), 509 (WA), 360 (WA), 253 (WA), etc.
  const VALID_AREA_CODES = new Set([
    "208", "406", "509", "360", "253", "425", "206",  // ID, MT, WA
    "541", "503", "971",                                // OR (nearby)
    "307",                                              // WY
    "406",                                              // MT
  ]);

  // Format as (XXX) XXX-XXXX for consistency and filter invalid area codes
  return [...new Set(phones)]
    .map((p) => {
      const digits = p.replace(/[^\d]/g, "");
      if (digits.length !== 10) return null;
      const areaCode = digits.slice(0, 3);
      // Reject if area code starts with 0 or 1 (invalid US area codes)
      if (areaCode.startsWith("0") || areaCode.startsWith("1")) return null;
      // Only accept known regional area codes (avoid false positives from deobfuscation)
      if (!VALID_AREA_CODES.has(areaCode)) return null;
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    })
    .filter((p): p is string => p !== null);
}

function extractZipFromText(text: string): string | null {
  ZIP_RE.lastIndex = 0;
  const match = ZIP_RE.exec(text);
  if (!match) return null;
  const zip = match[1];
  if (zip.startsWith("83") || zip.startsWith("99") || zip.startsWith("59") || zip.startsWith("98")) {
    return zip;
  }
  return null;
}

function extractSqft(text: string): number | null {
  const match = SQFT_RE.exec(text);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ""), 10) || null;
}

function extractLotSize(text: string): string | null {
  const match = LOT_RE.exec(text);
  return match ? `${match[1]} acres` : null;
}

function findMotivationKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return MOTIVATION_KEYWORDS.filter((kw) => lower.includes(kw));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

// ── HTTP ────────────────────────────────────────────────────────────

async function fetchPage(url: string, timeoutMs = 12000): Promise<string | null> {
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
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Run promises with max concurrency */
async function parallelLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;
  const next = async (): Promise<void> => {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => next()));
  return results;
}

// ── Search Page Parsers ─────────────────────────────────────────────

interface SearchListing {
  title: string;
  link: string;
  price: number | null;
  city: string;
  state: string;
  bedrooms: number | null;
  bathrooms: number | null;
  lat: number | null;
  lng: number | null;
}

function parseSearchPage(html: string, market: CraigslistMarket): SearchListing[] {
  const listings: SearchListing[] = [];
  const seenLinks = new Set<string>();

  // Parse JSON-LD for structured data (city, state, lat/lng, bed/bath)
  const scriptRe = /<script[^>]*id\s*=\s*"ld_searchpage_results"[^>]*>([\s\S]*?)<\/script>/i;
  const scriptMatch = scriptRe.exec(html);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jsonLdItems: any[] = [];
  if (scriptMatch) {
    try {
      const data = JSON.parse(scriptMatch[1]);
      if (data?.["@type"] === "ItemList" && Array.isArray(data.itemListElement)) {
        jsonLdItems = data.itemListElement.map((el: { item?: unknown }) => el.item).filter(Boolean);
      }
    } catch { /* ignore parse errors */ }
  }

  // Parse listing cards for URLs and prices
  const cardRe = /<li\s+class="cl-static-search-result"[^>]*title="([^"]*)">\s*<a\s+href="([^"]*)"[\s\S]*?<div\s+class="price">([^<]*)<\/div>/gi;
  let cardMatch: RegExpExecArray | null;
  const cards: { title: string; link: string; price: number | null }[] = [];

  while ((cardMatch = cardRe.exec(html)) !== null) {
    const title = stripHtml(cardMatch[1]);
    const link = cardMatch[2].trim();
    const priceStr = cardMatch[3].trim();
    let price: number | null = null;
    if (priceStr && priceStr !== "$0") {
      const parsed = parseFloat(priceStr.replace(/[$,]/g, ""));
      if (!isNaN(parsed) && parsed >= 10000 && parsed <= 10000000) price = parsed;
    }
    if (title && link) cards.push({ title, link, price });
  }

  // Merge JSON-LD + cards by position
  const count = Math.max(jsonLdItems.length, cards.length);
  for (let i = 0; i < count; i++) {
    const jld = jsonLdItems[i];
    const card = cards[i];
    const link = card?.link ?? "";
    if (!link || seenLinks.has(link)) continue;
    seenLinks.add(link);

    const title = card?.title ?? jld?.name ?? "";
    const city = jld?.address?.addressLocality || market.state;
    const state = jld?.address?.addressRegion || market.state;
    const price = card?.price ?? null;

    listings.push({
      title,
      link,
      price,
      city,
      state,
      bedrooms: jld?.numberOfBedrooms ?? null,
      bathrooms: jld?.numberOfBathroomsTotal ?? null,
      lat: jld?.latitude ?? null,
      lng: jld?.longitude ?? null,
    });
  }

  return listings;
}

// ── Detail Page Parser ──────────────────────────────────────────────

interface DetailData {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  lotSize: string | null;
  phone: string | null;
  contactName: string | null;
  description: string;
  postedDate: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  motivationKeywords: string[];
}

function parseDetailPage(html: string): DetailData {
  const result: DetailData = {
    address: null, city: null, state: null, zip: null,
    sqft: null, lotSize: null, phone: null, contactName: null,
    description: "", postedDate: null, bedrooms: null, bathrooms: null,
    motivationKeywords: [],
  };

  // 1. Parse JSON-LD from detail page
  const scriptRe = /<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(scriptMatch[1]);
      if (data?.["@type"] === "House" || data?.["@type"] === "Apartment" || data?.["@type"] === "SingleFamilyResidence") {
        // Address from JSON-LD
        if (data.address?.streetAddress && data.address.streetAddress.length > 3) {
          result.address = data.address.streetAddress;
        }
        if (data.address?.addressLocality) result.city = data.address.addressLocality;
        if (data.address?.addressRegion) result.state = data.address.addressRegion;
        if (data.address?.postalCode) result.zip = data.address.postalCode;

        // Try extracting address from the name/title (e.g., "For Sale: 311 S Third AVE, Sandpoint, ID 83864")
        if (!result.address && data.name) {
          const titleParsed = extractAddressFromTitle(data.name);
          if (titleParsed.address) result.address = titleParsed.address;
          if (titleParsed.city && !result.city) result.city = titleParsed.city;
          if (titleParsed.state && !result.state) result.state = titleParsed.state;
          if (titleParsed.zip && !result.zip) result.zip = titleParsed.zip;
        }

        // Bed/bath
        if (data.numberOfBedrooms) result.bedrooms = parseInt(String(data.numberOfBedrooms), 10) || null;
        if (data.numberOfBathroomsTotal) result.bathrooms = parseFloat(String(data.numberOfBathroomsTotal)) || null;

        break; // Found our LD+JSON
      }
    } catch { /* ignore */ }
  }

  // 2. Extract body text (posting body)
  const bodyRe = /<section\s+id="postingbody"[^>]*>([\s\S]*?)<\/section>/i;
  const bodyMatch = bodyRe.exec(html);
  const bodyHtml = bodyMatch?.[1] ?? "";
  const bodyText = stripHtml(bodyHtml);
  result.description = bodyText.slice(0, 500); // Keep first 500 chars

  // Also get the page title for address extraction fallback
  const titleRe = /<span\s+id="titletextonly"[^>]*>([^<]*)<\/span>/i;
  const titleMatch = titleRe.exec(html);
  const pageTitle = titleMatch?.[1]?.trim() ?? "";

  // Combined text for extraction
  const allText = `${pageTitle} ${bodyText}`;

  // 3. Extract street address from body/title if not from JSON-LD
  if (!result.address) {
    const fromTitle = extractAddressFromTitle(pageTitle);
    if (fromTitle.address) {
      result.address = fromTitle.address;
      if (fromTitle.city && !result.city) result.city = fromTitle.city;
      if (fromTitle.state && !result.state) result.state = fromTitle.state;
      if (fromTitle.zip && !result.zip) result.zip = fromTitle.zip;
    }
  }
  if (!result.address) {
    result.address = extractAddress(allText);
  }

  // 4. Extract ZIP from body if still missing
  if (!result.zip) {
    result.zip = extractZipFromText(allText);
  }

  // 5. Phone number — from body text
  const phones = extractPhones(allText);
  result.phone = phones[0] ?? null;

  // 6. Sqft and lot size
  result.sqft = extractSqft(allText);
  result.lotSize = extractLotSize(allText);

  // 7. Contact name — look for "contact: Name" or "ask for Name" patterns
  // Reject common false positives: FOR, CALL, PLEASE, US, ME, etc.
  const CONTACT_STOPWORDS = new Set([
    "for", "us", "me", "details", "info", "information", "more",
    "today", "now", "here", "asap", "please", "call", "the",
    "this", "that", "price", "sale", "sold", "owner", "seller",
  ]);
  const contactRe = /(?:contact|ask for|call|reach)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi;
  let contactMatch: RegExpExecArray | null;
  let bestContact: string | null = null;
  while ((contactMatch = contactRe.exec(allText)) !== null) {
    const name = contactMatch[1].trim();
    const firstWord = name.split(/\s+/)[0].toLowerCase();
    // Reject if first word is a stopword or name is too short
    if (CONTACT_STOPWORDS.has(firstWord) || name.length < 3) continue;
    // Reject if it looks like a generic phrase
    if (/^(For|Call|Please|The|This|At|On|In|By)\b/i.test(name)) continue;
    bestContact = name;
    break;
  }
  result.contactName = bestContact;

  // 8. Posted date
  const dateRe = /datetime="(\d{4}-\d{2}-\d{2})/;
  const dateMatch = dateRe.exec(html);
  result.postedDate = dateMatch?.[1] ?? null;

  // 9. Motivation keywords from full body
  result.motivationKeywords = findMotivationKeywords(allText);

  return result;
}

// ── Crawl a Single Market ───────────────────────────────────────────

async function crawlMarket(market: CraigslistMarket): Promise<CrawledRecord[]> {
  const records: CrawledRecord[] = [];
  let filteredJunk = 0;
  let filteredArea = 0;
  let detailsFetched = 0;
  let detailsFailed = 0;

  const searchUrl = `https://${market.subdomain}.craigslist.org/search/rea?housing_type=6`;
  console.log(`[CL-FSBO] Pass 1: Fetching search page: ${searchUrl}`);
  const searchHtml = await fetchPage(searchUrl);
  if (!searchHtml) {
    console.warn(`[CL-FSBO] Failed to fetch search page for ${market.name}`);
    return records;
  }

  const listings = parseSearchPage(searchHtml, market);
  console.log(`[CL-FSBO] ${market.name}: Found ${listings.length} listings on search page`);

  // Pre-filter before fetching detail pages (save time/bandwidth)
  const validListings = listings.filter((l) => {
    if (isJunkListing(l.title)) { filteredJunk++; return false; }
    if (isOutOfArea(l.state)) { filteredArea++; return false; }
    return true;
  });
  console.log(`[CL-FSBO] ${validListings.length} valid listings after pre-filter (${filteredJunk} junk, ${filteredArea} out-of-area)`);

  // Pass 2: Fetch each detail page with controlled concurrency
  console.log(`[CL-FSBO] Pass 2: Fetching ${validListings.length} detail pages (concurrency: 5)...`);
  const t0 = Date.now();

  const detailTasks = validListings.map((listing) => async () => {
    const html = await fetchPage(listing.link, 12000);
    if (!html) {
      detailsFailed++;
      return null;
    }
    detailsFetched++;
    const detail = parseDetailPage(html);

    // Post-filter: check body text for junk signals
    if (isJunkListing(listing.title, detail.description)) {
      filteredJunk++;
      return null;
    }

    // Filter out agent-listed properties (have MLS numbers)
    if (hasMLSNumber(listing.title, detail.description)) {
      filteredJunk++;
      console.log(`[CL-FSBO] Filtered MLS listing: ${listing.title.slice(0, 60)}`);
      return null;
    }

    return { listing, detail };
  });

  const detailResults = await parallelLimit(detailTasks, 5);
  console.log(`[CL-FSBO] Pass 2 complete in ${Date.now() - t0}ms: ${detailsFetched} fetched, ${detailsFailed} failed`);

  // Build CrawledRecords from merged search + detail data
  for (const result of detailResults) {
    if (!result) continue;
    const { listing, detail } = result;

    // Best address: detail page > search page title
    const address = detail.address || extractAddress(listing.title);

    // Best city/state/zip: detail page > search page > lookup
    const city = detail.city || listing.city;
    const state = detail.state || listing.state;
    const zip = detail.zip || extractZipFromText(listing.title) || lookupZip(city) || "";

    // Second out-of-area check (detail page may reveal different state)
    if (isOutOfArea(state)) {
      filteredArea++;
      continue;
    }

    const inferredCounty = inferCounty(city, state);
    if (!inferredCounty) {
      filteredArea++;
      console.log(`[CL-FSBO] Rejected unmapped county for ${city}, ${state}: ${listing.title.slice(0, 80)}`);
      continue;
    }
    const bedrooms = detail.bedrooms ?? listing.bedrooms;
    const bathrooms = detail.bathrooms ?? listing.bathrooms;
    const price = listing.price ?? extractPrice(detail.description);
    const motivationKeywords = detail.motivationKeywords.length > 0
      ? detail.motivationKeywords
      : findMotivationKeywords(listing.title);

    // Owner name: use contact name if found, otherwise placeholder
    const ownerName = detail.contactName
      ? detail.contactName
      : address
        ? `FSBO Owner — ${address}`
        : `FSBO Owner — ${city}, ${state}`;

    records.push({
      name: ownerName,
      address,
      city,
      state,
      county: inferredCounty,
      date: detail.postedDate || new Date().toISOString().slice(0, 10),
      link: listing.link,
      source: "craigslist",
      distressType: "fsbo",
      rawData: {
        listing_url: listing.link,
        listing_title: listing.title,
        price,
        bedrooms,
        bathrooms,
        sqft: detail.sqft,
        lot_size: detail.lotSize,
        contact_phone: detail.phone,
        contact_name: detail.contactName,
        description_snippet: detail.description.slice(0, 300),
        geo_lat: listing.lat ?? null,
        geo_long: listing.lng ?? null,
        motivation_keywords: motivationKeywords,
        market_id: market.id,
        market_county: market.county,
        platform: "craigslist",
        city,
        state,
        zip,
        inferred_county: inferredCounty,
        posted_date: detail.postedDate,
      },
    });
  }

  console.log(`[CL-FSBO] ${market.name}: ${records.length} records built (filtered total: ${filteredJunk} junk, ${filteredArea} out-of-area)`);
  return records;
}

// ── Exported Crawler Module ─────────────────────────────────────────

export const craigslistFsboCrawler: CrawlerModule = {
  id: "craigslist_fsbo",
  name: "Craigslist FSBO Crawler (Spokane/Kootenai)",
  promotionThreshold: 0,
  shouldEnrichInline: true,
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
