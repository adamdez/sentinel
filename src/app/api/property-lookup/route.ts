import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/property-lookup
 *
 * Nationwide property lookup via PropertyRadar.
 * Input: { address: string }
 * Returns property details: owner, address, value, equity, specs, distress flags, lat/lng.
 */

const PR_API_BASE = "https://api.propertyradar.com/v1/properties";

// ── Address Parser ─────────────────────────────────────────────────────

interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

const US_STATES: Record<string, string> = {
  AL: "AL", AK: "AK", AZ: "AZ", AR: "AR", CA: "CA", CO: "CO", CT: "CT",
  DE: "DE", DC: "DC", FL: "FL", GA: "GA", HI: "HI", ID: "ID", IL: "IL",
  IN: "IN", IA: "IA", KS: "KS", KY: "KY", LA: "LA", ME: "ME", MD: "MD",
  MA: "MA", MI: "MI", MN: "MN", MS: "MS", MO: "MO", MT: "MT", NE: "NE",
  NV: "NV", NH: "NH", NJ: "NJ", NM: "NM", NY: "NY", NC: "NC", ND: "ND",
  OH: "OH", OK: "OK", OR: "OR", PA: "PA", RI: "RI", SC: "SC", SD: "SD",
  TN: "TN", TX: "TX", UT: "UT", VT: "VT", VA: "VA", WA: "WA", WV: "WV",
  WI: "WI", WY: "WY",
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA",
  HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA",
  KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD",
  MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS",
  MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK",
  OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
  VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI",
  WYOMING: "WY",
};

function parseAddress(raw: string): ParsedAddress {
  const result: ParsedAddress = { street: "", city: "", state: "", zip: "" };

  const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  if (zipMatch) {
    result.zip = zipMatch[1];
    raw = raw.slice(0, zipMatch.index).trim();
  }

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 2) {
    result.street = parts[0];
    const rest = parts.slice(1).join(" ").trim();

    const stateMatch = rest.match(/\b([A-Z]{2})\s*$/i) || rest.match(/\b(\w[\w\s]*?)\s*$/i);
    if (stateMatch) {
      const candidate = stateMatch[1].toUpperCase();
      if (US_STATES[candidate]) {
        result.state = US_STATES[candidate];
        const beforeState = rest.slice(0, stateMatch.index).trim();
        result.city = beforeState || "";
      } else {
        result.city = rest;
      }
    } else {
      result.city = rest;
    }
  } else {
    const stateMatch = raw.match(/\b([A-Z]{2})\s*$/i);
    if (stateMatch && US_STATES[stateMatch[1].toUpperCase()]) {
      result.state = US_STATES[stateMatch[1].toUpperCase()];
      result.street = raw.slice(0, stateMatch.index).trim();
    } else {
      result.street = raw;
    }
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────

function isTruthy(val: unknown): boolean {
  return val === true || val === 1 || val === "1" || val === "Yes" || val === "True" || val === "true";
}

function toNumber(val: unknown): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function toInt(val: unknown): number | null {
  if (val == null) return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

// ── Distress detection (lightweight version for preview) ───────────────

interface DetectedSignal {
  type: string;
  label: string;
  severity: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectSignalsForPreview(pr: any): DetectedSignal[] {
  const signals: DetectedSignal[] = [];

  if (isTruthy(pr.isPreforeclosure))       signals.push({ type: "pre_foreclosure", label: "Pre-Foreclosure", severity: 9 });
  if (isTruthy(pr.inForeclosure))           signals.push({ type: "foreclosure", label: "Foreclosure", severity: 10 });
  if (isTruthy(pr.isDeceasedProperty))      signals.push({ type: "probate", label: "Probate / Deceased", severity: 8 });
  if (isTruthy(pr.inTaxDelinquency))        signals.push({ type: "tax_lien", label: "Tax Delinquent", severity: 7 });
  if (isTruthy(pr.inBankruptcyProperty))    signals.push({ type: "bankruptcy", label: "Bankruptcy", severity: 8 });
  if (isTruthy(pr.inDivorce))               signals.push({ type: "divorce", label: "Divorce", severity: 6 });
  if (isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant))
                                            signals.push({ type: "vacant", label: "Vacant", severity: 5 });
  if (isTruthy(pr.isNotSameMailingOrExempt)) signals.push({ type: "absentee", label: "Absentee Owner", severity: 5 });
  if (isTruthy(pr.isUnderwater))            signals.push({ type: "underwater", label: "Underwater", severity: 8 });
  if (isTruthy(pr.isListedForSale))         signals.push({ type: "listed", label: "Active MLS Listing", severity: 0 });

  return signals;
}

// ── POST handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address } = body;

    if (!address || typeof address !== "string" || address.trim().length < 5) {
      return NextResponse.json({ error: "A valid address is required" }, { status: 400 });
    }

    const apiKey = process.env.PROPERTYRADAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "PropertyRadar not configured" }, { status: 503 });
    }

    // ── Parse address into components ────────────────────────────────
    const parsed = parseAddress(address.trim());

    const criteria: { name: string; value: (string | number)[] }[] = [];
    if (parsed.street) criteria.push({ name: "Address", value: [parsed.street] });
    if (parsed.city) criteria.push({ name: "City", value: [parsed.city] });
    if (parsed.state) criteria.push({ name: "State", value: [parsed.state] });
    if (parsed.zip) criteria.push({ name: "ZipFive", value: [parsed.zip] });

    if (criteria.length === 0) {
      return NextResponse.json({ error: "Could not parse address" }, { status: 400 });
    }

    // ── Call PropertyRadar ───────────────────────────────────────────
    const prUrl = `${PR_API_BASE}?Purchase=1&Limit=1&Fields=All`;
    const prResponse = await fetch(prUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Criteria: criteria }),
    });

    if (!prResponse.ok) {
      console.error("[property-lookup] PR API error:", prResponse.status);
      return NextResponse.json(
        { error: "PropertyRadar lookup failed", status: prResponse.status },
        { status: 502 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prData: any = await prResponse.json();
    const pr = prData.results?.[0];

    if (!pr) {
      return NextResponse.json({ error: "No property found at that address" }, { status: 404 });
    }

    // ── Build response ───────────────────────────────────────────────
    const signals = detectSignalsForPreview(pr);
    const isListed = signals.some((s) => s.type === "listed");
    const distressSignals = signals.filter((s) => s.type !== "listed");

    const property = {
      // Identity
      radarId: pr.RadarID,
      apn: pr.APN ?? "",
      county: pr.County ?? "",

      // Address
      address: pr.Address ?? pr.FullAddress ?? "",
      city: pr.City ?? "",
      state: pr.State ?? "",
      zip: pr.ZipFive ?? "",
      fullAddress: [pr.Address ?? pr.FullAddress, pr.City, pr.State, pr.ZipFive].filter(Boolean).join(", "),

      // Location
      latitude: toNumber(pr.Latitude) ?? null,
      longitude: toNumber(pr.Longitude) ?? null,

      // Owner
      ownerName: pr.Owner ?? pr.Taxpayer ?? "Unknown Owner",
      ownerPhone: pr.Phone1 ?? pr.Phone2 ?? null,
      ownerEmail: pr.Email ?? null,
      ownerAge: toInt(pr.OwnerAge),
      mailAddress: pr.MailAddress ?? null,
      mailCity: pr.MailCity ?? null,
      mailState: pr.MailState ?? null,

      // Property specs
      propertyType: pr.PType ?? pr.AdvancedPropertyType ?? "SFR",
      bedrooms: toInt(pr.Beds),
      bathrooms: toNumber(pr.Baths) ?? null,
      sqft: toInt(pr.SqFt),
      yearBuilt: toInt(pr.YearBuilt),
      lotSize: toInt(pr.LotSize),
      units: toInt(pr.Units),

      // Financials
      estimatedValue: toInt(pr.AVM),
      equityPercent: toNumber(pr.EquityPercent) ?? null,
      availableEquity: toInt(pr.AvailableEquity),
      loanBalance: toInt(pr.LoanBalance) ?? toInt(pr.OpenMortgageBalance),
      isUnderwater: isTruthy(pr.isUnderwater),
      isFreeAndClear: isTruthy(pr.isFreeAndClear),

      // Ownership
      saleDate: pr.SaleDate ?? null,
      salePrice: toInt(pr.SalePrice),
      lastTransferType: pr.LastTransferType ?? null,

      // Flags
      isAbsentee: isTruthy(pr.isNotSameMailingOrExempt),
      isVacant: isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant),
      isListed,
      isOutOfState: pr.MailState && pr.State ? pr.MailState !== pr.State : false,

      // Distress signals
      signals: distressSignals,

      // Raw PR data for claim
      prRaw: pr,
    };

    return NextResponse.json({ success: true, property });
  } catch (err) {
    console.error("[property-lookup] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
