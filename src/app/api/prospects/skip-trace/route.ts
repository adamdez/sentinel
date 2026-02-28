import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createHash } from "crypto";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import type { DistressType } from "@/lib/types";

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

/**
 * POST /api/prospects/skip-trace
 *
 * Pulls owner contact info from PropertyRadar Persons endpoint.
 * Requires the property to have been enriched first (needs radar_id).
 *
 * Body: { property_id: string, lead_id: string }
 *
 * If no radar_id, falls back to re-enriching from the address first.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { property_id, lead_id } = body;

    if (!property_id) {
      return NextResponse.json({ error: "property_id is required" }, { status: 400 });
    }

    const sb = createServerClient();

    // Fetch current property record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propErr } = await (sb.from("properties") as any)
      .select("*")
      .eq("id", property_id)
      .single();

    if (propErr || !property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    let radarId = property.owner_flags?.radar_id as string | undefined;

    // If no radar_id, auto-enrich from PropertyRadar first
    if (!radarId) {
      console.log("[SkipTrace] No radar_id — auto-enriching from PropertyRadar first");
      const enrichResult = await enrichProperty(sb, apiKey, property, lead_id);
      if (!enrichResult.success) {
        console.error("[SkipTrace] Enrichment failed:", enrichResult.error);
        return NextResponse.json({
          error: enrichResult.error ?? "PropertyRadar enrichment failed",
          enriched: false,
          hint: "Check server logs for details. Common issues: address format, API key, or property not in PropertyRadar coverage.",
        }, { status: 422 });
      }
      radarId = enrichResult.radar_id;
      console.log("[SkipTrace] Enrichment complete, got RadarID:", radarId);
    }

    if (!radarId) {
      return NextResponse.json({
        error: "Could not find this property in PropertyRadar — check address",
        enriched: false,
      }, { status: 422 });
    }

    console.log("[SkipTrace] Fetching Persons for RadarID:", radarId);

    // Call PropertyRadar Persons endpoint
    const personsUrl = `${PR_API_BASE}/${radarId}/persons?Fields=All`;
    const personsRes = await fetch(personsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!personsRes.ok) {
      console.error("[SkipTrace] Persons API failed:", personsRes.status);
      return NextResponse.json({
        error: `PropertyRadar Persons API returned ${personsRes.status}`,
      }, { status: 502 });
    }

    const personsData = await personsRes.json();
    console.log("[SkipTrace] Persons response:", JSON.stringify(personsData).slice(0, 2000));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persons: any[] = personsData.results ?? personsData ?? [];

    // Extract phone numbers and emails from all persons
    const phones: string[] = [];
    const emails: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const personDetails: any[] = [];

    for (const person of persons) {
      const name = [person.FirstName, person.LastName].filter(Boolean).join(" ") || person.Name || "Unknown";

      // Phones can be in Phone1, Phone2, etc. or in a Phones array
      const personPhones: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const ph = person[`Phone${i}`] ?? person[`phone${i}`];
        if (ph && typeof ph === "string" && ph.length >= 7) {
          personPhones.push(ph);
          if (!phones.includes(ph)) phones.push(ph);
        }
      }
      if (person.Phone && !phones.includes(person.Phone)) {
        personPhones.push(person.Phone);
        phones.push(person.Phone);
      }
      if (Array.isArray(person.Phones)) {
        for (const ph of person.Phones) {
          const num = typeof ph === "string" ? ph : ph?.Number ?? ph?.phone;
          if (num && !phones.includes(num)) {
            personPhones.push(num);
            phones.push(num);
          }
        }
      }

      // Emails
      const personEmails: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const em = person[`Email${i}`] ?? person[`email${i}`];
        if (em && typeof em === "string" && em.includes("@")) {
          personEmails.push(em);
          if (!emails.includes(em)) emails.push(em);
        }
      }
      if (person.Email && !emails.includes(person.Email)) {
        personEmails.push(person.Email);
        emails.push(person.Email);
      }
      if (Array.isArray(person.Emails)) {
        for (const em of person.Emails) {
          const addr = typeof em === "string" ? em : em?.Address ?? em?.email;
          if (addr && !emails.includes(addr)) {
            personEmails.push(addr);
            emails.push(addr);
          }
        }
      }

      personDetails.push({
        name,
        relation: person.Relation ?? person.PersonType ?? "Owner",
        age: person.Age ?? null,
        phones: personPhones,
        emails: personEmails,
        mailing_address: person.MailingAddress ?? person.Address ?? null,
      });
    }

    console.log("[SkipTrace] Found", phones.length, "phones,", emails.length, "emails from", persons.length, "persons");

    // Update the property record with contact info
    const primaryPhone = phones[0] ?? null;
    const primaryEmail = emails[0] ?? null;

    const updatedFlags = {
      ...property.owner_flags,
      skip_traced: true,
      skip_trace_date: new Date().toISOString(),
      persons: personDetails,
      all_phones: phones,
      all_emails: emails,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any)
      .update({
        owner_phone: primaryPhone,
        owner_email: primaryEmail,
        owner_flags: updatedFlags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", property_id);

    // Audit log
    if (lead_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        entity_type: "lead",
        entity_id: lead_id,
        action: "SKIP_TRACED",
        details: {
          radar_id: radarId,
          phones_found: phones.length,
          emails_found: emails.length,
          persons_found: persons.length,
        },
      });
    }

    return NextResponse.json({
      success: true,
      property_id,
      radar_id: radarId,
      phones,
      emails,
      persons: personDetails,
      primary_phone: primaryPhone,
      primary_email: primaryEmail,
    });
  } catch (err) {
    console.error("[SkipTrace] Error:", err);
    return NextResponse.json(
      { error: "Skip trace failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ── Auto-enrich from PropertyRadar ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichProperty(sb: any, apiKey: string, property: any, leadId?: string): Promise<{ success: boolean; radar_id?: string; error?: string }> {
  const address = property.address ?? "";
  if (!address) return { success: false, error: "No address on property" };

  console.log("[Enrich] Property record:", {
    id: property.id,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
  });

  // Use the property's stored fields first (entered separately in the form),
  // only fall back to parsing the concatenated address string
  const parsed = parseAddress(address);

  // Street: take just the first part before any comma from the address
  const street = parsed.street || address.split(",")[0]?.trim() || "";

  // City/State/Zip: prefer separately stored fields over parsed values
  const city = property.city || parsed.city || "";
  const state = property.state || parsed.state || "";
  const zip = property.zip || parsed.zip || "";

  const criteria: { name: string; value: string[] }[] = [];
  if (street) criteria.push({ name: "Address", value: [street] });
  if (city) criteria.push({ name: "City", value: [city.replace(/\s+(WA|OR|CA|AZ|ID|TX|FL|NY)\s*$/i, "").trim()] });
  if (state) criteria.push({ name: "State", value: [state.replace(/[^A-Z]/gi, "").slice(0, 2).toUpperCase()] });
  if (zip) criteria.push({ name: "ZipFive", value: [zip.replace(/\D/g, "").slice(0, 5)] });

  if (criteria.length < 2) return { success: false, error: "Insufficient address info" };

  console.log("[Enrich] Final criteria:", JSON.stringify(criteria, null, 2));

  const prBody = { Criteria: criteria };
  const prUrl = `${PR_API_BASE}?Purchase=1&Limit=1&Fields=All`;

  console.log("[Enrich] Calling PropertyRadar:", prUrl);
  console.log("[Enrich] Request body:", JSON.stringify(prBody));

  const prRes = await fetch(prUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(prBody),
  });

  if (!prRes.ok) {
    const errText = await prRes.text().catch(() => "");
    console.error("[Enrich] PropertyRadar HTTP", prRes.status, errText.slice(0, 500));
    return { success: false, error: `PropertyRadar HTTP ${prRes.status}: ${errText.slice(0, 200)}` };
  }

  const prData = await prRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pr: any = prData.results?.[0];
  if (!pr) return { success: false, error: "No property found in PropertyRadar for this address" };

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
  };
  if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
  if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
  if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
  if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
  if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

  // Update property
  const update: Record<string, unknown> = {
    owner_name: pr.Owner ?? pr.Taxpayer ?? property.owner_name,
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
    update.county = pr.County.replace(/\s+county$/i, "").trim().split(" ")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ").toLowerCase();
  }
  if (pr.Address) {
    update.address = [pr.Address, pr.City, pr.State, pr.ZipFive].filter(Boolean).join(", ");
  }

  await sb.from("properties").update(update).eq("id", property.id);

  // Detect distress signals + run scoring
  const signals = detectDistressSignals(pr, isTruthy, toNum);

  for (const signal of signals) {
    const fp = createHash("sha256").update(`${pr.APN ?? property.id}:${signal.type}:propertyradar`).digest("hex");
    await sb.from("distress_events").insert({
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
  }

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

  await sb.from("scoring_records").insert({
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
  });

  if (leadId) {
    await sb.from("leads").update({
      priority: score.composite,
      tags: signals.map((s) => s.type),
      notes: `PropertyRadar enriched via Skip Trace. Score: ${score.composite} (${score.label}). RadarID: ${pr.RadarID}`,
      updated_at: new Date().toISOString(),
    }).eq("id", leadId);

    await sb.from("event_log").insert({
      entity_type: "lead",
      entity_id: leadId,
      action: "ENRICHED",
      details: { source: "propertyradar", radar_id: pr.RadarID, score: score.composite },
    });
  }

  return { success: true, radar_id: pr.RadarID as string };
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
