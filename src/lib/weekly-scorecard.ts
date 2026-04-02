import {
  computeFounderEffortFromCalls,
  computeJeffInfluenceSummary,
  isContractStatus,
  parseFounderUserIds,
} from "@/lib/analytics-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const JEFF_INFLUENCE_LOOKBACK_DAYS = 120;

const APPOINTMENT_DISPOSITIONS = new Set([
  "appointment",
  "appointment_set",
]);

const QUALIFIED_JEFF_INTERACTION_TYPES = new Set([
  "warm_transfer",
  "callback_request",
  "follow_up_needed",
  "transfer_failed",
]);

export type WeeklyMetricTrend = "up" | "down" | "flat";
export type WeeklyExceptionSeverity = "critical" | "high" | "medium" | "info";

interface TimeWindow {
  fromIso: string;
  toIso: string;
  fromMs: number;
  toMs: number;
}

interface CallRow {
  user_id: string | null;
  duration_sec: number | null;
  disposition: string | null;
  started_at: string | null;
}

interface OfferRow {
  offered_by: string | null;
  offered_at: string | null;
}

interface TaskRow {
  assigned_to: string | null;
  completed_at: string | null;
}

interface DealCreatedRow {
  id: string;
  lead_id: string | null;
  status: string | null;
  closed_at: string | null;
  created_at: string | null;
}

interface DealClosedRow {
  id: string;
  lead_id: string | null;
  assignment_fee: number | null;
  closed_at: string | null;
  created_at: string | null;
}

interface JeffInteractionRow {
  lead_id: string | null;
  interaction_type: string | null;
  created_at: string | null;
}

interface JeffWindowRow {
  interaction_type: string | null;
  created_at: string | null;
}

export interface WeeklyMetricDelta {
  current: number;
  previous: number;
  absolute: number;
  pct: number | null;
  trend: WeeklyMetricTrend;
}

export interface WeeklyOperatorWindowMetrics {
  calls: number;
  founderHoursEstimated: number;
  appointmentSignals: number;
  offersMade: number;
  tasksCompleted: number;
}

export interface WeeklyOperatorScore {
  userId: string;
  name: string;
  current: WeeklyOperatorWindowMetrics;
  previous: WeeklyOperatorWindowMetrics;
  deltas: {
    calls: WeeklyMetricDelta;
    founderHoursEstimated: WeeklyMetricDelta;
    appointmentSignals: WeeklyMetricDelta;
    offersMade: WeeklyMetricDelta;
    tasksCompleted: WeeklyMetricDelta;
  };
}

export interface WeeklyTeamWindowMetrics {
  windowStart: string;
  windowEnd: string;
  founderCallCount: number;
  founderHoursEstimated: number;
  qualifiedConversations: number;
  appointmentSignals: number;
  offersMade: number;
  contractsSigned: number;
  dealsClosed: number;
  totalRevenue: number;
  jeffInfluencedClosedDeals: number;
  jeffInfluencedRevenue: number;
  jeffInfluenceRatePct: number | null;
  contractsPerFounderHour: number | null;
  revenuePerFounderHour: number | null;
}

export interface WeeklyScorecardException {
  code: string;
  severity: WeeklyExceptionSeverity;
  message: string;
}

export interface WeeklyFounderScorecard {
  generatedAt: string;
  windowDays: number;
  founderScope: "configured" | "unscoped_fallback";
  founderIds: string[];
  currentWeek: WeeklyTeamWindowMetrics;
  previousWeek: WeeklyTeamWindowMetrics;
  deltas: {
    founderHoursEstimated: WeeklyMetricDelta;
    qualifiedConversations: WeeklyMetricDelta;
    appointmentSignals: WeeklyMetricDelta;
    offersMade: WeeklyMetricDelta;
    contractsSigned: WeeklyMetricDelta;
    dealsClosed: WeeklyMetricDelta;
    totalRevenue: WeeklyMetricDelta;
    jeffInfluenceRatePct: WeeklyMetricDelta;
    contractsPerFounderHour: WeeklyMetricDelta;
    revenuePerFounderHour: WeeklyMetricDelta;
  };
  operators: WeeklyOperatorScore[];
  exceptions: WeeklyScorecardException[];
}

function safeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function toWindow(from: Date, to: Date): TimeWindow {
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromMs: from.getTime(),
    toMs: to.getTime(),
  };
}

function withinWindow(iso: string | null | undefined, window: TimeWindow): boolean {
  const ms = safeMs(iso);
  return ms != null && ms >= window.fromMs && ms < window.toMs;
}

function toNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;
}

export function buildWeeklyMetricDelta(currentRaw: number | null, previousRaw: number | null): WeeklyMetricDelta {
  const current = toNumber(currentRaw);
  const previous = toNumber(previousRaw);
  const absolute = round1(current - previous);
  const pct = previous > 0 ? round1(((current - previous) / previous) * 100) : null;

  let trend: WeeklyMetricTrend = "flat";
  if (absolute > 0) trend = "up";
  else if (absolute < 0) trend = "down";

  return { current, previous, absolute, pct, trend };
}

function computeTeamWindowMetrics(input: {
  window: TimeWindow;
  founderCalls: CallRow[];
  dealsCreated: DealCreatedRow[];
  closedDeals: DealClosedRow[];
  offers: OfferRow[];
  jeffWindowRows: JeffWindowRow[];
  jeffInfluenceRows: JeffInteractionRow[];
}): WeeklyTeamWindowMetrics {
  const windowCalls = input.founderCalls.filter((row) => withinWindow(row.started_at, input.window));
  const founderEffort = computeFounderEffortFromCalls(
    windowCalls.map((row) => ({ duration_sec: row.duration_sec })),
    2,
  );

  const windowDealsCreated = input.dealsCreated.filter((row) => withinWindow(row.created_at, input.window));
  const windowClosedDeals = input.closedDeals.filter((row) => withinWindow(row.closed_at, input.window));
  const windowOffers = input.offers.filter((row) => withinWindow(row.offered_at, input.window));
  const windowJeffRows = input.jeffWindowRows.filter((row) => withinWindow(row.created_at, input.window));

  const qualifiedConversations = windowJeffRows.filter((row) => {
    const kind = normalizeKey(row.interaction_type);
    if (!kind) return false;
    if (QUALIFIED_JEFF_INTERACTION_TYPES.has(kind)) return true;
    return kind !== "fyi_only";
  }).length;

  const appointmentSignals = windowCalls.filter((row) => {
    const dispo = normalizeKey(row.disposition);
    return APPOINTMENT_DISPOSITIONS.has(dispo);
  }).length;

  const contractsSigned = windowDealsCreated.filter((row) => {
    return isContractStatus(row.status) || Boolean(row.closed_at);
  }).length;

  const dealsClosed = windowClosedDeals.length;
  const totalRevenue = windowClosedDeals.reduce((sum, row) => sum + toNumber(row.assignment_fee), 0);

  const jeffInfluence = computeJeffInfluenceSummary(
    windowClosedDeals.map((row) => ({
      lead_id: row.lead_id,
      assignment_fee: row.assignment_fee,
      closed_at: row.closed_at,
      created_at: row.created_at,
    })),
    input.jeffInfluenceRows,
    JEFF_INFLUENCE_LOOKBACK_DAYS,
  );

  const contractsPerFounderHour =
    founderEffort.founderHours > 0 ? round1(contractsSigned / founderEffort.founderHours) : null;
  const revenuePerFounderHour =
    founderEffort.founderHours > 0 ? Math.round(totalRevenue / founderEffort.founderHours) : null;

  return {
    windowStart: input.window.fromIso,
    windowEnd: input.window.toIso,
    founderCallCount: founderEffort.callCount,
    founderHoursEstimated: founderEffort.founderHours,
    qualifiedConversations,
    appointmentSignals,
    offersMade: windowOffers.length,
    contractsSigned,
    dealsClosed,
    totalRevenue,
    jeffInfluencedClosedDeals: jeffInfluence.influencedClosedDeals,
    jeffInfluencedRevenue: jeffInfluence.influencedRevenue,
    jeffInfluenceRatePct: jeffInfluence.influenceRatePct,
    contractsPerFounderHour,
    revenuePerFounderHour,
  };
}

function computeOperatorWindowMetrics(input: {
  userId: string;
  window: TimeWindow;
  founderCalls: CallRow[];
  offers: OfferRow[];
  tasks: TaskRow[];
}): WeeklyOperatorWindowMetrics {
  const calls = input.founderCalls.filter((row) => {
    return row.user_id === input.userId && withinWindow(row.started_at, input.window);
  });
  const founderEffort = computeFounderEffortFromCalls(
    calls.map((row) => ({ duration_sec: row.duration_sec })),
    2,
  );

  const appointmentSignals = calls.filter((row) => APPOINTMENT_DISPOSITIONS.has(normalizeKey(row.disposition))).length;
  const offersMade = input.offers.filter((row) => row.offered_by === input.userId && withinWindow(row.offered_at, input.window)).length;
  const tasksCompleted = input.tasks.filter((row) => row.assigned_to === input.userId && withinWindow(row.completed_at, input.window)).length;

  return {
    calls: calls.length,
    founderHoursEstimated: founderEffort.founderHours,
    appointmentSignals,
    offersMade,
    tasksCompleted,
  };
}

export function buildWeeklyScorecardExceptions(
  current: WeeklyTeamWindowMetrics,
  previous: WeeklyTeamWindowMetrics,
): WeeklyScorecardException[] {
  const exceptions: WeeklyScorecardException[] = [];
  const contractsPerHour = buildWeeklyMetricDelta(current.contractsPerFounderHour, previous.contractsPerFounderHour);
  const revenuePerHour = buildWeeklyMetricDelta(current.revenuePerFounderHour, previous.revenuePerFounderHour);
  const qualifiedDelta = buildWeeklyMetricDelta(current.qualifiedConversations, previous.qualifiedConversations);
  const appointmentDelta = buildWeeklyMetricDelta(current.appointmentSignals, previous.appointmentSignals);
  const offersDelta = buildWeeklyMetricDelta(current.offersMade, previous.offersMade);
  const contractsDelta = buildWeeklyMetricDelta(current.contractsSigned, previous.contractsSigned);
  const jeffInfluenceDelta = buildWeeklyMetricDelta(current.jeffInfluenceRatePct, previous.jeffInfluenceRatePct);

  if (contractsPerHour.pct != null && contractsPerHour.pct <= -20) {
    exceptions.push({
      code: "contracts_per_founder_hour_down",
      severity: "high",
      message: `Contracts per founder-hour fell ${Math.abs(contractsPerHour.pct)}% week-over-week.`,
    });
  }

  if (revenuePerHour.pct != null && revenuePerHour.pct <= -20) {
    exceptions.push({
      code: "revenue_per_founder_hour_down",
      severity: "high",
      message: `Revenue per founder-hour fell ${Math.abs(revenuePerHour.pct)}% week-over-week.`,
    });
  }

  if (
    current.founderHoursEstimated > previous.founderHoursEstimated &&
    current.contractsSigned <= previous.contractsSigned
  ) {
    exceptions.push({
      code: "founder_time_up_without_contract_lift",
      severity: "high",
      message: "Founder effort increased without a matching increase in contracts signed.",
    });
  }

  if (qualifiedDelta.pct != null && qualifiedDelta.pct <= -20) {
    exceptions.push({
      code: "qualified_conversations_down",
      severity: "medium",
      message: `Qualified Jeff conversations fell ${Math.abs(qualifiedDelta.pct)}% week-over-week.`,
    });
  }

  if (appointmentDelta.pct != null && appointmentDelta.pct <= -25) {
    exceptions.push({
      code: "appointment_signals_down",
      severity: "medium",
      message: `Appointment signals fell ${Math.abs(appointmentDelta.pct)}% week-over-week.`,
    });
  }

  if (offersDelta.pct != null && offersDelta.pct <= -25) {
    exceptions.push({
      code: "offers_down",
      severity: "medium",
      message: `Offers made fell ${Math.abs(offersDelta.pct)}% week-over-week.`,
    });
  }

  if (contractsDelta.current === 0 && current.founderHoursEstimated >= 10) {
    exceptions.push({
      code: "zero_contracts_with_high_effort",
      severity: "critical",
      message: "No contracts signed this week despite material founder effort.",
    });
  }

  if (current.dealsClosed > 0 && current.jeffInfluencedClosedDeals === 0) {
    exceptions.push({
      code: "zero_jeff_influence_on_closed",
      severity: "info",
      message: "Closed deals exist but none are currently Jeff-attributed.",
    });
  }

  if (jeffInfluenceDelta.pct != null && jeffInfluenceDelta.pct <= -15) {
    exceptions.push({
      code: "jeff_influence_rate_down",
      severity: "info",
      message: `Jeff influence rate fell ${Math.abs(jeffInfluenceDelta.pct)}% week-over-week.`,
    });
  }

  return exceptions;
}

function rankOperatorIds(input: { founderIds: string[]; calls: CallRow[]; offers: OfferRow[]; tasks: TaskRow[] }): string[] {
  if (input.founderIds.length > 0) return input.founderIds;

  const scoreByUser = new Map<string, number>();
  const bump = (userId: string | null | undefined, amount = 1) => {
    if (!userId) return;
    scoreByUser.set(userId, (scoreByUser.get(userId) ?? 0) + amount);
  };

  for (const row of input.calls) bump(row.user_id, 1);
  for (const row of input.offers) bump(row.offered_by, 3);
  for (const row of input.tasks) bump(row.assigned_to, 1);

  return Array.from(scoreByUser.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([userId]) => userId);
}

export async function getWeeklyFounderScorecard(options?: {
  now?: Date;
  windowDays?: number;
}): Promise<WeeklyFounderScorecard> {
  const { createServerClient } = await import("@/lib/supabase");
  const sb = createServerClient();
  const now = options?.now ?? new Date();
  const windowDays = Math.min(Math.max(options?.windowDays ?? 7, 3), 14);

  const currentFrom = new Date(now.getTime() - windowDays * DAY_MS);
  const previousFrom = new Date(currentFrom.getTime() - windowDays * DAY_MS);
  const currentWindow = toWindow(currentFrom, now);
  const previousWindow = toWindow(previousFrom, currentFrom);
  const allFromIso = previousWindow.fromIso;
  const allToIso = currentWindow.toIso;

  const founderIds = parseFounderUserIds(process.env.FOUNDER_USER_IDS);
  const founderScope: "configured" | "unscoped_fallback" =
    founderIds.length > 0 ? "configured" : "unscoped_fallback";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let founderCallsQuery = (sb.from("calls_log") as any)
    .select("user_id, duration_sec, disposition, started_at")
    .gte("started_at", allFromIso)
    .lt("started_at", allToIso);
  if (founderIds.length > 0) {
    founderCallsQuery = founderCallsQuery.in("user_id", founderIds);
  }
  const { data: founderCallsRaw } = await founderCallsQuery;
  const founderCalls = (founderCallsRaw ?? []) as CallRow[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let offersQuery = (sb.from("offers") as any)
    .select("offered_by, offered_at")
    .gte("offered_at", allFromIso)
    .lt("offered_at", allToIso);
  if (founderIds.length > 0) {
    offersQuery = offersQuery.in("offered_by", founderIds);
  }
  const { data: offersRaw } = await offersQuery;
  const offers = (offersRaw ?? []) as OfferRow[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tasksQuery = (sb.from("tasks") as any)
    .select("assigned_to, completed_at")
    .in("status", ["completed", "done"])
    .gte("completed_at", allFromIso)
    .lt("completed_at", allToIso);
  if (founderIds.length > 0) {
    tasksQuery = tasksQuery.in("assigned_to", founderIds);
  }
  const { data: tasksRaw } = await tasksQuery;
  const tasks = (tasksRaw ?? []) as TaskRow[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dealsCreatedRaw } = await (sb.from("deals") as any)
    .select("id, lead_id, status, closed_at, created_at")
    .gte("created_at", allFromIso)
    .lt("created_at", allToIso);
  const dealsCreated = (dealsCreatedRaw ?? []) as DealCreatedRow[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closedDealsRaw } = await (sb.from("deals") as any)
    .select("id, lead_id, assignment_fee, closed_at, created_at")
    .not("closed_at", "is", null)
    .gte("closed_at", allFromIso)
    .lt("closed_at", allToIso);
  const closedDeals = (closedDealsRaw ?? []) as DealClosedRow[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jeffWindowRaw } = await (sb.from("jeff_interactions") as any)
    .select("interaction_type, created_at")
    .gte("created_at", allFromIso)
    .lt("created_at", allToIso);
  const jeffWindowRows = (jeffWindowRaw ?? []) as JeffWindowRow[];

  const closedLeadIds = Array.from(
    new Set(
      closedDeals
        .map((row) => row.lead_id)
        .filter((leadId): leadId is string => typeof leadId === "string" && leadId.length > 0),
    ),
  );

  const jeffInfluenceFromIso = new Date(previousWindow.fromMs - JEFF_INFLUENCE_LOOKBACK_DAYS * DAY_MS).toISOString();
  const jeffInfluenceRows: JeffInteractionRow[] = [];
  if (closedLeadIds.length > 0) {
    for (let i = 0; i < closedLeadIds.length; i += 500) {
      const batch = closedLeadIds.slice(i, i + 500);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows } = await (sb.from("jeff_interactions") as any)
        .select("lead_id, interaction_type, created_at")
        .in("lead_id", batch)
        .gte("created_at", jeffInfluenceFromIso)
        .lt("created_at", allToIso);
      if (rows?.length) {
        jeffInfluenceRows.push(...(rows as JeffInteractionRow[]));
      }
    }
  }

  const currentWeek = computeTeamWindowMetrics({
    window: currentWindow,
    founderCalls,
    dealsCreated,
    closedDeals,
    offers,
    jeffWindowRows,
    jeffInfluenceRows,
  });

  const previousWeek = computeTeamWindowMetrics({
    window: previousWindow,
    founderCalls,
    dealsCreated,
    closedDeals,
    offers,
    jeffWindowRows,
    jeffInfluenceRows,
  });

  const operatorIds = rankOperatorIds({ founderIds, calls: founderCalls, offers, tasks });
  const profileMap = new Map<string, { full_name?: string | null; email?: string | null }>();
  if (operatorIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles } = await (sb.from("user_profiles") as any)
      .select("id, full_name, email")
      .in("id", operatorIds);
    for (const row of (profiles ?? []) as Array<{ id: string; full_name?: string | null; email?: string | null }>) {
      profileMap.set(row.id, { full_name: row.full_name ?? null, email: row.email ?? null });
    }
  }

  const operators: WeeklyOperatorScore[] = operatorIds.map((userId) => {
    const current = computeOperatorWindowMetrics({
      userId,
      window: currentWindow,
      founderCalls,
      offers,
      tasks,
    });
    const previous = computeOperatorWindowMetrics({
      userId,
      window: previousWindow,
      founderCalls,
      offers,
      tasks,
    });
    const profile = profileMap.get(userId);
    const name = profile?.full_name?.trim()
      || profile?.email?.trim()
      || userId.slice(0, 8);

    return {
      userId,
      name,
      current,
      previous,
      deltas: {
        calls: buildWeeklyMetricDelta(current.calls, previous.calls),
        founderHoursEstimated: buildWeeklyMetricDelta(current.founderHoursEstimated, previous.founderHoursEstimated),
        appointmentSignals: buildWeeklyMetricDelta(current.appointmentSignals, previous.appointmentSignals),
        offersMade: buildWeeklyMetricDelta(current.offersMade, previous.offersMade),
        tasksCompleted: buildWeeklyMetricDelta(current.tasksCompleted, previous.tasksCompleted),
      },
    };
  });

  const deltas = {
    founderHoursEstimated: buildWeeklyMetricDelta(currentWeek.founderHoursEstimated, previousWeek.founderHoursEstimated),
    qualifiedConversations: buildWeeklyMetricDelta(currentWeek.qualifiedConversations, previousWeek.qualifiedConversations),
    appointmentSignals: buildWeeklyMetricDelta(currentWeek.appointmentSignals, previousWeek.appointmentSignals),
    offersMade: buildWeeklyMetricDelta(currentWeek.offersMade, previousWeek.offersMade),
    contractsSigned: buildWeeklyMetricDelta(currentWeek.contractsSigned, previousWeek.contractsSigned),
    dealsClosed: buildWeeklyMetricDelta(currentWeek.dealsClosed, previousWeek.dealsClosed),
    totalRevenue: buildWeeklyMetricDelta(currentWeek.totalRevenue, previousWeek.totalRevenue),
    jeffInfluenceRatePct: buildWeeklyMetricDelta(currentWeek.jeffInfluenceRatePct, previousWeek.jeffInfluenceRatePct),
    contractsPerFounderHour: buildWeeklyMetricDelta(currentWeek.contractsPerFounderHour, previousWeek.contractsPerFounderHour),
    revenuePerFounderHour: buildWeeklyMetricDelta(currentWeek.revenuePerFounderHour, previousWeek.revenuePerFounderHour),
  };

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    founderScope,
    founderIds,
    currentWeek,
    previousWeek,
    deltas,
    operators,
    exceptions: buildWeeklyScorecardExceptions(currentWeek, previousWeek),
  };
}
