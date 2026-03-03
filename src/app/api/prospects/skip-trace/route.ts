import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import type { DistressType } from "@/lib/types";
import { distressFingerprint, normalizeCounty as globalNormalizeCounty } from "@/lib/dedup";
import { dualSkipTrace, skipTraceResultToOwnerFlags } from "@/lib/skip-trace";

const PR_API_BASE = "https://api.propertyradar.com/v1/properties";

const US_STATES: Record<string, string> = {
  AL: "AL", AK: "AK", AZ: "AZ", AR: "AR", CA: "CA", CO: "CO", CT: "CT",
  DE: "DE", FL: "FL", GA: "GA", HI: "HI", ID: "ID", IL: "IL", IN: "IN",
  IA: "IA", KS: "KS", KY: "KY", LA: "LA", ME: "ME", MD: "MD", MA: "MA",
  MI: "MI", MN: "MN", MS: "MS", MO: "MO", MT: "MT", NE: "NE", NV: "NV",
  NH: "NH", NJ: "NJ", NM: "NM", NY: "NY", NC: "NC", ND: "ND", OH: "OH",
  OK: "OK", OR: "OR", PA: "PA", RI: "RI", SC: "SC", SD: "SD", TN: "TN",
  TX: "TX", UT: "UT", VT: "VT", VA: "VA", WA: "WA", WV: "WV", WI: "WI",
  WY: "WY",
};

// ── ZIP-to-City lookup for Spokane / Kootenai market area ────────────
const ZIP_TO_CITY: Record<string, string> = {
  "99201": "Spokane", "99202": "Spokane", "99203": "Spokane", "99204": "Spokane",
  "99205": "Spokane", "99206": "Spokane", "99207": "Spokane", "99208": "Spokane",
  "99209": "Spokane", "99210": "Spokane", "99211": "Spokane", "99212": "Spokane",
  "99213": "Spokane", "99214": "Spokane", "99216": "Spokane", "99217": "Spokane",
  "99218": "Spokane", "99219": "Spokane", "99220": "Spokane", "99223": "Spokane",
  "99224": "Spokane", "99228": "Spokane",
  "99001": "Airway Heights", "99003": "Chattaroy", "99004": "Cheney",
  "99005": "Colbert", "99006": "Deer Park", "99009": "Elk",
  "99011": "Fairchild AFB", "99012": "Fairfield", "99016": "Greenacres",
  "99018": "Latah", "99019": "Liberty Lake", "99020": "Marshall",
  "99021": "Mead", "99022": "Medical Lake", "99023": "Mica",
  "99025": "Newman Lake", "99026": "Nine Mile Falls", "99027": "Otis Orchards",
  "99029": "Reardan", "99030": "Rockford", "99031": "Spangle",
  "99036": "Valleyford", "99037": "Veradale", "99039": "Waverly",
  "99170": "Sprague",
  "99215": "Spokane Valley", "99016b": "Spokane Valley",
  "83814": "Coeur d'Alene", "83815": "Coeur d'Alene", "83816": "Coeur d'Alene",
  "83854": "Post Falls", "83858": "Rathdrum", "83835": "Hayden",
  "83836": "Hayden Lake", "83869": "Spirit Lake", "83864": "Sandpoint",
  "83876": "Worley", "83801": "Athol",
};

/**
 * POST /api/prospects/skip-trace
 *
 * Pulls owner contact info from PropertyRadar Persons endpoint.
 * Requires the property to have been enriched first (needs radar_id).
 *
 * Body: { property_id: string, lead_id: string, manual?: boolean }
 *
 * If no radar_id, falls back to multi-tier enrichment:
 *   Tier 1: Full address + city + state + zip
 *   Tier 2: Street + ZIP + state only
 *   Tier 3: APN lookup
 *   Tier 4: Manual mode (force partial data, requires manual=true)
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { property_id, lead_id, manual = false } = body;

    if (!property_id) {
      return NextResponse.json({ error: "property_id is required" }, { status: 400 });
    }

    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propErr } = await (sb.from("properties") as any)
      .select("*")
      .eq("id", property_id)
      .single();

    const tFetch = Date.now();
    console.log(`[SkipTrace Perf] Property fetch: ${tFetch - t0}ms`);

    if (propErr || !property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    let radarId = property.owner_flags?.radar_id as string | undefined;

    if (!radarId) {
      console.log("[SkipTrace] No radar_id — auto-enriching via multi-tier fallback");
      const tEnrichStart = Date.now();
      const enrichResult = await enrichProperty(sb, apiKey, property, lead_id, manual);
      console.log(`[SkipTrace Perf] Enrichment: ${Date.now() - tEnrichStart}ms`);
      if (!enrichResult.success) {
        console.error("[SkipTrace] Enrichment failed:", enrichResult.error, "| tier:", enrichResult.tier);
        return NextResponse.json({
          error: "Enrichment failed",
          reason: enrichResult.reason ?? enrichResult.error ?? "PropertyRadar enrichment failed",
          suggestion: enrichResult.suggestion ?? "Try Manual Skip Trace or correct the address fields",
          tier_reached: enrichResult.tier ?? "unknown",
          address_issues: enrichResult.addressIssues ?? [],
          enriched: false,
        }, { status: 422 });
      }
      radarId = enrichResult.radar_id;
      console.log("[SkipTrace] Enrichment complete via tier", enrichResult.tier, "— RadarID:", radarId);
    }

    if (!radarId) {
      return NextResponse.json({
        error: "Enrichment failed",
        reason: "No matching property found in PropertyRadar after all lookup tiers",
        suggestion: "Verify the address is correct or try Manual Skip Trace with corrected city/ZIP",
        enriched: false,
      }, { status: 422 });
    }

    // ── Dual-source skip-trace (PR Persons + BatchData in parallel) ──
    console.log("[SkipTrace] Running dual skip-trace for RadarID:", radarId);
    const tSkipStart = Date.now();

    // Re-read property for latest data (may have been updated by enrichment)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: freshProp } = await (sb.from("properties") as any)
      .select("*").eq("id", property_id).single();
    const propForSkip = freshProp ?? property;

    // Extract mailing address from owner_flags (PR Persons or pr_raw data)
    const existingFlags = (propForSkip.owner_flags ?? {}) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persons = (existingFlags.persons ?? []) as any[];
    const primaryPerson = persons.find((p: { is_primary?: boolean }) => p.is_primary) ?? persons[0];
    const rawMailAddr = primaryPerson?.mailing_address as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prRaw = existingFlags.pr_raw as Record<string, any> | undefined;

    // Parse mailing address — could be "PO BOX 9815, SPOKANE, WA 99209" or structured
    let mailingAddress: string | undefined;
    let mailingCity: string | undefined;
    let mailingState: string | undefined;
    let mailingZip: string | undefined;

    if (prRaw?.MailAddress) {
      mailingAddress = prRaw.MailAddress;
      mailingCity = prRaw.MailCity;
      mailingState = prRaw.MailState;
      mailingZip = prRaw.MailZip;
    } else if (rawMailAddr) {
      const mailParts = rawMailAddr.split(",").map((s: string) => s.trim());
      mailingAddress = mailParts[0];
      mailingCity = mailParts[1];
      // "WA 99209" → state=WA, zip=99209
      const stateZip = mailParts[2]?.match(/([A-Z]{2})\s*(\d{5})?/);
      mailingState = stateZip?.[1];
      mailingZip = stateZip?.[2];
    }

    const skipResult = await dualSkipTrace(
      {
        id: property_id,
        address: propForSkip.address,
        city: propForSkip.city,
        state: propForSkip.state,
        zip: propForSkip.zip,
        owner_name: propForSkip.owner_name,
        mailingAddress,
        mailingCity,
        mailingState,
        mailingZip,
      },
      radarId,
    );

    console.log(`[SkipTrace Perf] Dual skip-trace: ${Date.now() - tSkipStart}ms`);

    // Persist results to property record (reuse existingFlags from above)
    const skipFlags = skipTraceResultToOwnerFlags(skipResult);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propUpdate: Record<string, any> = {
      owner_flags: { ...existingFlags, ...skipFlags },
      updated_at: new Date().toISOString(),
    };
    if (skipResult.primaryPhone) propUpdate.owner_phone = skipResult.primaryPhone;
    if (skipResult.primaryEmail) propUpdate.owner_email = skipResult.primaryEmail;

    // Property update + audit log in parallel
    const writes: Promise<unknown>[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.from("properties") as any).update(propUpdate).eq("id", property_id),
    ];

    if (lead_id) {
      writes.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("event_log") as any).insert({
          entity_type: "lead",
          entity_id: lead_id,
          action: "SKIP_TRACED",
          details: {
            radar_id: radarId,
            providers: skipResult.providers,
            phones_found: skipResult.totalPhoneCount,
            emails_found: skipResult.totalEmailCount,
            persons_found: skipResult.persons.length,
            is_litigator: skipResult.isLitigator,
            has_dnc: skipResult.hasDncNumbers,
          },
        })
      );
    }

    const tWriteStart = Date.now();
    await Promise.all(writes);
    console.log(`[SkipTrace Perf] DB writes: ${Date.now() - tWriteStart}ms`);
    console.log(`[SkipTrace Perf] TOTAL: ${Date.now() - t0}ms`);

    // Map unified format back to the shape the UI expects
    const phones = skipResult.phones.map((p) => p.number);
    const emails = skipResult.emails.map((e) => e.email);

    return NextResponse.json({
      success: true,
      property_id,
      radar_id: radarId,
      phones,
      emails,
      persons: skipResult.persons.map((p) => ({
        name: p.name,
        relation: p.role,
        age: p.age,
        phones: p.phones,
        emails: p.emails,
        mailing_address: p.mailingAddress,
        occupation: p.occupation,
        is_primary: p.isPrimary,
        source: p.source,
      })),
      primary_phone: skipResult.primaryPhone,
      primary_email: skipResult.primaryEmail,
      providers: skipResult.providers,
      is_litigator: skipResult.isLitigator,
      has_dnc_numbers: skipResult.hasDncNumbers,
      phone_details: skipResult.phones,
      email_details: skipResult.emails,
    });
  } catch (err) {
    console.error("[SkipTrace] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── Smart address helpers ────────────────────────────────────────────

function isUnknownCity(city: string | null | undefined): boolean {
  if (!city) return true;
  const c = city.trim().toLowerCase();
  return c === "" || c === "unknown" || c === "n/a" || c === "none" || c === "null";
}

function resolveCity(city: string | null | undefined, zip: string | null | undefined): { city: string; source: "original" | "zip_lookup" | "none" } {
  if (!isUnknownCity(city)) return { city: city!.trim(), source: "original" };
  const z5 = (zip ?? "").replace(/\D/g, "").slice(0, 5);
  if (z5 && ZIP_TO_CITY[z5]) return { city: ZIP_TO_CITY[z5], source: "zip_lookup" };
  return { city: "", source: "none" };
}

interface EnrichResult {
  success: boolean;
  radar_id?: string;
  error?: string;
  reason?: string;
  suggestion?: string;
  tier?: string;
  addressIssues?: string[];
}

// ── PropertyRadar single-tier query helper ──────────────────────────

async function prLookup(
  apiKey: string,
  criteria: { name: string; value: string[] }[],
  tierLabel: string,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ hit: any | null; error?: string }> {
  if (criteria.length < 1) return { hit: null, error: "No criteria for " + tierLabel };

  const prUrl = `${PR_API_BASE}?Purchase=1&Limit=1&Fields=All`;
  console.log(`[Enrich/${tierLabel}] Criteria:`, JSON.stringify(criteria));

  const prRes = await fetch(prUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ Criteria: criteria }),
  });

  if (!prRes.ok) {
    const errText = await prRes.text().catch(() => "");
    console.error(`[Enrich/${tierLabel}] HTTP ${prRes.status}`, errText.slice(0, 300));
    return { hit: null, error: `PropertyRadar HTTP ${prRes.status}` };
  }

  const prData = await prRes.json();
  const result = prData.results?.[0] ?? null;
  console.log(`[Enrich/${tierLabel}] ${result ? "HIT — RadarID " + result.RadarID : "MISS"}`);
  return { hit: result };
}

// ── Auto-enrich from PropertyRadar (multi-tier fallback) ─────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichProperty(sb: any, apiKey: string, property: any, leadId?: string, manual = false): Promise<EnrichResult> {
  const address = property.address ?? "";
  if (!address && !property.apn) {
    return { success: false, error: "No address on property", reason: "Property has no address or APN", suggestion: "Add an address or APN before skip-tracing", tier: "none" };
  }

  const parsed = parseAddress(address);
  const street = parsed.street || address.split(",")[0]?.trim() || "";
  const rawCity = property.city || parsed.city || "";
  const state = property.state || parsed.state || "";
  const zip = property.zip || parsed.zip || "";
  const apn = property.apn || "";

  const cityResolution = resolveCity(rawCity, zip);
  const city = cityResolution.city;

  const addressIssues: string[] = [];
  if (isUnknownCity(rawCity)) {
    if (cityResolution.source === "zip_lookup") {
      addressIssues.push(`City was "${rawCity || "empty"}" — auto-resolved to "${city}" from ZIP ${zip}`);
      console.log(`[Enrich] Smart city fix: "${rawCity}" → "${city}" via ZIP ${zip}`);
    } else {
      addressIssues.push(`City is "${rawCity || "empty"}" and could not be resolved from ZIP "${zip}"`);
    }
  }

  console.log("[Enrich] Property record:", { id: property.id, address, city: rawCity, resolvedCity: city, state, zip, apn, manual });

  const cleanState = state.replace(/[^A-Z]/gi, "").slice(0, 2).toUpperCase();
  const cleanZip = zip.replace(/\D/g, "").slice(0, 5);
  const cleanCity = city.replace(/\s+(WA|OR|CA|AZ|ID|TX|FL|NY)\s*$/i, "").trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pr: any = null;
  let winningTier = "none";

  // ─── Tier 1: Full address + city + state + zip ───
  if (street && cleanCity && cleanState && cleanZip) {
    const tier1: { name: string; value: string[] }[] = [
      { name: "Address", value: [street] },
      { name: "City", value: [cleanCity] },
      { name: "State", value: [cleanState] },
      { name: "ZipFive", value: [cleanZip] },
    ];
    const r1 = await prLookup(apiKey, tier1, "Tier1-FullAddr");
    if (r1.hit) { pr = r1.hit; winningTier = "tier1_full_address"; }
  }

  // ─── Tier 2: Street + ZIP + state only (no city) ───
  if (!pr && street && cleanZip && cleanState) {
    const tier2: { name: string; value: string[] }[] = [
      { name: "Address", value: [street] },
      { name: "ZipFive", value: [cleanZip] },
      { name: "State", value: [cleanState] },
    ];
    const r2 = await prLookup(apiKey, tier2, "Tier2-StreetZip");
    if (r2.hit) { pr = r2.hit; winningTier = "tier2_street_zip"; }
  }

  // ─── Tier 3: APN lookup ───
  if (!pr && apn) {
    const tier3: { name: string; value: string[] }[] = [
      { name: "APN", value: [apn] },
    ];
    if (cleanState) tier3.push({ name: "State", value: [cleanState] });
    const r3 = await prLookup(apiKey, tier3, "Tier3-APN");
    if (r3.hit) { pr = r3.hit; winningTier = "tier3_apn"; }
  }

  // ─── Tier 4: Manual mode — force with whatever partial data we have ───
  if (!pr && manual) {
    const tier4: { name: string; value: string[] }[] = [];
    if (street) tier4.push({ name: "Address", value: [street] });
    if (cleanCity) tier4.push({ name: "City", value: [cleanCity] });
    if (cleanState) tier4.push({ name: "State", value: [cleanState] });
    if (cleanZip) tier4.push({ name: "ZipFive", value: [cleanZip] });
    if (tier4.length >= 1) {
      const r4 = await prLookup(apiKey, tier4, "Tier4-Manual");
      if (r4.hit) { pr = r4.hit; winningTier = "tier4_manual"; }
    }
  }

  if (!pr) {
    const missingParts: string[] = [];
    if (!street) missingParts.push("street address");
    if (isUnknownCity(rawCity) && cityResolution.source === "none") missingParts.push("city");
    if (!cleanState) missingParts.push("state");
    if (!cleanZip) missingParts.push("ZIP code");

    const reason = missingParts.length > 0
      ? `Missing or invalid: ${missingParts.join(", ")}. City was "${rawCity || "empty"}".`
      : `No matching property found in PropertyRadar for "${street}, ${rawCity || city}, ${cleanState} ${cleanZip}"`;

    const suggestion = isUnknownCity(rawCity) && !cleanZip
      ? "Add a valid ZIP code or correct city name, then retry"
      : isUnknownCity(rawCity)
        ? `City is "${rawCity || "empty"}" — enter the correct city name or use Manual Skip Trace`
        : !manual
          ? "Try Manual Skip Trace to force a partial-data lookup"
          : "Verify the property address is correct in the source system";

    return {
      success: false,
      error: "PropertyRadar lookup failed across all tiers",
      reason,
      suggestion,
      tier: manual ? "tier4_manual" : apn ? "tier3_apn" : "tier2_street_zip",
      addressIssues,
    };
  }

  console.log(`[Enrich] Winner: ${winningTier} — RadarID ${pr.RadarID}, APN ${pr.APN}`);

  console.log("[Enrich] Found:", pr.RadarID, pr.APN, pr.Owner);

  const isTruthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "Yes" || v === "True" || v === "true";
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, ""));
    return isNaN(n) ? null : n;
  };
  const toInt = (v: unknown) => { const n = toNum(v); return n != null ? Math.round(n) : null; };

  // Build owner flags
  const ownerFlags: Record<string, unknown> = {
    source: "propertyradar",
    radar_id: pr.RadarID,
    pr_raw: pr,
    last_enriched: new Date().toISOString(),
  };
  if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
  if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
  if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
  if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
  if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

  // Extract phone/email from PR county records
  const countyPhone = pr.Phone1 ?? pr.Phone2 ?? null;
  const countyEmail = pr.Email ?? null;

  // Update property
  const update: Record<string, unknown> = {
    owner_name: pr.Owner ?? pr.Taxpayer ?? property.owner_name,
    owner_phone: countyPhone ?? property.owner_phone ?? null,
    owner_email: countyEmail ?? property.owner_email ?? null,
    estimated_value: toInt(pr.AVM),
    equity_percent: toNum(pr.EquityPercent),
    bedrooms: toInt(pr.Beds),
    bathrooms: toNum(pr.Baths),
    sqft: toInt(pr.SqFt),
    year_built: toInt(pr.YearBuilt),
    lot_size: toInt(pr.LotSize),
    property_type: pr.PType ?? null,
    owner_flags: ownerFlags,
    updated_at: new Date().toISOString(),
  };

  if (pr.APN) update.apn = pr.APN;
  if (pr.City) update.city = pr.City;
  if (pr.State) update.state = pr.State;
  if (pr.ZipFive) update.zip = pr.ZipFive;
  if (pr.County) {
    update.county = globalNormalizeCounty(pr.County);
  }
  if (pr.Address) {
    update.address = [pr.Address, pr.City, pr.State, pr.ZipFive].filter(Boolean).join(", ");
  }

  // Detect distress signals + compute score in parallel with property update
  const signals = detectDistressSignals(pr, isTruthy, toNum);

  const equityPct = toNum(pr.EquityPercent) ?? 50;
  const avm = toNum(pr.AVM) ?? 0;
  const loanBal = toNum(pr.TotalLoanBalance) ?? 0;
  const compRatio = avm > 0 && loanBal > 0 ? Math.min(avm / loanBal, 3.0) : 1.1;

  const scoringInput: ScoringInput = {
    signals: signals.map((s) => ({ type: s.type, severity: s.severity, daysSinceEvent: s.days })),
    ownerFlags: {
      absentee: ownerFlags.absentee === true,
      corporate: false,
      inherited: isTruthy(pr.isDeceasedProperty),
      elderly: false,
      outOfState: ownerFlags.absentee === true,
    },
    equityPercent: equityPct,
    compRatio,
    historicalConversionRate: 0.5,
  };

  const score = computeScore(scoringInput);

  // All DB writes are independent — fire them all in parallel
  const enrichWrites: Promise<unknown>[] = [
    sb.from("properties").update(update).eq("id", property.id),

    sb.from("scoring_records").insert({
      property_id: property.id,
      model_version: SCORING_MODEL_VERSION,
      composite_score: score.composite,
      motivation_score: score.motivationScore,
      deal_score: score.dealScore,
      severity_multiplier: score.severityMultiplier,
      recency_decay: score.recencyDecay,
      stacking_bonus: score.stackingBonus,
      owner_factor_score: score.ownerFactorScore,
      equity_factor_score: score.equityFactorScore,
      ai_boost: score.aiBoost,
      factors: score.factors,
    }),

    ...signals.map((signal) => {
      const apn = pr.APN ?? property.apn ?? property.id;
      const county = globalNormalizeCounty(pr.County ?? property.county ?? "", "Unknown");
      const fp = distressFingerprint(apn, county, signal.type, "propertyradar");
      return sb.from("distress_events").insert({
        property_id: property.id,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint: fp,
        raw_data: { detected_from: signal.from, radar_id: pr.RadarID },
        confidence: signal.severity >= 7 ? "0.900" : "0.600",
      }).then(({ error: e }: { error: { code?: string } | null }) => {
        if (e && e.code !== "23505") console.error("[Enrich] Event insert err:", e);
      });
    }),
  ];

  if (leadId) {
    enrichWrites.push(
      sb.from("leads").update({
        priority: score.composite,
        tags: signals.map((s) => s.type),
        notes: `PropertyRadar enriched via Skip Trace. Score: ${score.composite} (${score.label}). RadarID: ${pr.RadarID}`,
        updated_at: new Date().toISOString(),
      }).eq("id", leadId),

      sb.from("event_log").insert({
        entity_type: "lead",
        entity_id: leadId,
        action: "ENRICHED",
        details: { source: "propertyradar", radar_id: pr.RadarID, score: score.composite },
      }),
    );
  }

  await Promise.all(enrichWrites);

  return { success: true, radar_id: pr.RadarID as string, tier: winningTier, addressIssues };
}

// ── Address parser ──────────────────────────────────────────────────────

function parseAddress(raw: string) {
  const result = { street: "", city: "", state: "", zip: "" };
  const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  if (zipMatch) { result.zip = zipMatch[1]; raw = raw.slice(0, zipMatch.index).trim(); }

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    result.street = parts[0];
    const rest = parts.slice(1).join(" ").trim();
    const sm = rest.match(/\b([A-Z]{2})\s*$/i);
    if (sm && US_STATES[sm[1].toUpperCase()]) {
      result.state = US_STATES[sm[1].toUpperCase()];
      result.city = rest.slice(0, sm.index).trim();
    } else {
      result.city = rest;
    }
  } else {
    const sm = raw.match(/\b([A-Z]{2})\s*$/i);
    if (sm && US_STATES[sm[1].toUpperCase()]) {
      result.state = US_STATES[sm[1].toUpperCase()];
      result.street = raw.slice(0, sm.index).trim();
    } else {
      result.street = raw;
    }
  }
  return result;
}

// ── Distress detection ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectDistressSignals(pr: any, isTruthy: (v: unknown) => boolean, toNum: (v: unknown) => number | null) {
  const signals: { type: DistressType; severity: number; days: number; from: string }[] = [];

  if (isTruthy(pr.isDeceasedProperty))
    signals.push({ type: "probate", severity: 9, days: 30, from: "isDeceasedProperty" });
  if (isTruthy(pr.isPreforeclosure) || isTruthy(pr.inForeclosure))
    signals.push({ type: "pre_foreclosure", severity: (toNum(pr.DefaultAmount) ?? 0) > 50000 ? 9 : 7, days: 30, from: "foreclosure" });
  if (isTruthy(pr.inTaxDelinquency))
    signals.push({ type: "tax_lien", severity: (toNum(pr.DelinquentAmount) ?? 0) > 10000 ? 8 : 6, days: 90, from: "inTaxDelinquency" });
  if (isTruthy(pr.inBankruptcyProperty))
    signals.push({ type: "bankruptcy", severity: 8, days: 60, from: "inBankruptcyProperty" });
  if (isTruthy(pr.inDivorce))
    signals.push({ type: "divorce", severity: 7, days: 60, from: "inDivorce" });
  if (isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant))
    signals.push({ type: "vacant", severity: 5, days: 60, from: "vacant" });
  if (isTruthy(pr.isNotSameMailingOrExempt))
    signals.push({ type: "absentee", severity: 4, days: 90, from: "absentee" });

  if (signals.length === 0)
    signals.push({ type: "vacant", severity: 3, days: 180, from: "no_distress_default" });

  return signals;
}
