import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import type { DistressType, LeadStatus } from "@/lib/types";
import { validateStatusTransition, incrementLockVersion } from "@/lib/lead-guardrails";
import { scrubLead } from "@/lib/compliance";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API_BASE = "https://api.propertyradar.com/v1/properties";
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

// ── PATCH /api/prospects — Claim or update a lead's status ─────────────

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = createServerClient();

    const { lead_id, status, assigned_to, actor_id } = body;
    const clientLockVersion = req.headers.get("x-lock-version");

    if (!lead_id) {
      return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
    }

    // Fetch current lead for transition validation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentLead, error: fetchErr } = await (sb.from("leads") as any)
      .select("status, lock_version")
      .eq("id", lead_id)
      .single();

    if (fetchErr || !currentLead) {
      return NextResponse.json({ error: "Lead not found", detail: fetchErr?.message }, { status: 404 });
    }

    if (status && !validateStatusTransition(currentLead.status as LeadStatus, status as LeadStatus)) {
      return NextResponse.json(
        { error: "Invalid transition", detail: `Cannot move from "${currentLead.status}" to "${status}"` },
        { status: 422 }
      );
    }

    // Charter §VIII: Compliance gating before dial eligibility / claim
    const requiresScrub = assigned_to || status === "lead" || status === "negotiation";
    const ghostMode = req.headers.get("x-ghost-mode") === "true";

    if (requiresScrub) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prop } = await (sb.from("leads") as any)
        .select("property_id")
        .eq("id", lead_id)
        .single();

      if (prop?.property_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: property } = await (sb.from("properties") as any)
          .select("owner_phone")
          .eq("id", prop.property_id)
          .single();

        if (property?.owner_phone) {
          const scrub = await scrubLead(property.owner_phone, actor_id, ghostMode);
          if (!scrub.allowed) {
            return NextResponse.json(
              { error: "Compliance blocked", detail: scrub.reason, blockedReasons: scrub.blockedReasons },
              { status: 403 }
            );
          }
        }
      }
    }

    // Use client-supplied lock version when provided (true optimistic locking),
    // otherwise fall back to the version we just read (legacy callers).
    const expectedVersion = clientLockVersion != null
      ? parseInt(clientLockVersion, 10)
      : (currentLead.lock_version ?? 0);

    const updateData: Record<string, unknown> = {
      lock_version: incrementLockVersion(expectedVersion),
    };
    if (status) updateData.status = status;
    if (assigned_to) {
      updateData.assigned_to = assigned_to;
      updateData.claimed_at = new Date().toISOString();
      updateData.claim_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    // Optimistic locking: only update if lock_version matches what the client expects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, count } = await (sb.from("leads") as any)
      .update(updateData)
      .eq("id", lead_id)
      .eq("lock_version", expectedVersion);

    if (count === 0 && !error) {
      return NextResponse.json(
        { error: "Conflict", detail: "Lead was modified by another user. Refresh and try again." },
        { status: 409 }
      );
    }

    if (error) {
      console.error("[API/prospects PATCH] Update failed:", error);
      return NextResponse.json(
        { error: "Update failed", detail: error.message },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      entity_type: "lead",
      entity_id: lead_id,
      action: status === "my_lead" ? "CLAIMED" : "STATUS_CHANGED",
      user_id: actor_id || null,
      details: { status, assigned_to },
    }).then(({ error: auditErr }: { error: unknown }) => {
      if (auditErr) console.error("[API/prospects PATCH] Audit log insert failed (non-fatal):", auditErr);
    });

    return NextResponse.json({ success: true, lead_id, status });
  } catch (err) {
    console.error("[API/prospects PATCH] Error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ── POST /api/prospects — Create prospect + auto-enrich from PropertyRadar ──

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = createServerClient();

    const {
      apn, county, address, city, state, zip,
      owner_name, owner_phone, owner_email,
      estimated_value, equity_percent, property_type,
      bedrooms, bathrooms, sqft, year_built, lot_size,
      distress_tags, notes, source, assign_to,
    } = body;

    if (!address || !county) {
      return NextResponse.json(
        { error: "Address and county are required" },
        { status: 400 }
      );
    }

    const finalApn = apn?.trim() || `MANUAL-${Date.now()}`;
    const finalCounty = county.trim().toLowerCase();

    const toInt = (v: unknown) => { const n = parseInt(String(v), 10); return isNaN(n) ? null : n; };
    const toFloat = (v: unknown) => { const n = parseFloat(String(v)); return isNaN(n) ? null : n; };

    // ── Step 1: Save basic property ──────────────────────────────────

    const baseProperty: Record<string, unknown> = {
      apn: finalApn,
      county: finalCounty,
      address: address.trim(),
      city: city?.trim() || "Unknown",
      state: state?.trim().toUpperCase() || "WA",
      zip: zip?.trim() || null,
      owner_name: owner_name?.trim() || "Unknown Owner",
      owner_phone: owner_phone?.trim() || null,
      owner_email: owner_email?.trim() || null,
      property_type: property_type || "SFR",
      owner_flags: { manual_entry: true, enrichment_pending: true },
      updated_at: new Date().toISOString(),
    };

    if (estimated_value) baseProperty.estimated_value = toInt(estimated_value);
    if (equity_percent) baseProperty.equity_percent = toFloat(equity_percent);
    if (bedrooms) baseProperty.bedrooms = toInt(bedrooms);
    if (bathrooms) baseProperty.bathrooms = toFloat(bathrooms);
    if (sqft) baseProperty.sqft = toInt(sqft);
    if (year_built) baseProperty.year_built = toInt(year_built);
    if (lot_size) baseProperty.lot_size = toFloat(lot_size);

    console.log("[API/prospects POST] Upserting property:", JSON.stringify(baseProperty));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propErr } = await (sb.from("properties") as any)
      .upsert(baseProperty, { onConflict: "apn,county" })
      .select("id")
      .single();

    if (propErr || !property) {
      console.error("[API/prospects] Property upsert failed:", propErr);
      return NextResponse.json(
        { error: "Property save failed", detail: propErr?.message ?? "No data returned" },
        { status: 500 }
      );
    }

    // ── Step 2: Save basic lead ──────────────────────────────────────

    const tags = distress_tags ?? [];
    const baseScore = Math.min(30 + tags.length * 12, 100);
    const eqBonus = toFloat(equity_percent) ?? 0;
    const compositeScore = Math.min(Math.round(baseScore + (eqBonus as number) * 0.2), 100);

    const isAssigned = assign_to && assign_to !== "unassigned";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadRow: any = {
      property_id: property.id,
      status: isAssigned ? "my_lead" : "prospect",
      priority: compositeScore,
      source: source || "manual",
      tags,
      notes: notes?.trim() || "Manually added prospect",
      promoted_at: new Date().toISOString(),
    };

    if (isAssigned) {
      leadRow.assigned_to = assign_to;
      leadRow.claimed_at = new Date().toISOString();
      leadRow.claim_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadErr } = await (sb.from("leads") as any)
      .insert(leadRow)
      .select("id")
      .single();

    if (leadErr || !lead) {
      console.error("[API/prospects] Lead insert failed:", leadErr);
      return NextResponse.json(
        { error: "Lead creation failed", detail: leadErr?.message ?? "No data returned" },
        { status: 500 }
      );
    }

    // Non-blocking audit log — must not prevent save response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("event_log") as any).insert({
      entity_type: "lead",
      entity_id: lead.id,
      action: "CREATED",
      user_id: body.actor_id || null,
      details: {
        source: "manual",
        address,
        owner: owner_name,
        score: compositeScore,
        assigned: isAssigned ? assign_to : "unassigned",
      },
    }).then(({ error: auditErr }: { error: unknown }) => {
      if (auditErr) console.error("[API/prospects POST] Audit log failed (non-fatal):", auditErr);
    });

    // Enrichment is NOT done inline — it was causing Vercel timeouts.
    // User triggers enrichment via "Enrich + Skip Trace" button in the modal.

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      property_id: property.id,
      score: compositeScore,
      status: leadRow.status,
      enriched: false,
      enrichment: "Use Skip Trace to pull PropertyRadar data",
    });
  } catch (err) {
    console.error("[API/prospects] Unexpected error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ── PropertyRadar Enrichment ────────────────────────────────────────────

interface EnrichResult {
  enriched: boolean;
  score: number | null;
  summary: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichFromPropertyRadar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  leadId: string,
  address: string,
  city?: string,
  state?: string,
  zip?: string,
): Promise<EnrichResult> {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    console.log("[Enrich] No PROPERTYRADAR_API_KEY — skipping enrichment");
    return { enriched: false, score: null, summary: "No API key configured" };
  }

  try {
    console.log("[Enrich] Starting PropertyRadar enrichment for:", address);

    // Build criteria from the address
    const criteria: { name: string; value: (string | number)[] }[] = [];
    const parsed = parseAddress(address);

    criteria.push({ name: "Address", value: [parsed.street] });
    if (parsed.city || city) criteria.push({ name: "City", value: [parsed.city || city!] });
    if (parsed.state || state) criteria.push({ name: "State", value: [parsed.state || state!] });
    if (parsed.zip || zip) criteria.push({ name: "ZipFive", value: [parsed.zip || zip!] });

    if (criteria.length < 2) {
      console.log("[Enrich] Insufficient address info for PropertyRadar search");
      return { enriched: false, score: null, summary: "Address too vague for lookup" };
    }

    console.log("[Enrich] Criteria:", JSON.stringify(criteria));

    // Call PropertyRadar
    const prUrl = `${PR_API_BASE}?Purchase=1&Limit=1&Fields=All`;
    const prResponse = await fetch(prUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Criteria: criteria }),
    });

    if (!prResponse.ok) {
      console.error("[Enrich] PropertyRadar HTTP", prResponse.status);
      return { enriched: false, score: null, summary: `PropertyRadar HTTP ${prResponse.status}` };
    }

    const prData = await prResponse.json();
    const pr = prData.results?.[0];

    if (!pr) {
      console.log("[Enrich] No property found in PropertyRadar");
      return { enriched: false, score: null, summary: "No match found in PropertyRadar" };
    }

    console.log("[Enrich] Found property:", pr.RadarID, pr.APN, pr.Owner);

    // ── Build enriched property data ───────────────────────────────

    const ownerFlags: Record<string, unknown> = { source: "propertyradar", radar_id: pr.RadarID };
    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

    const realApn = pr.APN ?? null;
    const enrichedCounty = normalizeCounty(pr.County ?? "");

    const propertyUpdate: Record<string, unknown> = {
      owner_name: pr.Owner ?? pr.Taxpayer ?? null,
      estimated_value: toNumber(pr.AVM) != null ? Math.round(toNumber(pr.AVM)!) : null,
      equity_percent: toNumber(pr.EquityPercent) ?? null,
      bedrooms: toIntHelper(pr.Beds) ?? null,
      bathrooms: toNumber(pr.Baths) ?? null,
      sqft: toIntHelper(pr.SqFt) ?? null,
      year_built: toIntHelper(pr.YearBuilt) ?? null,
      lot_size: toIntHelper(pr.LotSize) ?? null,
      property_type: pr.PType ?? null,
      owner_flags: ownerFlags,
      updated_at: new Date().toISOString(),
    };

    // Update the real APN if PropertyRadar returned one
    if (realApn) {
      propertyUpdate.apn = realApn;
      if (enrichedCounty) propertyUpdate.county = enrichedCounty.toLowerCase();
    }
    if (pr.City) propertyUpdate.city = pr.City;
    if (pr.State) propertyUpdate.state = pr.State;
    if (pr.ZipFive) propertyUpdate.zip = pr.ZipFive;
    if (pr.Address) {
      propertyUpdate.address = [
        pr.Address, pr.City, pr.State, pr.ZipFive,
      ].filter(Boolean).join(", ");
    }

    // Update property record with enriched data
    const { error: updateErr } = await sb.from("properties")
      .update(propertyUpdate)
      .eq("id", propertyId);

    if (updateErr) {
      console.error("[Enrich] Property update failed:", updateErr);
      return { enriched: false, score: null, summary: `DB update failed: ${updateErr.message}` };
    }

    console.log("[Enrich] Property enriched with PropertyRadar data");

    // ── Detect distress signals ────────────────────────────────────

    const signals = detectDistressSignals(pr);
    console.log("[Enrich] Distress signals:", signals.map((s) => s.type));

    // Append distress events (dedup by fingerprint)
    const apnForFingerprint = realApn ?? propertyId;
    for (const signal of signals) {
      const fingerprint = createHash("sha256")
        .update(`${apnForFingerprint}:${enrichedCounty}:${signal.type}:propertyradar`)
        .digest("hex");

      await sb.from("distress_events").insert({
        property_id: propertyId,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint,
        raw_data: { detected_from: signal.detectedFrom, radar_id: pr.RadarID },
        confidence: signal.severity >= 7 ? "0.900" : signal.severity >= 4 ? "0.750" : "0.600",
      }).then(({ error: evtErr }: { error: { code?: string } | null }) => {
        if (evtErr && evtErr.code !== "23505") {
          console.error("[Enrich] Event insert error:", evtErr);
        }
      });
    }

    // ── Run AI scoring engine ──────────────────────────────────────

    const equityPct = toNumber(pr.EquityPercent) ?? 50;
    const avm = toNumber(pr.AVM) ?? 0;
    const loanBal = toNumber(pr.TotalLoanBalance) ?? 0;
    const compRatio = avm > 0 && loanBal > 0 ? avm / loanBal : 1.1;

    const scoringInput: ScoringInput = {
      signals: signals.map((s) => ({
        type: s.type,
        severity: s.severity,
        daysSinceEvent: s.daysSinceEvent,
      })),
      ownerFlags: {
        absentee: ownerFlags.absentee === true,
        corporate: false,
        inherited: isTruthy(pr.isDeceasedProperty),
        elderly: false,
        outOfState: ownerFlags.absentee === true,
      },
      equityPercent: equityPct,
      compRatio: Math.min(compRatio, 3.0),
      historicalConversionRate: 0.5,
    };

    const scoreResult = computeScore(scoringInput);
    console.log("[Enrich] AI Score:", scoreResult.composite, scoreResult.label);

    // Insert scoring record (append-only)
    await sb.from("scoring_records").insert({
      property_id: propertyId,
      model_version: SCORING_MODEL_VERSION,
      composite_score: scoreResult.composite,
      motivation_score: scoreResult.motivationScore,
      deal_score: scoreResult.dealScore,
      severity_multiplier: scoreResult.severityMultiplier,
      recency_decay: scoreResult.recencyDecay,
      stacking_bonus: scoreResult.stackingBonus,
      owner_factor_score: scoreResult.ownerFactorScore,
      equity_factor_score: scoreResult.equityFactorScore,
      ai_boost: scoreResult.aiBoost,
      factors: scoreResult.factors,
    });

    // Update lead with real score and distress tags
    await sb.from("leads")
      .update({
        priority: scoreResult.composite,
        tags: signals.map((s) => s.type),
        notes: `PropertyRadar enriched. Score: ${scoreResult.composite} (${scoreResult.label}). RadarID: ${pr.RadarID}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    // Audit log
    await sb.from("event_log").insert({
      user_id: SYSTEM_USER_ID,
      action: "ENRICHED",
      entity_type: "lead",
      entity_id: leadId,
      details: {
        source: "propertyradar",
        radar_id: pr.RadarID,
        apn: realApn,
        signals: signals.length,
        score: scoreResult.composite,
        label: scoreResult.label,
      },
    }).then(({ error: auditErr }: { error: unknown }) => {
      if (auditErr) console.error("[Enrich] Audit log insert failed (non-fatal):", auditErr);
    });

    const summary = `Enriched: ${pr.Owner ?? "Unknown"} | APN: ${realApn} | Score: ${scoreResult.composite} (${scoreResult.label}) | ${signals.length} signal(s)`;
    console.log("[Enrich]", summary);

    return { enriched: true, score: scoreResult.composite, summary };
  } catch (err) {
    console.error("[Enrich] Error during PropertyRadar enrichment:", err);
    return {
      enriched: false,
      score: null,
      summary: `Enrichment error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

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
        result.city = rest.slice(0, stateMatch.index).trim();
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

function normalizeCounty(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\s+county$/i, "")
    .replace(/^\s+|\s+$/g, "")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function isTruthy(val: unknown): boolean {
  return val === true || val === 1 || val === "1" || val === "Yes" || val === "True" || val === "true";
}

function toNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(/[$,%]/g, ""));
  return isNaN(n) ? undefined : n;
}

function toIntHelper(val: unknown): number | undefined {
  const n = toNumber(val);
  return n != null ? Math.round(n) : undefined;
}

// ── Distress Signal Detection ─────────────────────────────────────────

interface DetectedSignal {
  type: DistressType;
  severity: number;
  daysSinceEvent: number;
  detectedFrom: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectDistressSignals(pr: any): DetectedSignal[] {
  const signals: DetectedSignal[] = [];

  if (isTruthy(pr.isDeceasedProperty)) {
    signals.push({ type: "probate", severity: 9, daysSinceEvent: 30, detectedFrom: "isDeceasedProperty" });
  }

  if (isTruthy(pr.isPreforeclosure) || isTruthy(pr.inForeclosure)) {
    const defaultAmt = toNumber(pr.DefaultAmount) ?? 0;
    signals.push({
      type: "pre_foreclosure",
      severity: defaultAmt > 50000 ? 9 : 7,
      daysSinceEvent: pr.ForeclosureRecDate ? daysBetween(pr.ForeclosureRecDate) : 30,
      detectedFrom: isTruthy(pr.isPreforeclosure) ? "isPreforeclosure" : "inForeclosure",
    });
  }

  if (isTruthy(pr.inTaxDelinquency)) {
    const delAmt = toNumber(pr.DelinquentAmount) ?? 0;
    signals.push({
      type: "tax_lien",
      severity: delAmt > 10000 ? 8 : 6,
      daysSinceEvent: pr.DelinquentYear
        ? Math.max(365 * (new Date().getFullYear() - Number(pr.DelinquentYear)), 30)
        : 90,
      detectedFrom: "inTaxDelinquency",
    });
  }

  if (isTruthy(pr.inBankruptcyProperty)) {
    signals.push({ type: "bankruptcy", severity: 8, daysSinceEvent: 60, detectedFrom: "inBankruptcyProperty" });
  }

  if (isTruthy(pr.inDivorce)) {
    signals.push({ type: "divorce", severity: 7, daysSinceEvent: 60, detectedFrom: "inDivorce" });
  }

  if (isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant)) {
    signals.push({
      type: "vacant",
      severity: 5,
      daysSinceEvent: 60,
      detectedFrom: isTruthy(pr.isSiteVacant) ? "isSiteVacant" : "isMailVacant",
    });
  }

  if (isTruthy(pr.isNotSameMailingOrExempt)) {
    signals.push({ type: "absentee", severity: 4, daysSinceEvent: 90, detectedFrom: "isNotSameMailingOrExempt" });
  }

  if (isTruthy(pr.PropertyHasOpenLiens) || isTruthy(pr.PropertyHasOpenPersonLiens)) {
    if (!signals.some((s) => s.type === "tax_lien")) {
      signals.push({ type: "tax_lien", severity: 5, daysSinceEvent: 90, detectedFrom: "PropertyHasOpenLiens" });
    }
  }

  if (signals.length === 0) {
    signals.push({ type: "vacant", severity: 3, daysSinceEvent: 180, detectedFrom: "no_distress_default" });
  }

  return signals;
}

function daysBetween(dateStr: string): number {
  try {
    const d = new Date(dateStr).getTime();
    if (isNaN(d)) return 90;
    return Math.max(Math.round((Date.now() - d) / 86400000), 1);
  } catch {
    return 90;
  }
}
