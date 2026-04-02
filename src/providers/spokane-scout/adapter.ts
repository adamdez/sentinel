/**
 * Spokane Scout Summary scraper
 *
 * Pulls the public Spokane County SCOUT property summary page directly by APN.
 * This is intentionally separate from Firecrawl because:
 * - the tax balance lives in the HTML summary page
 * - SCOUT photos are embedded directly in the page
 * - Firecrawl credits can be exhausted even when the public site is healthy
 *
 * The scraper returns a normalized summary plus embedded photo data URIs.
 * Callers should avoid persisting the raw photo payload in the database.
 */

export interface SpokaneScoutSummary {
  apn: string;
  sourceUrl: string;
  fetchedAt: string;
  ownerName: string | null;
  taxpayerName: string | null;
  siteAddress: string | null;
  assessedTaxYear: number | null;
  assessedValue: number | null;
  landValue: number | null;
  improvementValue: number | null;
  totalChargesOwing: number | null;
  currentTaxYear: number | null;
  currentAnnualTaxes: number | null;
  currentRemainingChargesOwing: number | null;
  yearBuilt: number | null;
  grossLivingAreaSqft: number | null;
  bedrooms: number | null;
  halfBaths: number | null;
  fullBaths: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  photoCount: number;
  photoDataUris: string[];
  rawExcerpt: string;
}

const SPOKANE_SCOUT_SUMMARY_URL =
  "https://cp.spokanecounty.org/scout/propertyinformation/Summary.aspx";

function stripTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value: string | undefined): number | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9.-]/g, "");
  if (!digits) return null;
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9-]/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseUsDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[1]?.trim() ?? null;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeScoutHtmlForStorage(html: string): string {
  return html.replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g, "[embedded-image]");
}

export function parseSpokaneScoutSummary(apn: string, html: string): SpokaneScoutSummary | null {
  const normalizedApn = apn.trim();
  const text = stripTags(html);
  if (!text.includes(normalizedApn) || !text.includes("Property Taxes")) {
    return null;
  }

  const ownerName = firstMatch(text, /Owner Name:\s*(.+?)\s+Address:/i);
  const taxpayerName = firstMatch(text, /Taxpayer Name:\s*(.+?)\s+Address:/i);
  const siteAddress = firstMatch(text, /Site Address:\s*([A-Z0-9 .#'-]+?)(?:\s+SCOUT Map|\s+Printer Friendly|\s+Collapse All)/i);

  const assessedRow = text.match(/\b(20\d{2})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+0\s+0\b/);
  const taxesRow = text.match(/Total Taxes for (20\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i);
  const dwellingRow = text.match(/Dwelling\s+(\d{4})\s+([\d,]+)\s+NA\s+SF.*?\s+(\d+)\s+(\d+)\s+(\d+)\b/i);
  const saleRow = text.match(
    new RegExp(
      `\\b(\\d{2}\\/\\d{2}\\/\\d{4})\\s+([\\d,]+\\.\\d{2})\\s+.+?\\s+\\d+\\s+${escapeForRegex(normalizedApn)}`,
      "i",
    ),
  );
  const totalChargesOwing = parseMoney(firstMatch(text, /Total Charges Owing:\s*\$?([\d,]+\.\d{2})/i) ?? undefined);

  const photoDataUris = [...html.matchAll(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g)].map((match) => match[0]);
  const rawExcerpt = sanitizeScoutHtmlForStorage(html).slice(0, 10000);

  return {
    apn: normalizedApn,
    sourceUrl: `${SPOKANE_SCOUT_SUMMARY_URL}?PID=${encodeURIComponent(normalizedApn)}`,
    fetchedAt: new Date().toISOString(),
    ownerName,
    taxpayerName,
    siteAddress,
    assessedTaxYear: parseInteger(assessedRow?.[1]),
    assessedValue: parseMoney(assessedRow?.[2]),
    landValue: parseMoney(assessedRow?.[4]),
    improvementValue: parseMoney(assessedRow?.[5]),
    totalChargesOwing,
    currentTaxYear: parseInteger(taxesRow?.[1]),
    currentAnnualTaxes: parseMoney(taxesRow?.[2]),
    currentRemainingChargesOwing: parseMoney(taxesRow?.[3]),
    yearBuilt: parseInteger(dwellingRow?.[1]),
    grossLivingAreaSqft: parseInteger(dwellingRow?.[2]),
    bedrooms: parseInteger(dwellingRow?.[3]),
    halfBaths: parseInteger(dwellingRow?.[4]),
    fullBaths: parseInteger(dwellingRow?.[5]),
    lastSaleDate: parseUsDate(saleRow?.[1]),
    lastSalePrice: parseMoney(saleRow?.[2]),
    photoCount: photoDataUris.length,
    photoDataUris,
    rawExcerpt,
  };
}

export async function fetchSpokaneScoutSummary(apn: string): Promise<SpokaneScoutSummary | null> {
  const normalizedApn = apn.trim();
  if (!normalizedApn) return null;

  const url = `${SPOKANE_SCOUT_SUMMARY_URL}?PID=${encodeURIComponent(normalizedApn)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 Sentinel/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Spokane SCOUT HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseSpokaneScoutSummary(normalizedApn, html);
}

export function decodeScoutPhotoDataUri(dataUri: string): { mimeType: string; bytes: Buffer } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}
