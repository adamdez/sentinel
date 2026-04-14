export type IntroRetryRound = 1 | 2 | 3;
export type IntroPendingAction = "retry_or_route" | "final_route" | null;

export const INTRO_SOP_ROUND_LIMITS: Record<IntroRetryRound, number> = {
  1: 3,
  2: 2,
  3: 1,
};

export const INTRO_SOP_MAX_DAY_COUNT = 6;
export const INTRO_SOP_RETRY_WAIT_DAYS = 14;

const INTRO_RETRY_PENDING_PREFIX = "intro_retry_pending:";

type IntroStateLike = {
  intro_sop_active?: boolean | null;
  intro_day_count?: number | null;
  intro_last_call_date?: string | null;
  intro_completed_at?: string | null;
  intro_exit_category?: string | null;
  intro_exit_reason?: string | null;
  next_action_due_at?: string | null;
  next_follow_up_at?: string | null;
};

export interface IntroSopDerivedState {
  intro_sop_active: boolean;
  intro_day_count: number;
  intro_last_call_date: string | null;
  intro_completed_at: string | null;
  intro_exit_category: string | null;
  intro_exit_reason: string | null;
  intro_retry_round: IntroRetryRound;
  intro_round_attempt_count: number;
  intro_round_attempt_limit: number;
  intro_retry_due_at: string | null;
  intro_retry_scheduled: boolean;
  intro_pending_action: IntroPendingAction;
  intro_pending_final_exit: boolean;
  requires_exit_category: boolean;
}

function clampDayCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(INTRO_SOP_MAX_DAY_COUNT, Math.floor(value)));
}

export function parseIntroRetryRound(reason: string | null | undefined): IntroRetryRound | null {
  if (typeof reason !== "string") return null;
  if (!reason.startsWith(INTRO_RETRY_PENDING_PREFIX)) return null;

  const round = Number(reason.slice(INTRO_RETRY_PENDING_PREFIX.length));
  return round === 2 || round === 3 ? round : null;
}

export function isIntroRetryPendingReason(reason: string | null | undefined): boolean {
  return parseIntroRetryRound(reason) !== null;
}

export function buildIntroRetryReason(round: IntroRetryRound): string {
  return `${INTRO_RETRY_PENDING_PREFIX}${round}`;
}

export function buildIntroRetryDueAt(now = new Date(), days = INTRO_SOP_RETRY_WAIT_DAYS): string {
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export function resolveIntroRetryRound(input: {
  dayCount: number;
  exitReason?: string | null;
}): IntroRetryRound {
  const pendingRound = parseIntroRetryRound(input.exitReason ?? null);
  if (pendingRound) return pendingRound;
  if (input.dayCount >= 6) return 3;
  if (input.dayCount >= 4) return 2;
  return 1;
}

export function resolveIntroRoundAttemptCount(input: {
  dayCount: number;
  round: IntroRetryRound;
}): number {
  if (input.round === 1) return Math.min(input.dayCount, INTRO_SOP_ROUND_LIMITS[1]);
  if (input.round === 2) return Math.max(0, Math.min(input.dayCount - 3, INTRO_SOP_ROUND_LIMITS[2]));
  return Math.max(0, Math.min(input.dayCount - 5, INTRO_SOP_ROUND_LIMITS[3]));
}

export function deriveIntroSopState(raw: IntroStateLike | null | undefined): IntroSopDerivedState {
  const dayCount = clampDayCount(raw?.intro_day_count);
  const introExitReason = typeof raw?.intro_exit_reason === "string" ? raw.intro_exit_reason : null;
  const round = resolveIntroRetryRound({
    dayCount,
    exitReason: introExitReason,
  });
  const attemptCount = resolveIntroRoundAttemptCount({
    dayCount,
    round,
  });
  const attemptLimit = INTRO_SOP_ROUND_LIMITS[round];
  const retryDueAt =
    typeof raw?.next_action_due_at === "string"
      ? raw.next_action_due_at
      : typeof raw?.next_follow_up_at === "string"
        ? raw.next_follow_up_at
        : null;
  const retryScheduled = isIntroRetryPendingReason(introExitReason);
  const pendingAction: IntroPendingAction =
    typeof raw?.intro_exit_category === "string" && raw.intro_exit_category.trim().length > 0
      ? null
      : round === 3 && attemptCount >= attemptLimit
        ? "final_route"
        : attemptCount >= attemptLimit
          ? "retry_or_route"
          : null;

  return {
    intro_sop_active: raw?.intro_sop_active !== false,
    intro_day_count: dayCount,
    intro_last_call_date: typeof raw?.intro_last_call_date === "string" ? raw.intro_last_call_date : null,
    intro_completed_at: typeof raw?.intro_completed_at === "string" ? raw.intro_completed_at : null,
    intro_exit_category: typeof raw?.intro_exit_category === "string" ? raw.intro_exit_category : null,
    intro_exit_reason: introExitReason,
    intro_retry_round: round,
    intro_round_attempt_count: attemptCount,
    intro_round_attempt_limit: attemptLimit,
    intro_retry_due_at: retryDueAt,
    intro_retry_scheduled: retryScheduled,
    intro_pending_action: pendingAction,
    intro_pending_final_exit: pendingAction === "final_route",
    requires_exit_category: pendingAction === "final_route",
  };
}

export function isIntroRetryHiddenUntilDue(raw: IntroStateLike | null | undefined, now = new Date()): boolean {
  const state = deriveIntroSopState(raw);
  if (!state.intro_retry_scheduled || !state.intro_retry_due_at) return false;

  const dueAt = new Date(state.intro_retry_due_at);
  if (Number.isNaN(dueAt.getTime())) return false;
  return dueAt.getTime() > now.getTime();
}
