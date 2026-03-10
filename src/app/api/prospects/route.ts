import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import type { DistressType, LeadStatus, SellerTimeline, QualificationRoute } from "@/lib/types";
import { validateStatusTransition, getAllowedTransitions, incrementLockVersion } from "@/lib/lead-guardrails";
import { scrubLead } from "@/lib/compliance";
import { distressFingerprint, normalizeCounty as globalNormalizeCounty, isDuplicateError } from "@/lib/dedup";
import { detectDistressSignals, type DetectedSignal } from "@/lib/distress-signals";
import { captureStageTransition } from "@/lib/conversion-tracking";
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

type StageEntryPrereqInput = {
  currentStatus: LeadStatus;
  targetStatus: LeadStatus;
  effectiveAssignedTo: string | null;
  hasContactEvidence: boolean;
  effectiveNextCallAt: string | null;
  effectiveNextFollowUpAt: string | null;
  nextQualificationRoute: QualificationRoute | null;
  noteAppendText: string;
  existingNotes: string | null;
  dispositionCode: string | null;
};

function evaluateStageEntryPrerequisites(input: StageEntryPrereqInput): string | null {
  const hasExistingNotes = typeof input.existingNotes === "string" && input.existingNotes.trim().length >= 12;
  const hasNoteContext = input.noteAppendText.length > 0 || hasExistingNotes;
  const dispositionCode = (input.dispositionCode ?? "").toLowerCase();
  const hasDispositionSignal = dispositionCode.length > 0;

  if (input.targetStatus === "negotiation") {
    if (!input.effectiveAssignedTo) {
      return "Move to Negotiation requires an owner assignment. Claim or assign the lead first.";
    }
    if (!input.hasContactEvidence) {
      return "Move to Negotiation requires contact effort (last contact or call activity). Log a contact attempt first.";
    }
  }

  if (input.targetStatus === "nurture") {
    if (!input.effectiveNextCallAt && !input.effectiveNextFollowUpAt) {
      return "Move to Nurture requires a next follow-up date. Set Next Action/Callback first.";
    }
    const hasNurtureReason =
      input.nextQualificationRoute === "nurture"
      || input.nextQualificationRoute === "follow_up"
      || hasDispositionSignal
      || hasNoteContext;
    if (!hasNurtureReason) {
      return "Move to Nurture requires context. Set a qualification route, add disposition context, or add a note.";
    }
  }

  if (input.targetStatus === "dead") {
    const hasDeadReason =
      input.nextQualificationRoute === "dead"
      || DEAD_DISPOSITION_SIGNALS.has(dispositionCode)
      || hasNoteContext;
    if (!hasDeadReason) {
      return "Move to Dead requires a reason signal (qualification route dead, negative disposition, or note context).";
    }
  }

  if (input.targetStatus === "disposition") {
    if (input.currentStatus !== "negotiation") {
      return "Move to Disposition requires active negotiation context. Move through Negotiation first.";
    }
    if (!input.effectiveNextCallAt && !input.effectiveNextFollowUpAt) {
      return "Move to Disposition requires a next decision follow-up date. Set Next Action/Callback first.";
    }
  }

  return null;
}

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
      motivation_level,
      seller_timeline,
      condition_level,
      decision_maker_confirmed,
      price_expectation,
      qualification_route,
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
      || motivation_level !== undefined
      || seller_timeline !== undefined
      || condition_level !== undefined
      || decision_maker_confirmed !== undefined
      || price_expectation !== undefined
      || qualification_route !== undefined;

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
    const parsedQualificationRoute = parseOptionalEnum<QualificationRoute>(qualification_route, QUALIFICATION_ROUTES);

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
      .select("status, lock_version, notes, qualification_route, assigned_to, property_id, last_contact_at, total_calls, disposition_code, next_call_scheduled_at, next_follow_up_at")
      .eq("id", lead_id)
      .single();

    if (fetchErr || !currentLead) {
      return NextResponse.json({ error: "Lead not found", detail: fetchErr?.message }, { status: 404 });
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

    const effectiveNextFollowUpAt = parsedNextFollowUp.provided
      ? parsedNextFollowUp.iso
      : (plannedTask?.nextFollowUpAt ?? (parsedNextCall.provided ? parsedNextCall.iso : (currentLead.next_follow_up_at ?? null)));

    const hasContactEvidence =
      Boolean(currentLead.last_contact_at)
      || Number(currentLead.total_calls ?? 0) > 0
      || (typeof currentLead.disposition_code === "string" && currentLead.disposition_code.trim().length > 0);

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
        dispositionCode: typeof currentLead.disposition_code === "string" ? currentLead.disposition_code : null,
      });

      if (prereqError) {
        return NextResponse.json(
          { error: "Missing stage prerequisites", detail: prereqError },
          { status: 422 },
        );
      }
    }

    const finalStatus = targetStatus ?? currentStatus;

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

    const taskAssignee = effectiveAssignedTo ?? user.id;

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
    const { error, count } = await (sb.from("leads") as any)
      .update(updateData)
      .eq("id", lead_id)
      .eq("lock_version", expectedVersion);

    if (count === 0 && !error) {
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

    const qualificationMutation =
      parsedMotivation.provided
      || parsedTimeline.provided
      || parsedCondition.provided
      || decision_maker_confirmed !== undefined
      || parsedPriceExpectation.provided
      || parsedQualificationRoute.provided;

    const action = qualificationMutation
      ? (qualificationRouteChanged ? "QUALIFICATION_ROUTED" : "QUALIFICATION_UPDATED")
      : assigned_to !== undefined
        ? "CLAIMED"
        : statusChanged
          ? "STATUS_CHANGED"
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

    return NextResponse.json({
      success: true,
      lead_id,
      status: finalStatus,
      next_call_scheduled_at: parsedNextCall.provided ? parsedNextCall.iso : undefined,
      next_follow_up_at: parsedNextFollowUp.provided
        ? parsedNextFollowUp.iso
        : (plannedTask?.nextFollowUpAt ?? undefined),
      qualification_route: parsedQualificationRoute.provided ? parsedQualificationRoute.value : currentQualificationRoute,
      qualification_task_id: createdTaskId,
      escalation_review_only: plannedTask?.escalationReviewOnly === true,
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
        preEnrichedPropertyId === undefined; // fall through
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
      const mergedFlags: Record<string, unknown> = { ...existingFlags, enrichment_pending: true };
      if (!existingProp) mergedFlags.manual_entry = true;

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

    const tags = distress_tags ?? [];
    const baseScore = Math.min(30 + tags.length * 12, 100);
    const eqBonus = toFloat(equity_percent) ?? 0;
    const compositeScore = Math.min(Math.round(baseScore + (eqBonus as number) * 0.2), 100);

    const isAssigned = assign_to && assign_to !== "unassigned";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadRow: any = {
      property_id: property.id,
      status: isAssigned ? "lead" : "prospect",
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
        { error: "Internal server error" },
        { status: 500 }
      );
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
        address,
        owner: owner_name,
        score: compositeScore,
        assigned: isAssigned ? assign_to : "unassigned",
      },
    }).then(({ error: auditErr }: { error: unknown }) => {
      if (auditErr) console.error("[API/prospects POST] Audit log failed (non-fatal):", auditErr);
    });

    // If property was pre-enriched during preview, no need for cron.
    // Otherwise, enrichment cron picks it up every 15 min.

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      property_id: property.id,
      score: compositeScore,
      status: leadRow.status,
      enriched: alreadyEnriched,
      enrichment: alreadyEnriched
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
