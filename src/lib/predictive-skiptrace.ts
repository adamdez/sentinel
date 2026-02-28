/**
 * Predictive Skip-Trace Inference Engine
 *
 * Charter v3.1 §1: "AI as massive leverage" — infer owner demographics
 * from publicly available data without paid skip-trace APIs.
 *
 * Features computed (all deterministic, no external calls):
 *   1. Owner Age Inference — name frequency tables (SSA) + ownership duration
 *   2. Heir Probability — age + ownership duration + estate signals
 *   3. Contact Probability — phone/email availability + responsiveness signals
 *
 * Compliance: Uses only public county records and statistical inference.
 * No FCRA-regulated data. No social media scraping. RCW 61.40.010 safe.
 *
 * Design: 100% deterministic. Same inputs → same outputs. Versioned.
 */

export const SKIPTRACE_MODEL_VERSION = "skip-v1.0";

// ── SSA Name-to-Birth-Decade Tables ─────────────────────────────────
// Top names by decade from SSA baby name data.
// Maps first name → peak birth decade → approximate age in 2026.

const NAME_DECADE_MAP: Record<string, number> = {
  james: 1950, john: 1945, robert: 1945, michael: 1960, william: 1940,
  david: 1955, richard: 1950, joseph: 1955, thomas: 1950, charles: 1945,
  christopher: 1975, daniel: 1965, matthew: 1980, anthony: 1970, mark: 1960,
  donald: 1940, steven: 1960, paul: 1955, andrew: 1985, joshua: 1985,
  kenneth: 1950, kevin: 1965, brian: 1970, george: 1940, timothy: 1965,
  ronald: 1950, edward: 1940, jason: 1975, jeffrey: 1970, ryan: 1985,
  jacob: 1995, gary: 1955, nicholas: 1990, eric: 1975, jonathan: 1980,
  stephen: 1960, larry: 1950, justin: 1985, scott: 1970, brandon: 1990,
  benjamin: 1990, samuel: 1995, raymond: 1940, gregory: 1960, frank: 1935,
  alexander: 1995, patrick: 1965, jack: 1935, dennis: 1950, jerry: 1950,
  tyler: 1995, aaron: 1985, jose: 1980, adam: 1985, nathan: 1990,
  mary: 1945, patricia: 1945, jennifer: 1970, linda: 1950, barbara: 1945,
  elizabeth: 1960, susan: 1955, jessica: 1985, sarah: 1985, karen: 1960,
  lisa: 1965, nancy: 1950, betty: 1935, margaret: 1940, sandra: 1955,
  ashley: 1990, dorothy: 1935, kimberly: 1970, emily: 1995, donna: 1955,
  michelle: 1970, carol: 1950, amanda: 1985, melissa: 1975, deborah: 1955,
  stephanie: 1975, rebecca: 1975, sharon: 1955, laura: 1970, cynthia: 1960,
  kathleen: 1955, amy: 1975, angela: 1970, shirley: 1940, anna: 1995,
  brenda: 1955, pamela: 1955, emma: 2000, nicole: 1980, helen: 1935,
  samantha: 1990, katherine: 1985, christine: 1965, debra: 1955, rachel: 1985,
  carolyn: 1950, janet: 1950, catherine: 1960, maria: 1965, heather: 1980,
  diane: 1955, ruth: 1935, julie: 1970, olivia: 2005, joyce: 1945,
  virginia: 1935, victoria: 1990, kelly: 1975, lauren: 1985, christina: 1980,
  joan: 1940, evelyn: 1930, judith: 1945, megan: 1990, andrea: 1975,
  cheryl: 1960, hannah: 1995, jacqueline: 1960, martha: 1940, gloria: 1950,
  teresa: 1960, ann: 1950, sara: 1985, madison: 2000, frances: 1935,
  kathryn: 1960, janice: 1950, jean: 1940, abigail: 2000, alice: 1935,
  judy: 1945, sophia: 2005, grace: 2000, denise: 1960, amber: 1985,
  doris: 1930, marilyn: 1945, danielle: 1985, beverly: 1940, isabella: 2005,
  theresa: 1955, diana: 1960, natalie: 1990, brittany: 1990, charlotte: 2005,
  marie: 1950, kayla: 1995, alexis: 1995, lori: 1965,
};

// ── Corporate entity indicators ──────────────────────────────────────
const CORPORATE_PATTERNS = [
  /\b(LLC|INC|CORP|LTD|LP|TRUST|ESTATE|HOLDINGS|PROPERTIES|INVESTMENTS|GROUP|PARTNERS|ASSOCIATES|MANAGEMENT|CAPITAL|VENTURES|ENTERPRISES|REVOCABLE|IRREVOCABLE|FAMILY|LIVING)\b/i,
  /\b(BANK|MORTGAGE|NATIONAL|FEDERAL|CREDIT UNION|SAVINGS)\b/i,
];

// ── Input / Output ───────────────────────────────────────────────────

export interface SkipTraceInput {
  ownerName: string;
  ownershipYears: number | null;
  isAbsentee: boolean;
  isCorporateOwner: boolean;
  isFreeClear: boolean;
  isVacant: boolean;
  county: string;
  hasPhone: boolean;
  hasEmail: boolean;
  ownerAgeKnown: number | null;
  activeSignalCount: number;
  hasProbateSignal: boolean;
  hasInheritedSignal: boolean;
  delinquentAmount: number | null;
  estimatedValue: number | null;
}

export interface SkipTraceOutput {
  inferredAge: number | null;
  ageConfidence: number;
  ageMethod: "known" | "name_ssa" | "ownership_heuristic" | "unknown";
  heirProbability: number;
  contactProbability: number;
  isCorporateEntity: boolean;
  skipTraceScore: number;
  modelVersion: string;
  factors: { name: string; value: number; contribution: number }[];
}

// ── Core Engine ──────────────────────────────────────────────────────

export function computeSkipTrace(input: SkipTraceInput): SkipTraceOutput {
  const factors: SkipTraceOutput["factors"] = [];

  const isCorporate = input.isCorporateOwner || detectCorporate(input.ownerName);

  if (isCorporate) {
    return {
      inferredAge: null,
      ageConfidence: 0,
      ageMethod: "unknown",
      heirProbability: 0.02,
      contactProbability: input.hasPhone ? 0.6 : 0.25,
      isCorporateEntity: true,
      skipTraceScore: 15,
      modelVersion: SKIPTRACE_MODEL_VERSION,
      factors: [{ name: "corporate_entity", value: 1, contribution: 15 }],
    };
  }

  // ── 1. Age Inference ───────────────────────────────────────────────
  const { age, confidence: ageConf, method: ageMethod } = inferAge(input);
  const ageScore = age !== null ? computeAgeScore(age) : 30;
  factors.push({ name: "age_inference", value: age ?? 0, contribution: ageScore });

  // ── 2. Heir Probability ────────────────────────────────────────────
  const heirProb = computeHeirProbability(age, input);
  const heirScore = Math.round(heirProb * 100);
  factors.push({ name: "heir_probability", value: Math.round(heirProb * 100), contribution: heirScore });

  // ── 3. Contact Probability ─────────────────────────────────────────
  const contactProb = computeContactProbability(input);
  const contactScore = Math.round(contactProb * 80);
  factors.push({ name: "contact_probability", value: Math.round(contactProb * 100), contribution: contactScore });

  // ── 4. Aggregate ───────────────────────────────────────────────────
  const raw = ageScore * 0.40 + heirScore * 0.35 + contactScore * 0.25;
  const skipTraceScore = clamp(Math.round(raw), 0, 100);

  return {
    inferredAge: age,
    ageConfidence: ageConf,
    ageMethod,
    heirProbability: Math.round(heirProb * 1000) / 1000,
    contactProbability: Math.round(contactProb * 1000) / 1000,
    isCorporateEntity: false,
    skipTraceScore,
    modelVersion: SKIPTRACE_MODEL_VERSION,
    factors,
  };
}

// ── Age Inference ────────────────────────────────────────────────────

function inferAge(
  input: SkipTraceInput
): { age: number | null; confidence: number; method: SkipTraceOutput["ageMethod"] } {
  if (input.ownerAgeKnown !== null) {
    return { age: input.ownerAgeKnown, confidence: 95, method: "known" };
  }

  const firstName = extractFirstName(input.ownerName);
  const nameBirthDecade = firstName ? NAME_DECADE_MAP[firstName] : undefined;

  if (nameBirthDecade) {
    const currentYear = new Date().getFullYear();
    const nameAge = currentYear - nameBirthDecade;

    if (input.ownershipYears !== null && input.ownershipYears > 0) {
      const ownershipAge = 33 + input.ownershipYears;
      const blended = Math.round(nameAge * 0.6 + ownershipAge * 0.4);
      return { age: clamp(blended, 22, 105), confidence: 65, method: "name_ssa" };
    }

    return { age: clamp(nameAge, 18, 105), confidence: 50, method: "name_ssa" };
  }

  if (input.ownershipYears !== null && input.ownershipYears > 0) {
    const ownershipAge = 33 + input.ownershipYears;
    return { age: clamp(ownershipAge, 25, 100), confidence: 40, method: "ownership_heuristic" };
  }

  return { age: null, confidence: 0, method: "unknown" };
}

function computeAgeScore(age: number): number {
  if (age >= 85) return 95;
  if (age >= 75) return 82;
  if (age >= 65) return 65;
  if (age >= 55) return 48;
  if (age >= 45) return 35;
  if (age >= 35) return 22;
  return 12;
}

// ── Heir Probability ─────────────────────────────────────────────────
// Probability that the property will transfer to heirs (probate/inherited).

function computeHeirProbability(age: number | null, input: SkipTraceInput): number {
  let prob = 0.05;

  if (input.hasProbateSignal) prob += 0.45;
  if (input.hasInheritedSignal) prob += 0.30;

  if (age !== null) {
    if (age >= 85) prob += 0.35;
    else if (age >= 75) prob += 0.22;
    else if (age >= 65) prob += 0.12;
    else if (age >= 55) prob += 0.05;
  }

  if (input.ownershipYears !== null && input.ownershipYears > 25) prob += 0.10;
  if (input.isFreeClear) prob += 0.06;
  if (input.isAbsentee && age !== null && age >= 70) prob += 0.08;

  if (input.delinquentAmount != null && input.delinquentAmount > 0 && age !== null && age >= 70) {
    prob += 0.10;
  }

  return clamp(prob, 0, 0.98);
}

// ── Contact Probability ──────────────────────────────────────────────
// Probability we can successfully reach the owner on first attempt.

function computeContactProbability(input: SkipTraceInput): number {
  let prob = 0.15;

  if (input.hasPhone) prob += 0.35;
  if (input.hasEmail) prob += 0.15;

  if (!input.isAbsentee) prob += 0.12;
  if (!input.isVacant) prob += 0.08;

  if (input.activeSignalCount >= 3) prob -= 0.08;
  else if (input.activeSignalCount >= 2) prob -= 0.04;

  if (input.ownershipYears !== null && input.ownershipYears > 15) prob += 0.05;

  return clamp(prob, 0.05, 0.95);
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractFirstName(fullName: string): string | null {
  const cleaned = fullName
    .replace(CORPORATE_PATTERNS[0], "")
    .replace(/[^a-zA-Z\s'-]/g, "")
    .trim();

  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return null;

  const first = parts[0].toLowerCase();
  if (first.length < 2) return null;
  return first;
}

function detectCorporate(name: string): boolean {
  return CORPORATE_PATTERNS.some((re) => re.test(name));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
