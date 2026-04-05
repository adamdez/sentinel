export type TinaDiagnosticHypothesisConfidence = "high" | "medium" | "low";

export interface TinaDiagnosticHypothesisRankingInput {
  whyPlausible: string[];
  whatCouldChange: string[];
  requiredProof: string[];
  baseScore?: number;
}

export interface TinaDiagnosticHypothesisRankingResult {
  confidence: TinaDiagnosticHypothesisConfidence;
  stabilityScore: number;
  supportingSignalCount: number;
  contradictingSignalCount: number;
  recommendedFirstQuestion: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickRecommendedFirstQuestion(input: TinaDiagnosticHypothesisRankingInput): string | null {
  if (input.requiredProof[0]) {
    return input.requiredProof[0];
  }

  if (input.whatCouldChange[0]) {
    return input.whatCouldChange[0];
  }

  return input.whyPlausible[0] ?? null;
}

export function rankDiagnosticHypothesis(
  input: TinaDiagnosticHypothesisRankingInput
): TinaDiagnosticHypothesisRankingResult {
  const supportingSignalCount = input.whyPlausible.length;
  const contradictingSignalCount = input.whatCouldChange.length;
  const proofCount = input.requiredProof.length;
  const baseScore = input.baseScore ?? 50;
  const stabilityScore = clamp(
    baseScore +
      Math.min(supportingSignalCount, 4) * 12 -
      Math.min(contradictingSignalCount, 4) * 11 -
      Math.min(proofCount, 4) * 6,
    5,
    95
  );

  const confidence: TinaDiagnosticHypothesisConfidence =
    stabilityScore >= 68
      ? "high"
      : stabilityScore >= 42
        ? "medium"
        : "low";

  return {
    confidence,
    stabilityScore,
    supportingSignalCount,
    contradictingSignalCount,
    recommendedFirstQuestion: pickRecommendedFirstQuestion(input),
  };
}
