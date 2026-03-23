import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import type { DistressType, LeadStatus, SellerTimeline, QualificationRoute } from "@/lib/types";
import { validateStatusTransition, getAllowedTransitions, incrementLockVersion, requiresNextAction } from "@/lib/lead-guardrails";
import { scrubLead } from "@/lib/compliance";
import { distressFingerprint, normalizeCounty as globalNormalizeCounty, isDuplicateError } from "@/lib/dedup";
import { detectDistressSignals, type DetectedSignal } from "@/lib/distress-signals";
import { captureStageTransition } from "@/lib/conversion-tracking";
import { compactObject, normalizeTagList } from "@/lib/prospecting";
import { insertAttribution, extractDomain } from "@/lib/ads/queries/attribution";
import { evaluateStageEntryPrerequisites, type StageEntryPrereqInput } from "@/lib/lead-guards";
import {
  computeQualificationScoreTotal,
  mergeQualificationScoreState,
  resolveQualificationTaskAssignee,
  type QualificationScorePatch,
  type QualificationScoreState,
} from "@/lib/qualification-workflow";
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

// ── P0: Surface missing escalation config at first request ──
if (!process.env.ESCALATION_TARGET_USER_ID) {
  console.warn(
    "[API/prospects] ⚠ ESCALATION_TARGET_USER_ID is not set. Escalation review routing will fail with HTTP 500 until configured.",
  );
}
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

const SELLER_TIMELINES = new Set<SellerTimeline>(["immediate", "30_days", "60_days", "flexible", "unknown"]);
const QUALIFICATION_ROUTES = new Set<QualificationRoute>(["offer_ready", "follow_up", "nurture", "dead", "escalate"]);
const LEAD_STATUSES = new Set<LeadStatus>(["staging", "prospect", "lead", "negotiation", "disposition", "nurture", "dead", "closed"]);
const DEAD_DISPOSITION_SIGNALS = new Set([
  "dead",
  "do_not_call",
  "wrong_number",
  "disconnected",
  "ghost",
  "not_interested",
  "not_qualified",
]);
const DISPOSITION_CODES = new Set([
  "interested",
  "callback",
  "appointment",
  "appointment_set",
  "contract",
  "voicemail",
  "no_answer",
  "wrong_number",
  "disconnected",
  "do_not_call",
  "not_interested",
  "dead",
  "ghost",
]);

// StageEntryPrereqInput and evaluateStageEntryPrerequisites imported from @/lib/lead-guards

async function requireAuthenticatedUser(req: NextRequest, sb: ReturnType<typeof createServerClient>) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// ── GET /api/prospects — Fetch all prospects (server-side, bypasses RLS) ──

export async function GET() {
  try {
    const sb = createServerClient();

    // Step 1: Fetch leads where status = 'prospect'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadsData, error: leadsError } = await (sb.from("leads") as any)
      .select("*")
      .eq("status", "prospect")
      .order("priority", { ascending: false });

    if (leadsError) {
      console.error("[API/prospects GET] Leads query failed:", leadsError);
      return NextResponse.json({ error: leadsError.message, leads: [], properties: {}, predictions: {} }, { status: 500 });
    }

    if (!leadsData || leadsData.length === 0) {
      return NextResponse.json({ leads: [], properties: {}, predictions: {} });
    }

    // Step 2+3: Fetch properties AND predictions in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyIds: string[] = [...new Set((leadsData as any[]).map((l) => l.property_id).filter(Boolean))];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let propertiesMap: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const predictionsMap: Record<string, any> = {};

    if (propertyIds.length > 0) {
      const [propsResult, predsResult] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("properties") as any)
          .select("id, apn, county, address, city, state, zip, owner_name, owner_phone, owner_email, estimated_value, equity_percent, property_type, bedrooms, bathrooms, sqft, year_built, lot_size, owner_flags")
          .in("id", propertyIds),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("scoring_predictions") as any)
          .select("property_id, predictive_score, days_until_distress, confidence, owner_age_inference, equity_burn_rate, life_event_probability")
          .in("property_id", propertyIds)
          .order("created_at", { ascending: false }),
      ]);

      if (propsResult.data) {
        // Trim heavy nested fields from owner_flags for list rendering.
        // pr_raw, deep_crawl, deep_skip can be 10-50KB each — not needed in list view.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of propsResult.data as any[]) {
          if (p.owner_flags && typeof p.owner_flags === "object") {
            const { pr_raw, deep_crawl, deep_skip, ...lightFlags } = p.owner_flags;
            p.owner_flags = lightFlags;
          }
          propertiesMap[p.id] = p;
        }
      }
      if (predsResult.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of predsResult.data as any[]) {
          if (!(p.property_id in predictionsMap)) predictionsMap[p.property_id] = p;
        }
      }
    }

    console.log(`[API/prospects GET] ${leadsData.length} leads, ${Object.keys(propertiesMap).length} properties, ${Object.keys(predictionsMap).length} predictions`);

    const res = NextResponse.json({
      leads: leadsData,
      properties: propertiesMap,
      predictions: predictionsMap,
    });
    res.headers.set("Cache-Control", "private, s-maxage=30, stale-while-revalidate=60");
    return res;
  } catch (err) {
    console.error("[API/prospects GET] Error:", err);
    return NextResponse.json(
      { error: "Internal server error", leads: [], properties: {}, predictions: {} },
      { status: 500 },
    );
  }
}

// ── PATCH /api/prospects — Claim or update a lead's status ─────────────

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = createServerClient();
    const user = await requireAuthenticatedUser(req, sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      lead_id,
      status,
      assigned_to,
      next_call_scheduled_at,
      next_follow_up_at,
      note_append,
      disposition_code,
      motivation_level,
      seller_timeline,
      condition_level,
      decision_maker_confirmed,
      price_expectation,
      qualification_route,
      occupancy_score,
      equity_flexibility_score,
      next_action,
      next_action_due_at,
    } = body;

    const clientLockVersion = req.headers.get("x-lock-version");

    if (!lead_id || typeof lead_id !== "string") {
      return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
    }

    const hasMutation =
      status !== undefined
      || assigned_to !== undefined
      || next_call_scheduled_at !== undefined
      || next_follow_up_at !== undefined
      || note_append !== undefined
      || disposition_code !== undefined
      || motivation_level !== undefined
      || seller_timeline !== undefined
      || condition_level !== undefined
      || decision_maker_confirmed !== undefined
      || price_expectation !== undefined
      || qualification_route !== undefined
      || occupancy_score !== undefined
      || equity_flexibility_score !== undefined
      || next_action !== undefined
      || next_action_due_at !== undefined;

    const hasQualificationMutation =
      motivation_level !== undefined
      || seller_timeline !== undefined
      || condition_level !== undefined
      || decision_maker_confirmed !== undefined
      || price_expectation !== undefined
      || qualification_route !== undefined
      || occupancy_score !== undefined
      || equity_flexibility_score !== undefined;

    if (!hasMutation) {
      return NextResponse.json(
        { error: "No mutable fields provided" },
        { status: 400 },
      );
    }

    const parseOptionalIso = (value: unknown) => {
      if (value === undefined) return { provided: false as const, valid: true, iso: null as string | null };
      if (value === null || value === "") return { provided: true as const, valid: true, iso: null as string | null };
      if (typeof value !== "string") return { provided: true as const, valid: false, iso: null as string | null };
      const ms = new Date(value).getTime();
      if (Number.isNaN(ms)) return { provided: true as const, valid: false, iso: null as string | null };
      return { provided: true as const, valid: true, iso: new Date(ms).toISOString() };
    };

    const parseOptionalSmallInt = (value: unknown, min: number, max: number) => {
      if (value === undefined) return { provided: false as const, valid: true, value: null as number | null };
      if (value === null || value === "") return { provided: true as const, valid: true, value: null as number | null };
      const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        return { provided: true as const, valid: false, value: null as number | null };
      }
      return { provided: true as const, valid: true, value: parsed };
    };

    const parseOptionalEnum = <T extends string>(value: unknown, allowed: Set<T>) => {
      if (value === undefined) return { provided: false as const, valid: true, value: null as T | null };
      if (value === null || value === "") return { provided: true as const, valid: true, value: null as T | null };
      if (typeof value !== "string") return { provided: true as const, valid: false, value: null as T | null };
      if (!allowed.has(value as T)) return { provided: true as const, valid: false, value: null as T | null };
      return { provided: true as const, valid: true, value: value as T };
    };

    const parseOptionalInteger = (value: unknown, min: number) => {
      if (value === undefined) return { provided: false as const, valid: true, value: null as number | null };
      if (value === null || value === "") return { provided: true as const, valid: true, value: null as number | null };
      const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
      if (!Number.isInteger(parsed) || parsed < min) {
        return { provided: true as const, valid: false, value: null as number | null };
      }
      return { provided: true as const, valid: true, value: parsed };
    };

    const parsedNextCall = parseOptionalIso(next_call_scheduled_at);
    const parsedNextFollowUp = parseOptionalIso(next_follow_up_at);
    const parsedMotivation = parseOptionalSmallInt(motivation_level, 1, 5);
    const parsedTimeline = parseOptionalEnum<SellerTimeline>(seller_timeline, SELLER_TIMELINES);
    const parsedCondition = parseOptionalSmallInt(condition_level, 1, 5);
    const parsedPriceExpectation = parseOptionalInteger(price_expectation, 0);
    const parsedDisposition = parseOptionalEnum<string>(disposition_code, DISPOSITION_CODES);
    const parsedQualificationRoute = parseOptionalEnum<QualificationRoute>(qualification_route, QUALIFICATION_ROUTES);
    const parsedOccupancy = parseOptionalSmallInt(occupancy_score, 1, 5);
    const parsedEquityFlex = parseOptionalSmallInt(equity_flexibility_score, 1, 5);

    if (!parsedOccupancy.valid) {
      return NextResponse.json({ error: "occupancy_score must be 1-5" }, { status: 400 });
    }
    if (!parsedEquityFlex.valid) {
      return NextResponse.json({ error: "equity_flexibility_score must be 1-5" }, { status: 400 });
    }

    if (!parsedNextCall.valid || !parsedNextFollowUp.valid) {
      return NextResponse.json(
        { error: "Invalid datetime for next action" },
        { status: 400 },
      );
    }

    if (!parsedMotivation.valid) {
      return NextResponse.json({ error: "motivation_level must be an integer between 1 and 5" }, { status: 400 });
    }

    if (!parsedTimeline.valid) {
      return NextResponse.json({ error: "seller_timeline is invalid" }, { status: 400 });
    }

    if (!parsedCondition.valid) {
      return NextResponse.json({ error: "condition_level must be an integer between 1 and 5" }, { status: 400 });
    }

    if (decision_maker_confirmed !== undefined && typeof decision_maker_confirmed !== "boolean") {
      return NextResponse.json({ error: "decision_maker_confirmed must be a boolean" }, { status: 400 });
    }

    if (!parsedPriceExpectation.valid) {
      return NextResponse.json({ error: "price_expectation must be a non-negative integer" }, { status: 400 });
    }

    if (!parsedDisposition.valid) {
      return NextResponse.json({ error: "disposition_code is invalid" }, { status: 400 });
    }

    if (!parsedQualificationRoute.valid) {
      return NextResponse.json({ error: "qualification_route is invalid" }, { status: 400 });
    }

    if (status !== undefined && (typeof status !== "string" || !LEAD_STATUSES.has(status as LeadStatus))) {
      return NextResponse.json({ error: "status is invalid" }, { status: 400 });
    }

    const noteAppendText = typeof note_append === "string" ? note_append.trim() : "";
    if (note_append !== undefined && noteAppendText.length === 0) {
      return NextResponse.json(
        { error: "note_append must be a non-empty string when provided" },
        { status: 400 },
      );
    }

    // Fetch current lead for transition validation and optimistic lock baseline.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentLead, error: fetchErr } = await (sb.from("leads") as any)
      .select(
        "status, lock_version, notes, qualification_route, qualification_score_total, assigned_to, property_id, last_contact_at, total_calls, disposition_code, next_call_scheduled_at, next_follow_up_at, motivation_level, seller_timeline, condition_level, decision_maker_confirmed, price_expectation, occupancy_score, equity_flexibility_score, next_action, next_action_due_at",
      )
      .eq("id", lead_id)
      .single();

    if (fetchErr || !currentLead) {
      return NextResponse.json({ error: "Lead not found", detail: fetchErr?.message }, { status: 404 });
    }

    let estimatedValueForQualification: number | null = null;
    if (hasQualificationMutation && currentLead.property_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: propertyForScore, error: propertyScoreErr } = await (sb.from("properties") as any)
        .select("estimated_value")
        .eq("id", currentLead.property_id)
        .single();

      if (propertyScoreErr) {
        console.warn("[API/prospects PATCH] Could not load property estimated_value for qualification score:", propertyScoreErr.message);
      } else if (propertyForScore?.estimated_value != null) {
        const numericEstimatedValue = Number(propertyForScore.estimated_value);
        estimatedValueForQualification = Number.isFinite(numericEstimatedValue) ? numericEstimatedValue : null;
      }
    }

    let expectedVersion = currentLead.lock_version ?? 0;
    if (clientLockVersion != null) {
      const parsedVersion = Number.parseInt(clientLockVersion, 10);
      if (!Number.isInteger(parsedVersion) || parsedVersion < 0) {
        return NextResponse.json({ error: "Invalid x-lock-version header" }, { status: 400 });
      }
      expectedVersion = parsedVersion;
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const addDays = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return d.toISOString();
    };

    const currentStatus = currentLead.status as LeadStatus;
    let targetStatus = status as LeadStatus | undefined;

    const currentQualificationRoute = (currentLead.qualification_route as QualificationRoute | null) ?? null;
    const nextQualificationRoute = parsedQualificationRoute.provided
      ? parsedQualificationRoute.value
      : currentQualificationRoute;
    const qualificationRouteChanged = parsedQualificationRoute.provided && nextQualificationRoute !== currentQualificationRoute;

    let plannedTask:
      | {
          title: string;
          dueAt: string;
          description?: string;
          nextFollowUpAt?: string;
          escalationReviewOnly?: boolean;
        }
      | null = null;

    if (qualificationRouteChanged && nextQualificationRoute) {
      if (nextQualificationRoute === "offer_ready") {
        if (currentStatus === "lead") {
          if (targetStatus && targetStatus !== "negotiation") {
            return NextResponse.json(
              { error: "Invalid route/status combination", detail: "offer_ready requires stage negotiation when current status is lead" },
              { status: 422 },
            );
          }
          targetStatus = "negotiation";
        }
        const followUpAt = addDays(1);
        plannedTask = {
          title: "Run comps + prepare offer range",
          description: "Offer-ready path active. Prepare range and set/confirm next seller touchpoint.",
          dueAt: nowIso,
          nextFollowUpAt: followUpAt,
        };
      }

      if (nextQualificationRoute === "follow_up") {
        const dueAt = addDays(3);
        plannedTask = {
          title: "Follow-up call",
          dueAt,
          nextFollowUpAt: dueAt,
        };
      }

      if (nextQualificationRoute === "nurture") {
        if (currentStatus === "lead") {
          if (targetStatus && targetStatus !== "nurture") {
            return NextResponse.json(
              { error: "Invalid route/status combination", detail: "nurture route requires stage nurture when current status is lead" },
              { status: 422 },
            );
          }
          targetStatus = "nurture";
        }

        const dueAt = addDays(14);
        plannedTask = {
          title: "Nurture check-in",
          dueAt,
          nextFollowUpAt: dueAt,
        };
      }

      if (nextQualificationRoute === "dead") {
        if (currentStatus === "lead") {
          if (targetStatus && targetStatus !== "dead") {
            return NextResponse.json(
              { error: "Invalid route/status combination", detail: "dead route requires stage dead when current status is lead" },
              { status: 422 },
            );
          }
          targetStatus = "dead";
        }
      }

      if (nextQualificationRoute === "escalate") {
        plannedTask = {
          title: "Escalation review requested",
          description: "Adam review requested. Lead ownership remains with the current assignee until manually reassigned.",
          dueAt: nowIso,
          escalationReviewOnly: true,
        };
      }
    }

    const effectiveAssignedTo =
      assigned_to !== undefined
        ? (typeof assigned_to === "string" && assigned_to.trim() && assigned_to !== "unassigned"
          ? assigned_to
          : null)
        : (currentLead.assigned_to ?? null);

    const escalationRequested = qualificationRouteChanged && nextQualificationRoute === "escalate";
    if (escalationRequested && !effectiveAssignedTo) {
      return NextResponse.json(
        {
          error: "Escalation requires owner assignment",
          detail: "Assign the lead before escalating. Escalation is review-only and does not transfer ownership.",
        },
        { status: 422 },
      );
    }

    const effectiveNextCallAt = parsedNextCall.provided
      ? parsedNextCall.iso
      : (currentLead.next_call_scheduled_at ?? null);

    const effectiveDispositionCode = parsedDisposition.provided
      ? parsedDisposition.value
      : (typeof currentLead.disposition_code === "string" ? currentLead.disposition_code : null);

    const effectiveNextFollowUpAt = parsedNextFollowUp.provided
      ? parsedNextFollowUp.iso
      : (plannedTask?.nextFollowUpAt ?? (parsedNextCall.provided ? parsedNextCall.iso : (currentLead.next_follow_up_at ?? null)));

    const hasContactEvidence =
      Boolean(currentLead.last_contact_at)
      || Number(currentLead.total_calls ?? 0) > 0
      || (typeof effectiveDispositionCode === "string" && effectiveDispositionCode.trim().length > 0);

    const offerReadyRequested = qualificationRouteChanged && nextQualificationRoute === "offer_ready";
    if (offerReadyRequested && !effectiveAssignedTo) {
      return NextResponse.json(
        {
          error: "Offer Ready requires owner assignment",
          detail: "Claim or assign the lead before marking Offer Ready.",
        },
        { status: 422 },
      );
    }

    if (offerReadyRequested && !hasContactEvidence) {
      return NextResponse.json(
        {
          error: "Offer Ready requires contact context",
          detail: "Log at least one contact attempt before marking Offer Ready.",
        },
        { status: 422 },
      );
    }

    if (targetStatus && !validateStatusTransition(currentStatus, targetStatus)) {
      const allowed = getAllowedTransitions(currentStatus);
      return NextResponse.json(
        {
          error: "Invalid transition",
          detail: `Cannot move from "${currentStatus}" to "${targetStatus}". Allowed: ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"}`,
        },
        { status: 422 },
      );
    }

    // ── next_action hard enforcement ──
    // Matches the enforcement in /api/leads/[id]/stage (PR-1 Stage machine).
    // Two rules:
    //   1. Forward-moving stage transitions require next_action to be set.
    //   2. Clearing next_action on a lead already in a stage that requires it is rejected.
    const resolvedStatus = targetStatus ?? currentStatus;
    if (requiresNextAction(resolvedStatus)) {
      const effectiveNextAction =
        (typeof next_action === "string" && next_action.trim())
          ? next_action.trim()
          : next_action === undefined
            ? (typeof currentLead.next_action === "string" && currentLead.next_action.trim()
              ? currentLead.next_action.trim()
              : null)
            : null; // next_action explicitly set to null/empty

      if (!effectiveNextAction) {
        const verb = targetStatus && targetStatus !== currentStatus
          ? `advancing to "${targetStatus}"`
          : `staying in "${currentStatus}"`;
        return NextResponse.json(
          {
            error: "Missing next_action",
            detail: `A next_action is required when ${verb}. Describe what happens next for this lead.`,
          },
          { status: 400 },
        );
      }
    }

    if (targetStatus && targetStatus !== currentStatus) {
      const prereqError = evaluateStageEntryPrerequisites({
        currentStatus,
        targetStatus,
        effectiveAssignedTo,
        hasContactEvidence,
        effectiveNextCallAt,
        effectiveNextFollowUpAt,
        nextQualificationRoute,
        noteAppendText,
        existingNotes: typeof currentLead.notes === "string" ? currentLead.notes : null,
        dispositionCode: effectiveDispositionCode,
      });

      if (prereqError) {
        return NextResponse.json(
          { error: "Missing stage prerequisites", detail: prereqError },
          { status: 422 },
        );
      }
    }

    const finalStatus = targetStatus ?? currentStatus;
    const hasUpdate = (key: string) => Object.prototype.hasOwnProperty.call(updateData, key);

    // Charter VIII: compliance gating before dial eligibility or claim.
    const requiresScrub = Boolean(assigned_to) || finalStatus === "lead" || finalStatus === "negotiation";
    const ghostMode = req.headers.get("x-ghost-mode") === "true";

    if (requiresScrub && currentLead.property_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: property } = await (sb.from("properties") as any)
        .select("owner_phone")
        .eq("id", currentLead.property_id)
        .single();

      if (property?.owner_phone) {
        const scrub = await scrubLead(property.owner_phone, user.id, ghostMode);
        if (!scrub.allowed) {
          return NextResponse.json(
            { error: "Compliance blocked", detail: scrub.reason, blockedReasons: scrub.blockedReasons },
            { status: 403 },
          );
        }
      }
    }

    const updateData: Record<string, unknown> = {
      lock_version: incrementLockVersion(expectedVersion),
      updated_at: nowIso,
    };

    if (targetStatus) {
      updateData.status = targetStatus;
    }

    if (assigned_to !== undefined) {
      if (typeof assigned_to === "string" && assigned_to.trim() && assigned_to !== "unassigned") {
        updateData.assigned_to = assigned_to;
        updateData.claimed_at = nowIso;
        updateData.claim_expires_at = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      } else {
        updateData.assigned_to = null;
        updateData.claimed_at = null;
        updateData.claim_expires_at = null;
      }
    }

    if (parsedNextCall.provided) {
      updateData.next_call_scheduled_at = parsedNextCall.iso;
      if (!parsedNextFollowUp.provided) {
        updateData.next_follow_up_at = parsedNextCall.iso;
      }
    }

    if (parsedNextFollowUp.provided) {
      updateData.next_follow_up_at = parsedNextFollowUp.iso;
    }

    if (plannedTask?.nextFollowUpAt && !parsedNextFollowUp.provided) {
      updateData.next_follow_up_at = plannedTask.nextFollowUpAt;
    }

    if (targetStatus === "dead") {
      // Dead leads should not keep active callback/follow-up timers.
      updateData.next_call_scheduled_at = null;
      updateData.next_follow_up_at = null;
    }

    if (noteAppendText) {
      const stampedLine = `[${nowIso}] ${noteAppendText}`;
      const currentNotes = typeof currentLead.notes === "string" ? currentLead.notes.trim() : "";
      updateData.notes = currentNotes ? `${currentNotes}\n\n${stampedLine}` : stampedLine;
    }

    if (parsedDisposition.provided) {
      updateData.disposition_code = parsedDisposition.value;
      if (parsedDisposition.value) {
        updateData.last_contact_at = nowIso;
      }
    }

    // Closeout fallback: if a note was appended alongside a next-action schedule,
    // treat it as a contact activity even when disposition was unchanged.
    if (noteAppendText && !updateData.last_contact_at && (parsedNextCall.provided || parsedNextFollowUp.provided)) {
      updateData.last_contact_at = nowIso;
    }

    if (parsedMotivation.provided) {
      updateData.motivation_level = parsedMotivation.value;
    }

    if (parsedTimeline.provided) {
      updateData.seller_timeline = parsedTimeline.value;
    }

    if (parsedCondition.provided) {
      updateData.condition_level = parsedCondition.value;
    }

    if (decision_maker_confirmed !== undefined) {
      updateData.decision_maker_confirmed = decision_maker_confirmed;
    }

    if (parsedPriceExpectation.provided) {
      updateData.price_expectation = parsedPriceExpectation.value;
    }

    if (parsedQualificationRoute.provided) {
      updateData.qualification_route = parsedQualificationRoute.value;
    }

    if (parsedOccupancy.provided) {
      updateData.occupancy_score = parsedOccupancy.value;
    }

    if (parsedEquityFlex.provided) {
      updateData.equity_flexibility_score = parsedEquityFlex.value;
    }

    if (next_action !== undefined) {
      updateData.next_action = typeof next_action === "string" ? next_action.trim() || null : null;
    }

    if (next_action_due_at !== undefined) {
      const parsedNextActionDue = parseOptionalIso(next_action_due_at);
      if (!parsedNextActionDue.valid) {
        return NextResponse.json({ error: "Invalid datetime for next_action_due_at" }, { status: 400 });
      }
      updateData.next_action_due_at = parsedNextActionDue.iso;
    }

    const currentScoreState: QualificationScoreState = {
      motivationLevel: currentLead.motivation_level ?? null,
      sellerTimeline: (currentLead.seller_timeline as SellerTimeline | null) ?? null,
      conditionLevel: currentLead.condition_level ?? null,
      occupancyScore: currentLead.occupancy_score ?? null,
      equityFlexibilityScore: currentLead.equity_flexibility_score ?? null,
      decisionMakerConfirmed: currentLead.decision_maker_confirmed ?? false,
      priceExpectation: currentLead.price_expectation ?? null,
      estimatedValue: estimatedValueForQualification,
    };
    const scorePatch: QualificationScorePatch = {
      motivationLevel: parsedMotivation.provided ? parsedMotivation.value : undefined,
      sellerTimeline: parsedTimeline.provided ? parsedTimeline.value : undefined,
      conditionLevel: parsedCondition.provided ? parsedCondition.value : undefined,
      occupancyScore: parsedOccupancy.provided ? parsedOccupancy.value : undefined,
      equityFlexibilityScore: parsedEquityFlex.provided ? parsedEquityFlex.value : undefined,
      decisionMakerConfirmed: decision_maker_confirmed !== undefined ? decision_maker_confirmed : undefined,
      priceExpectation: parsedPriceExpectation.provided ? parsedPriceExpectation.value : undefined,
      estimatedValue: estimatedValueForQualification,
    };
    const effectiveScoreState = mergeQualificationScoreState(currentScoreState, scorePatch);
    const timelineScoreMap: Record<SellerTimeline, number> = { immediate: 5, "30_days": 4, "60_days": 3, flexible: 2, unknown: 1 };
    const effectiveMotivation = effectiveScoreState.motivationLevel;
    const effectiveTimeline = effectiveScoreState.sellerTimeline;
    const timelineScore = effectiveTimeline ? timelineScoreMap[effectiveTimeline] : null;
    const dmScore = effectiveScoreState.decisionMakerConfirmed ? 5 : 2;

    if (hasQualificationMutation) {
      // Recompute on every qualification mutation so partial updates never leave stale totals.
      updateData.qualification_score_total = computeQualificationScoreTotal(effectiveScoreState);
    }

    const taskAssigneeResult = resolveQualificationTaskAssignee({
      escalationReviewOnly: plannedTask?.escalationReviewOnly === true,
      escalationTargetUserId: process.env.ESCALATION_TARGET_USER_ID,
      effectiveAssignedTo,
      actorUserId: user.id,
    });
    if ("error" in taskAssigneeResult) {
      return NextResponse.json(
        {
          error: "Escalation target misconfigured",
          detail: taskAssigneeResult.error,
        },
        { status: 500 },
      );
    }
    const taskAssignee = taskAssigneeResult.assignee;

    let createdTaskId: string | null = null;

    if (plannedTask) {
      // Route-driven tasks are blocking so we do not leave a misleading lead state.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: createdTask, error: taskErr } = await (sb.from("tasks") as any)
        .insert({
          title: plannedTask.title,
          description: plannedTask.description ?? null,
          assigned_to: taskAssignee,
          lead_id,
          due_at: plannedTask.dueAt,
          status: "pending",
          priority: 2,
        })
        .select("id")
        .single();

      if (taskErr || !createdTask) {
        console.error("[API/prospects PATCH] Qualification task insert failed:", taskErr);
        return NextResponse.json(
          { error: "Could not create qualification task", detail: taskErr?.message },
          { status: 500 },
        );
      }

      createdTaskId = createdTask.id as string;
    }

    // Optimistic locking: only update if lock_version matches what the client expects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updateData2, error } = await (sb.from("leads") as any)
      .update(updateData)
      .eq("id", lead_id)
      .eq("lock_version", expectedVersion)
      .select("id");

    if (!error && (!updateData2 || updateData2.length === 0)) {
      if (createdTaskId) {
        // Best-effort compensation for optimistic lock conflict.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("tasks") as any)
          .delete()
          .eq("id", createdTaskId)
          .then(({ error: cleanupErr }: { error: unknown }) => {
            if (cleanupErr) {
              console.error("[API/prospects PATCH] Task cleanup failed after conflict:", cleanupErr);
            }
          });
      }

      return NextResponse.json(
        { error: "Conflict", detail: "Lead was modified by another user. Refresh and try again." },
        { status: 409 },
      );
    }

    if (error) {
      if (createdTaskId) {
        // Best-effort compensation if lead update fails.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("tasks") as any)
          .delete()
          .eq("id", createdTaskId)
          .then(({ error: cleanupErr }: { error: unknown }) => {
            if (cleanupErr) {
              console.error("[API/prospects PATCH] Task cleanup failed after lead update error:", cleanupErr);
            }
          });
      }

      console.error("[API/prospects PATCH] Lead update failed:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const statusChanged = Boolean(targetStatus && currentStatus !== targetStatus);

    // Conversion tracking: capture stage transition snapshot (non-blocking).
    if (statusChanged && targetStatus) {
      captureStageTransition(lead_id, currentStatus, targetStatus).catch((e) =>
        console.error("[API/prospects PATCH] Stage transition capture failed (non-fatal):", e),
      );
    }

    const qualificationMutation = hasQualificationMutation;

    const action = qualificationMutation
      ? (qualificationRouteChanged ? "QUALIFICATION_ROUTED" : "QUALIFICATION_UPDATED")
      : assigned_to !== undefined
        ? "CLAIMED"
        : statusChanged
          ? "STATUS_CHANGED"
          : parsedDisposition.provided
            ? "CALL_OUTCOME_UPDATED"
          : noteAppendText && (parsedNextCall.provided || parsedNextFollowUp.provided)
            ? "CALL_CLOSEOUT"
          : noteAppendText
            ? "NOTE_ADDED"
            : "FOLLOW_UP_UPDATED";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any)
      .insert({
        entity_type: "lead",
        entity_id: lead_id,
        action,
        user_id: user.id,
        details: {
          status_before: currentStatus,
          status_after: finalStatus,
          assigned_to: updateData.assigned_to,
          disposition_code_before: typeof currentLead.disposition_code === "string" ? currentLead.disposition_code : null,
          disposition_code_after: parsedDisposition.provided ? parsedDisposition.value : (typeof currentLead.disposition_code === "string" ? currentLead.disposition_code : null),
          next_call_scheduled_at: parsedNextCall.provided ? parsedNextCall.iso : undefined,
          next_follow_up_at: parsedNextFollowUp.provided
            ? parsedNextFollowUp.iso
            : (plannedTask?.nextFollowUpAt ?? (parsedNextCall.provided ? parsedNextCall.iso : undefined)),
          note_appended: noteAppendText || undefined,
          motivation_level: parsedMotivation.provided ? parsedMotivation.value : undefined,
          seller_timeline: parsedTimeline.provided ? parsedTimeline.value : undefined,
          condition_level: parsedCondition.provided ? parsedCondition.value : undefined,
          decision_maker_confirmed: decision_maker_confirmed,
          price_expectation: parsedPriceExpectation.provided ? parsedPriceExpectation.value : undefined,
          occupancy_score: parsedOccupancy.provided ? parsedOccupancy.value : undefined,
          equity_flexibility_score: parsedEquityFlex.provided ? parsedEquityFlex.value : undefined,
          qualification_score_total: updateData.qualification_score_total ?? undefined,
          qualification_route_before: currentQualificationRoute,
          qualification_route_after: parsedQualificationRoute.provided ? parsedQualificationRoute.value : currentQualificationRoute,
          qualification_task_id: createdTaskId,
          qualification_task_title: plannedTask?.title,
          qualification_task_due_at: plannedTask?.dueAt,
          escalation_review_only: plannedTask?.escalationReviewOnly === true ? true : undefined,
          ownership_after_escalation: effectiveAssignedTo ?? undefined,
        },
      })
      .then(({ error: auditErr }: { error: unknown }) => {
        if (auditErr) {
          console.error("[API/prospects PATCH] Audit log insert failed (non-fatal):", auditErr);
        }
      });

    // Compute suggested route from score total (suggestion only, not auto-applied)
    let suggestedRoute: string | undefined;
    const scoreTotalForSuggestion = updateData.qualification_score_total as number | null | undefined;
    if (scoreTotalForSuggestion != null) {
      if (scoreTotalForSuggestion >= 25 && (effectiveMotivation ?? 0) >= 4 && dmScore >= 3) {
        suggestedRoute = "offer_ready";
      } else if (scoreTotalForSuggestion >= 18 || ((effectiveMotivation ?? 0) >= 3 && (timelineScore ?? 0) <= 3)) {
        suggestedRoute = "follow_up";
      } else if (scoreTotalForSuggestion >= 12) {
        suggestedRoute = "nurture";
      } else {
        suggestedRoute = "dead";
      }
    }

    return NextResponse.json({
      success: true,
      lead_id,
      status: finalStatus,
      lock_version: updateData.lock_version,
      assigned_to: hasUpdate("assigned_to")
        ? (updateData.assigned_to as string | null)
        : (currentLead.assigned_to ?? null),
      next_call_scheduled_at: hasUpdate("next_call_scheduled_at")
        ? (updateData.next_call_scheduled_at as string | null)
        : (currentLead.next_call_scheduled_at ?? null),
      next_follow_up_at: hasUpdate("next_follow_up_at")
        ? (updateData.next_follow_up_at as string | null)
        : (currentLead.next_follow_up_at ?? null),
      last_contact_at: hasUpdate("last_contact_at")
        ? (updateData.last_contact_at as string | null)
        : (currentLead.last_contact_at ?? null),
      disposition_code: hasUpdate("disposition_code")
        ? (updateData.disposition_code as string | null)
        : (typeof currentLead.disposition_code === "string" ? currentLead.disposition_code : null),
      qualification_route: hasUpdate("qualification_route")
        ? (updateData.qualification_route as QualificationRoute | null)
        : currentQualificationRoute,
      notes: hasUpdate("notes")
        ? (updateData.notes as string | null)
        : (typeof currentLead.notes === "string" ? currentLead.notes : null),
      qualification_task_id: createdTaskId,
      escalation_review_only: plannedTask?.escalationReviewOnly === true,
      qualification_score_total: hasUpdate("qualification_score_total")
        ? (updateData.qualification_score_total as number | null)
        : (currentLead.qualification_score_total ?? null),
      suggested_route: suggestedRoute,
    });
  } catch (err) {
    console.error("[API/prospects PATCH] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/prospects - Create prospect + auto-enrich from PropertyRadar
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = createServerClient();
    const actorUser = await requireAuthenticatedUser(req, sb);

    const {
      property_id: preEnrichedPropertyId,
      apn, county, address, city, state, zip,
      owner_name, owner_phone, owner_email,
      mailing_address, mailing_city, mailing_state, mailing_zip,
      co_owner_name,
      estimated_value, equity_percent, property_type,
      bedrooms, bathrooms, sqft, year_built, lot_size,
      distress_tags, notes, source, assign_to,
      source_channel, source_vendor, source_list_name, source_pull_date,
      source_campaign, intake_method, raw_source_ref, duplicate_status,
      received_at, assigned_at, first_contact_at,
      niche_tag, import_batch_id, outreach_type, first_call_at, last_call_at,
      attempt_count, skip_trace_status, call_outcome, wrong_number, do_not_call,
      bad_record, outbound_status, source_metadata,
      gclid, landing_page,
      // Enrichment data from search preview (Bricked AI + County GIS)
      bricked_data, gis_data,
    } = body;

    if (!address || !county) {
      return NextResponse.json(
        { error: "Address and county are required" },
        { status: 400 }
      );
    }

    const finalApn = apn?.trim() || `MANUAL-${Date.now()}`;
    const finalCounty = county.trim().toLowerCase();
    const normalizedTags = normalizeTagList(distress_tags);
    const sourceChannel = typeof source_channel === "string" && source_channel.trim().length > 0
      ? source_channel.trim().toLowerCase()
      : typeof source === "string" && source.trim().length > 0
        ? source.trim().toLowerCase()
        : "manual";
    const sourceVendor = typeof source_vendor === "string" ? source_vendor.trim() || null : null;
    const sourceListName = typeof source_list_name === "string" ? source_list_name.trim() || null : null;
    const sourcePullDate = typeof source_pull_date === "string" ? source_pull_date.trim() || null : null;
    const sourceCampaign = typeof source_campaign === "string" ? source_campaign.trim() || null : null;
    const intakeMethod = typeof intake_method === "string" ? intake_method.trim().toLowerCase() || null : null;
    const rawSourceRef = typeof raw_source_ref === "string" ? raw_source_ref.trim() || null : null;
    const duplicateStatus = typeof duplicate_status === "string" ? duplicate_status.trim().toLowerCase() || null : null;
    const receivedAt = typeof received_at === "string" ? received_at.trim() || null : null;
    const assignedAt = typeof assigned_at === "string" ? assigned_at.trim() || null : null;
    const firstContactAt = typeof first_contact_at === "string" ? first_contact_at.trim() || null : null;
    const nicheTag = typeof niche_tag === "string" ? niche_tag.trim().toLowerCase() || null : null;
    const importBatchId = typeof import_batch_id === "string" ? import_batch_id.trim() || null : null;
    const outreachType = typeof outreach_type === "string" ? outreach_type.trim().toLowerCase() || null : null;
    const skipTraceStatus = typeof skip_trace_status === "string" ? skip_trace_status.trim().toLowerCase() || null : null;
    const outboundStatus = typeof outbound_status === "string" ? outbound_status.trim().toLowerCase() || null : null;
    const firstCallAt = typeof first_call_at === "string" ? first_call_at.trim() || null : null;
    const lastCallAt = typeof last_call_at === "string" ? last_call_at.trim() || null : null;
    const parsedAttemptCount = attempt_count == null || attempt_count === ""
      ? null
      : Number.parseInt(String(attempt_count), 10);
    const attemptCount = parsedAttemptCount != null && Number.isInteger(parsedAttemptCount) && parsedAttemptCount >= 0
      ? parsedAttemptCount
      : null;
    const callOutcome = typeof call_outcome === "string" ? call_outcome.trim().toLowerCase() || null : null;
    const wrongNumberFlag = wrong_number === true || normalizedTags.includes("wrong_number");
    const doNotCallFlag = do_not_call === true || normalizedTags.includes("do_not_call");
    const badRecordFlag = bad_record === true || normalizedTags.includes("bad_data");
    const rawSourceMetadata =
      source_metadata && typeof source_metadata === "object" && !Array.isArray(source_metadata)
        ? source_metadata as Record<string, unknown>
        : null;
    const mailingAddress = typeof mailing_address === "string" ? mailing_address.trim() || null : null;
    const mailingCity = typeof mailing_city === "string" ? mailing_city.trim() || null : null;
    const mailingState = typeof mailing_state === "string" ? mailing_state.trim().toUpperCase() || null : null;
    const mailingZip = typeof mailing_zip === "string" ? mailing_zip.trim() || null : null;
    const coOwnerName = typeof co_owner_name === "string" ? co_owner_name.trim() || null : null;

    const toInt = (v: unknown) => { const n = parseInt(String(v), 10); return isNaN(n) ? null : n; };
    const toFloat = (v: unknown) => { const n = parseFloat(String(v)); return isNaN(n) ? null : n; };

    // ── Step 1: Save basic property (or reuse pre-enriched) ──────────

    let propertyId: string;
    let alreadyEnriched = false;

    if (preEnrichedPropertyId) {
      // Property was already created + enriched during preview — reuse it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (sb.from("properties") as any)
        .select("id, owner_flags")
        .eq("id", preEnrichedPropertyId)
        .single();

      if (existing) {
        propertyId = existing.id;
        alreadyEnriched = !!(existing.owner_flags?.enrichment_completed_at);
        console.log(`[API/prospects POST] Using pre-enriched property ${propertyId} (enriched: ${alreadyEnriched})`);
      } else {
        // Fallback to upsert if pre-enriched ID is stale
        console.warn(`[API/prospects POST] Pre-enriched property ${preEnrichedPropertyId} not found, falling back to upsert`);
      }
    }

    // @ts-expect-error — propertyId may not be set yet if pre-enriched path failed
    if (!propertyId) {
      // Check if property already exists — merge owner_flags to preserve deep_crawl, photos, etc.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingProp } = await (sb.from("properties") as any)
        .select("id, owner_flags")
        .eq("apn", finalApn)
        .eq("county", finalCounty)
        .maybeSingle();

      const existingFlags = (existingProp?.owner_flags ?? {}) as Record<string, unknown>;
      const existingProspecting = (existingFlags.prospecting_intake ?? {}) as Record<string, unknown>;
      const existingOutbound = (existingFlags.outbound_intake ?? {}) as Record<string, unknown>;
      const mergedFlags: Record<string, unknown> = { ...existingFlags, enrichment_pending: true };
      if (!existingProp) mergedFlags.manual_entry = true;
      if (coOwnerName) mergedFlags.co_owner_name = coOwnerName;
      if (mailingAddress) {
        mergedFlags.mailing_address = {
          street: mailingAddress,
          city: mailingCity,
          state: mailingState,
          zip: mailingZip,
        };
      }
      mergedFlags.prospecting_intake = {
        ...existingProspecting,
        ...compactObject({
          source_channel: sourceChannel,
          source_vendor: sourceVendor,
          source_list_name: sourceListName,
          source_pull_date: sourcePullDate,
          source_campaign: sourceCampaign,
          intake_method: intakeMethod,
          raw_source_ref: rawSourceRef,
          duplicate_status: duplicateStatus,
          received_at: receivedAt,
          county: finalCounty,
          niche_tag: nicheTag,
          import_batch_id: importBatchId,
          raw_source_metadata: rawSourceMetadata,
          imported_at: new Date().toISOString(),
        }),
      };
      mergedFlags.outbound_intake = {
        ...existingOutbound,
        ...compactObject({
          outreach_type: outreachType,
          first_call_at: firstCallAt,
          last_call_at: lastCallAt,
          assigned_at: assignedAt,
          first_contact_at: firstContactAt,
          attempt_count: attemptCount,
          skip_trace_status: skipTraceStatus,
          call_outcome: callOutcome,
          wrong_number: wrongNumberFlag || undefined,
          do_not_call: doNotCallFlag || undefined,
          bad_record: badRecordFlag || undefined,
          outbound_status: outboundStatus ?? (sourceChannel === "manual" ? "working" : "new_import"),
        }),
      };

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
        owner_flags: mergedFlags,
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
      const { data: upserted, error: propErr } = await (sb.from("properties") as any)
        .upsert(baseProperty, { onConflict: "apn,county" })
        .select("id")
        .single();

      if (propErr || !upserted) {
        console.error("[API/prospects] Property upsert failed:", propErr);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
      propertyId = upserted.id;
    }

    const property = { id: propertyId };

    // ── Step 2: Save basic lead ──────────────────────────────────────

    const tags = normalizedTags;
    // No inline scoring — all leads score through the canonical v2.2 engine
    // after enrichment. Manual leads start unscored (null).

    const isAssigned = assign_to && assign_to !== "unassigned";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadRow: any = {
      property_id: property.id,
      status: isAssigned || sourceChannel === "manual" ? "lead" : "prospect",
      priority: null,
      source: sourceChannel,
      tags,
      notes: notes?.trim() || (sourceChannel === "manual" ? "Manually added prospect" : "Imported prospect"),
      promoted_at: receivedAt ?? new Date().toISOString(),
    };

    if (isAssigned) {
      leadRow.assigned_to = assign_to;
      leadRow.claimed_at = assignedAt ?? new Date().toISOString();
      leadRow.claim_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    if (firstContactAt) {
      leadRow.last_contact_at = firstContactAt;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadErr } = await (sb.from("leads") as any)
      .insert(leadRow)
      .select("id")
      .single();

    if (leadErr || !lead) {
      console.error("[API/prospects] Lead insert failed:", leadErr);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // ── Step 2b: Create ads attribution record if gclid present ─────
    const gclidValue = typeof gclid === "string" && gclid.trim().length > 0 ? gclid.trim() : null;
    const landingPageValue = typeof landing_page === "string" && landing_page.trim().length > 0 ? landing_page.trim() : null;

    if (gclidValue) {
      const market = finalCounty === "kootenai" ? "kootenai" as const : "spokane" as const;
      try {
        const attrId = await insertAttribution(sb, {
          lead_id: lead.id,
          gclid: gclidValue,
          landing_page: landingPageValue,
          landing_domain: landingPageValue ? extractDomain(landingPageValue) : null,
          source_channel: sourceChannel,
          market,
        });
        if (attrId) {
          console.log(`[API/prospects POST] Attribution ${attrId} created for lead ${lead.id} (gclid: ${gclidValue.slice(0, 12)}…)`);
        }
      } catch (attrErr) {
        // Attribution failure must not block lead creation response
        console.error("[API/prospects POST] Attribution insert failed (non-fatal):", attrErr);
      }
    }

    // Non-blocking audit log — must not prevent save response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("event_log") as any).insert({
      entity_type: "lead",
      entity_id: lead.id,
      action: "CREATED",
      user_id: actorUser?.id ?? null,
      details: {
        source: "manual",
        source_channel: sourceChannel,
        source_vendor: sourceVendor,
        source_list_name: sourceListName,
        source_campaign: sourceCampaign,
        intake_method: intakeMethod,
        raw_source_ref: rawSourceRef,
        duplicate_status: duplicateStatus,
        received_at: receivedAt,
        import_batch_id: importBatchId,
        niche_tag: nicheTag,
        address,
        owner: owner_name,
        score: null,
        assigned: isAssigned ? assign_to : "unassigned",
      },
    }).then(({ error: auditErr }: { error: unknown }) => {
      if (auditErr) console.error("[API/prospects POST] Audit log failed (non-fatal):", auditErr);
    });

    // ── Step 3: Store enrichment data through dossier pipeline ──────
    // Bricked + County GIS data from search preview → dossier_artifacts → fact_assertions
    // High-confidence facts auto-promote (review_status = 'accepted')

    let computedScore: number | null = null;

    // ── 3.0: Auto-fetch County GIS if not provided by client ──────
    // County GIS is free and fast — always fetch it on lead creation
    let effectiveGisData = gis_data;
    if (!effectiveGisData || effectiveGisData.skipped) {
      try {
        const countyForGis = finalCounty;
        const stateForGis = (state?.trim().toUpperCase()) || "WA";
        const addressForGis = address.trim();

        if (countyForGis.includes("spokane") && stateForGis === "WA") {
          const { spokaneGisAdapter } = await import("@/providers/spokane-gis/adapter");
          const gisResult = await spokaneGisAdapter.lookupProperty({
            address: addressForGis,
            county: countyForGis,
            state: stateForGis,
          });
          if (gisResult.facts.length > 0) {
            const factsMap = new Map(gisResult.facts.map((f) => [f.fieldName, f.value]));
            let salesHistory: Array<{ date: string | null; price: number }> = [];
            const salesRaw = factsMap.get("county_sales_history");
            if (typeof salesRaw === "string") { try { salesHistory = JSON.parse(salesRaw); } catch { /* ignore */ } }
            let parcelGeometry: number[][][] | null = null;
            const geomRaw = factsMap.get("county_parcel_geometry");
            if (typeof geomRaw === "string") { try { parcelGeometry = JSON.parse(geomRaw); } catch { /* ignore */ } }
            effectiveGisData = {
              assessedValue: (factsMap.get("county_assessed_value") as number) ?? null,
              landValue: (factsMap.get("county_land_value") as number) ?? null,
              improvementValue: (factsMap.get("county_improvement_value") as number) ?? null,
              lastSalePrice: (factsMap.get("county_last_sale_price") as number) ?? null,
              lastSaleDate: (factsMap.get("county_last_sale_date") as string) ?? null,
              parcelNumber: (factsMap.get("county_parcel_number") as string) ?? null,
              acreage: (factsMap.get("county_acreage") as number) ?? null,
              propUseDesc: (factsMap.get("county_prop_use_desc") as string) ?? null,
              salesHistory,
              parcelGeometry,
              rawPayload: gisResult.rawPayload,
              provider: "spokane_gis" as const,
            };
            console.log("[API/prospects POST] Auto-fetched Spokane County GIS data");
          }
        } else if (countyForGis.includes("kootenai") && stateForGis === "ID") {
          const { kootenaiGisAdapter } = await import("@/providers/kootenai-gis/adapter");
          const gisResult = await kootenaiGisAdapter.lookupProperty({
            address: addressForGis,
            county: countyForGis,
            state: stateForGis,
          });
          if (gisResult.facts.length > 0) {
            const factsMap = new Map(gisResult.facts.map((f) => [f.fieldName, f.value]));
            let salesHistory: Array<{ date: string | null; price: number }> = [];
            const salesRaw = factsMap.get("county_sales_history");
            if (typeof salesRaw === "string") { try { salesHistory = JSON.parse(salesRaw); } catch { /* ignore */ } }
            let parcelGeometry: number[][][] | null = null;
            const geomRaw = factsMap.get("county_parcel_geometry");
            if (typeof geomRaw === "string") { try { parcelGeometry = JSON.parse(geomRaw); } catch { /* ignore */ } }
            effectiveGisData = {
              assessedValue: (factsMap.get("county_assessed_value") as number) ?? null,
              landValue: (factsMap.get("county_land_value") as number) ?? null,
              improvementValue: (factsMap.get("county_improvement_value") as number) ?? null,
              lastSalePrice: (factsMap.get("county_last_sale_price") as number) ?? null,
              lastSaleDate: (factsMap.get("county_last_sale_date") as string) ?? null,
              parcelNumber: (factsMap.get("county_parcel_number") as string) ?? null,
              acreage: (factsMap.get("county_acreage") as number) ?? null,
              propUseDesc: (factsMap.get("county_prop_use_desc") as string) ?? null,
              salesHistory,
              parcelGeometry,
              rawPayload: gisResult.rawPayload,
              provider: "kootenai_gis" as const,
            };
            console.log("[API/prospects POST] Auto-fetched Kootenai County GIS data");
          }
        }
      } catch (gisErr) {
        // GIS failure must never block lead creation
        console.error("[API/prospects POST] Auto-GIS fetch failed (non-fatal):", gisErr);
      }
    }

    // Fire-and-forget: enrichment pipeline (non-blocking for response)
    const enrichmentPromise = (async () => {
      try {
        // ── 3a: Store Bricked artifact + facts ──
        if (bricked_data && typeof bricked_data === "object") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: brickedArtifact } = await (sb.from("dossier_artifacts") as any)
            .insert({
              lead_id: lead.id,
              property_id: property.id,
              source_type: "bricked_ai",
              source_label: "Bricked AI Property Analysis",
              raw_excerpt: JSON.stringify(bricked_data.rawPayload ?? bricked_data),
              captured_by: actorUser?.id ?? null,
            })
            .select("id")
            .single();

          if (brickedArtifact?.id) {
            // Extract fact assertions from Bricked data
            const brickedFacts: Array<{
              artifact_id: string;
              lead_id: string;
              fact_type: string;
              fact_value: string;
              confidence: string;
              review_status: string;
              promoted_field: string | null;
            }> = [];

            const addFact = (type: string, value: unknown, promoted: string | null = null, conf = "high") => {
              if (value !== null && value !== undefined && value !== "") {
                brickedFacts.push({
                  artifact_id: brickedArtifact.id,
                  lead_id: lead.id,
                  fact_type: type,
                  fact_value: String(value),
                  confidence: conf,
                  review_status: conf === "high" ? "accepted" : "pending",
                  promoted_field: promoted,
                });
              }
            };

            addFact("arv_estimate", bricked_data.arv, "top_fact_1");
            addFact("cmv_estimate", bricked_data.cmv, null);
            addFact("total_repair_cost", bricked_data.totalRepairCost, "top_fact_3");
            addFact("equity_estimate", bricked_data.equityEstimate, null);
            addFact("comp_count", bricked_data.compCount, null);
            addFact("renovation_score", bricked_data.renovationScore, null, "medium");
            addFact("bricked_share_link", bricked_data.shareLink, null);
            addFact("bricked_dashboard_link", bricked_data.dashboardLink, null);

            if (brickedFacts.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sb.from("fact_assertions") as any).insert(brickedFacts);
            }

            // Also store key values in owner_flags for backward compat with existing UI
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: currentProp } = await (sb.from("properties") as any)
              .select("owner_flags")
              .eq("id", property.id)
              .single();

            const existingFlags = (currentProp?.owner_flags ?? {}) as Record<string, unknown>;
            const brickedFlags: Record<string, unknown> = {
              ...existingFlags,
              bricked_arv: bricked_data.arv,
              comp_arv: bricked_data.arv,
              bricked_cmv: bricked_data.cmv,
              bricked_repair_cost: bricked_data.totalRepairCost,
              bricked_share_link: bricked_data.shareLink,
              bricked_dashboard_link: bricked_data.dashboardLink,
              bricked_id: bricked_data.brickedId,
              comp_count: bricked_data.compCount,
              bricked_equity: bricked_data.equityEstimate,
              bricked_renovation_score: bricked_data.renovationScore,
            };

            if (bricked_data.subjectImages?.length) {
              brickedFlags.bricked_subject_images = bricked_data.subjectImages;
            }
            if (bricked_data.repairs?.length) {
              brickedFlags.bricked_repairs = bricked_data.repairs;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("properties") as any)
              .update({ owner_flags: brickedFlags })
              .eq("id", property.id);
          }
        }

        // ── 3b: Store County GIS artifact + facts ──
        if (effectiveGisData && typeof effectiveGisData === "object" && !effectiveGisData.skipped) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: gisArtifact } = await (sb.from("dossier_artifacts") as any)
            .insert({
              lead_id: lead.id,
              property_id: property.id,
              source_type: effectiveGisData.provider === "kootenai_gis" ? "kootenai_gis" : "spokane_gis",
              source_label: effectiveGisData.provider === "kootenai_gis"
                ? "Kootenai County GIS (ArcGIS)"
                : "Spokane County GIS (ArcGIS)",
              raw_excerpt: JSON.stringify(effectiveGisData.rawPayload ?? effectiveGisData),
              captured_by: actorUser?.id ?? null,
            })
            .select("id")
            .single();

          if (gisArtifact?.id) {
            const gisFacts: Array<{
              artifact_id: string;
              lead_id: string;
              fact_type: string;
              fact_value: string;
              confidence: string;
              review_status: string;
              promoted_field: string | null;
            }> = [];

            const addGisFact = (type: string, value: unknown, promoted: string | null = null) => {
              if (value !== null && value !== undefined && value !== "") {
                gisFacts.push({
                  artifact_id: gisArtifact.id,
                  lead_id: lead.id,
                  fact_type: type,
                  fact_value: String(value),
                  confidence: "high",
                  review_status: "accepted",
                  promoted_field: promoted,
                });
              }
            };

            addGisFact("county_assessed_value", effectiveGisData.assessedValue, "top_fact_2");
            addGisFact("county_land_value", effectiveGisData.landValue, null);
            addGisFact("county_improvement_value", effectiveGisData.improvementValue, null);
            addGisFact("county_last_sale_price", effectiveGisData.lastSalePrice, null);
            addGisFact("county_last_sale_date", effectiveGisData.lastSaleDate, null);
            addGisFact("county_parcel_number", effectiveGisData.parcelNumber, null);
            addGisFact("county_acreage", effectiveGisData.acreage, null);
            addGisFact("county_prop_use_desc", effectiveGisData.propUseDesc, null);

            if (effectiveGisData.salesHistory?.length) {
              addGisFact("county_sales_history", JSON.stringify(effectiveGisData.salesHistory), null);
            }

            if (gisFacts.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sb.from("fact_assertions") as any).insert(gisFacts);
            }

            // Store GIS data in owner_flags for backward compat
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: currentProp2 } = await (sb.from("properties") as any)
              .select("owner_flags")
              .eq("id", property.id)
              .single();

            const flags2 = (currentProp2?.owner_flags ?? {}) as Record<string, unknown>;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("properties") as any)
              .update({
                owner_flags: {
                  ...flags2,
                  gis_assessed_value: effectiveGisData.assessedValue,
                  gis_land_value: effectiveGisData.landValue,
                  gis_improvement_value: effectiveGisData.improvementValue,
                  gis_sales_history: effectiveGisData.salesHistory,
                  gis_parcel_number: effectiveGisData.parcelNumber,
                  gis_parcel_geometry: effectiveGisData.parcelGeometry,
                  gis_source: effectiveGisData.provider,
                  gis_fetched_at: new Date().toISOString(),
                },
              })
              .eq("id", property.id);
          }
        }

        // ── 3c: Auto-promote top facts to leads projection fields ──
        const topFacts: Record<string, string> = {};
        if (bricked_data?.arv) {
          topFacts.top_fact_1 = `ARV: $${Number(bricked_data.arv).toLocaleString()}`;
        }
        if (effectiveGisData?.assessedValue) {
          topFacts.top_fact_2 = `Assessed: $${Number(effectiveGisData.assessedValue).toLocaleString()}`;
        }
        if (bricked_data?.totalRepairCost) {
          topFacts.top_fact_3 = `Repairs: $${Number(bricked_data.totalRepairCost).toLocaleString()}`;
        }

        if (Object.keys(topFacts).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("leads") as any)
            .update(topFacts)
            .eq("id", lead.id);
        }

        // ── 3d: Score with real enrichment data via v2.2 engine ──
        // Build scoring input from enrichment data + distress tags
        if (bricked_data || effectiveGisData) {
          const { computeScore } = await import("@/lib/scoring");
          const signals = (normalizedTags || [])
            .filter((t: string) => [
              "probate", "pre_foreclosure", "tax_lien", "code_violation",
              "vacant", "divorce", "bankruptcy", "fsbo", "absentee",
              "inherited", "water_shutoff", "condemned", "tired_landlord", "underwater",
            ].includes(t))
            .map((t: string) => ({
              type: t as import("@/lib/types").DistressType,
              severity: 5,
              daysSinceEvent: 30,
              status: "active" as const,
            }));

          const eqPct = bricked_data?.equityEstimate
            ?? (equity_percent ? Number(equity_percent) : null)
            ?? 0; // No equity data = 0 contribution, never assume 50%

          const scoreResult = computeScore({
            signals,
            ownerFlags: {
              absentee: normalizedTags?.includes("absentee") ?? false,
              inherited: normalizedTags?.includes("inherited") ?? false,
            },
            equityPercent: eqPct,
            compRatio: 0,
            historicalConversionRate: 0,
          });

          computedScore = scoreResult.composite;

          // Update lead priority with real score
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("leads") as any)
            .update({ priority: scoreResult.composite })
            .eq("id", lead.id);
        }
      } catch (enrichErr) {
        // Enrichment failure must never block lead creation
        console.error("[API/prospects POST] Enrichment pipeline failed (non-fatal):", enrichErr);
      }
    })();

    // Wait for enrichment to complete (it's fast — just DB writes + scoring)
    await enrichmentPromise;

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      property_id: property.id,
      score: computedScore,
      scored: computedScore !== null,
      status: leadRow.status,
      enriched: alreadyEnriched || !!bricked_data || !!effectiveGisData,
      enrichment: (bricked_data || effectiveGisData)
        ? "Enrichment data stored through dossier pipeline"
        : alreadyEnriched
          ? "Already enriched during preview"
          : "Queued for automatic enrichment (runs every 15 min)",
    });
  } catch (err) {
    console.error("[API/prospects] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/prospects — Permanently delete a customer file ────────

export async function DELETE(req: NextRequest) {
  try {
    const sb = createServerClient();

    // Auth: same Bearer-token pattern as PATCH/POST
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { lead_id } = body;

    if (!lead_id) {
      return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
    }

    // Fetch lead + property details BEFORE deletion (for audit log)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: fetchErr } = await (sb.from("leads") as any)
      .select("id, status, assigned_to, property_id, notes, source, priority")
      .eq("id", lead_id)
      .single();

    if (fetchErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Fetch property details for audit
    let propertyDetails: Record<string, unknown> = {};
    if (lead.property_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prop } = await (sb.from("properties") as any)
        .select("address, owner_name, apn, county")
        .eq("id", lead.property_id)
        .single();
      if (prop) propertyDetails = prop;
    }

    // Call the DB function that handles cascading deletes + scoring_predictions bypass
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcErr } = await (sb as any).rpc("delete_customer_file", {
      p_lead_id: lead_id,
    });

    if (rpcErr) {
      console.error("[API/prospects DELETE] RPC error:", rpcErr);
      return NextResponse.json(
        { error: "Delete failed", detail: rpcErr.message },
        { status: 500 },
      );
    }

    // Supabase .rpc() may return JSONB as-is or wrapped — normalize
    const result = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
    console.log("[API/prospects DELETE] RPC result:", JSON.stringify(result));

    if (result && result.success === false) {
      return NextResponse.json(
        { error: "Delete failed", detail: result.error ?? "Unknown DB error" },
        { status: 500 },
      );
    }

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any)
      .insert({
        user_id: user.id,
        action: "LEAD_DELETED",
        entity_type: "lead",
        entity_id: lead_id,
        details: {
          address: propertyDetails.address ?? null,
          owner_name: propertyDetails.owner_name ?? null,
          apn: propertyDetails.apn ?? null,
          county: propertyDetails.county ?? null,
          status: lead.status,
          assigned_to: lead.assigned_to,
          property_id: lead.property_id,
          property_deleted: result.property_deleted,
          deleted_by: user.id,
          deleted_by_email: user.email,
        },
      })
      .then(({ error: auditErr }: { error: unknown }) => {
        if (auditErr) console.error("[API/prospects DELETE] Audit log failed (non-fatal):", auditErr);
      });

    console.log(`[API/prospects DELETE] Lead ${lead_id} deleted by ${user.email} (property_deleted: ${result.property_deleted})`);

    return NextResponse.json({
      success: true,
      lead_id,
      property_deleted: result.property_deleted,
    });
  } catch (err) {
    console.error("[API/prospects DELETE] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
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

    const ownerFlags: Record<string, unknown> = { source: "propertyradar", radar_id: pr.RadarID, last_enriched: new Date().toISOString() };
    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

    const realApn = pr.APN ?? null;
    const enrichedCounty = globalNormalizeCounty(pr.County ?? "", "");

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
      if (enrichedCounty) propertyUpdate.county = enrichedCounty;
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

    const detection = detectDistressSignals(pr);
    const signals = detection.signals;
    console.log("[Enrich] Distress signals:", signals.map((s) => s.type));

    // Append distress events (dedup by fingerprint)
    const apnForFingerprint = realApn ?? propertyId;
    for (const signal of signals) {
      const fingerprint = distressFingerprint(apnForFingerprint, enrichedCounty, signal.type, "propertyradar");

      await sb.from("distress_events").insert({
        property_id: propertyId,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint,
        raw_data: { detected_from: signal.detectedFrom, radar_id: pr.RadarID },
        confidence: signal.severity >= 7 ? "0.900" : signal.severity >= 4 ? "0.750" : "0.600",
      }).then(({ error: evtErr }: { error: { code?: string } | null }) => {
        if (evtErr && !isDuplicateError(evtErr)) {
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
      historicalConversionRate: 0,
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

// Distress Signal Detection — uses shared module from @/lib/distress-signals

