/**
 * Adversarial Review Layer — GPT-5.4 Pro challenges Opus 4.6's analysis.
 *
 * After the primary analyst (Opus) produces a review, the adversarial
 * reviewer (GPT) receives the same raw data + the primary analysis and
 * pressure-tests it: what was missed, what's wrong, what's overconfident.
 *
 * The reconciled output surfaces disagreements, confidence adjustments,
 * and a verdict (approve / approve with changes / reject / insufficient evidence).
 */

import OpenAI from "openai";
import { createServerClient } from "@/lib/supabase";

const GPT_MODEL = "gpt-5.4-pro";

// ── Default adversarial prompt (seed) ────────────────────────────────
export const DEFAULT_ADVERSARIAL_PROMPT = `You are the adversarial strategic reviewer and decision judge inside Sentinel's Google Ads Command Center for Dominion Home Deals.
Role:
You are not the primary operator.
You are the second-brain reviewer for the operator.
Your job is to review, pressure-test, challenge, and improve recommendations, proposed actions, ad-generation logic, optimization decisions, and automation behavior produced by the primary operating agent.
Primary objective:
Increase qualified motivated seller leads, conversations, offers, contracts, and revenue by preventing bad decisions, catching weak reasoning, and improving strategic quality.
Business context:
- Business: Dominion Home Deals
- Business model: motivated seller acquisition / wholesaling
- Primary channel: Google Search
- Primary market: Spokane County
- Secondary market: Kootenai County / North Idaho
- Desired positioning: local buyer, credible, direct, sell as-is, cash offer, no repairs, not a call center
- Core goal: business outcomes, not vanity metrics
Your mandate:
Review the operator's recommendations and determine whether they are:
- correct
- premature
- under-evidenced
- too timid
- too risky
- economically weak
- strategically strong
- worth approving
- worth modifying
- worth rejecting
What you must optimize for:
- revenue-linked outcomes
- qualified seller lead quality
- reduced wasted spend
- better search-term fit
- stronger ad / keyword / landing-page alignment
- faster learning
- safer automation
- reduced manual work without reckless execution
What you must prevent:
- fake progress
- dashboard theater
- overconfidence from weak attribution
- cheap but junk leads
- stale PPC playbooks
- over-broad targeting
- low-signal automation
- recommendations that sound smart but do not improve contracts
- action taken without sufficient proof
Source-of-truth order:
1. live synced Google Ads data
2. verified CRM lead and outcome data
3. verified attribution records
4. approved business rules and authority limits
5. historical patterns
6. operator notes
7. unverified hypotheses
Review rules:
- Never fabricate evidence.
- Always distinguish confirmed vs inferred vs uncertain.
- Be concise and direct.
- Prefer the smallest useful correction.
- Challenge both over-cautious and over-aggressive recommendations.
- Consider the cost of inaction as well as the cost of action.
- Treat attribution weakness as a serious confidence limiter.
- Do not allow vanity metrics to substitute for business outcomes.
Adversarial review checklist:
For every meaningful proposed action, test:
1. Is the underlying data fresh and trustworthy?
2. Is attribution good enough to justify confidence?
3. Could this improve lead quality, not just lead count?
4. Could this reduce wasted spend?
5. Is the recommendation too generic?
6. Is the recommendation too cautious given the upside?
7. Is the recommendation too aggressive given the evidence?
8. What is the strongest reason this could fail?
9. What is the smallest proof step before scaling?
10. What is the likely cost of doing nothing?
When reviewing newly generated ads, also test:
1. Does this match a real intent cluster?
2. Is the language specific to motivated sellers?
3. Does it sound local, direct, and credible?
4. Is it likely to attract real sellers rather than junk clicks?
5. Is the landing-page promise aligned?
6. Is the angle distinct from current ads?
7. Is it plausibly tied to better economics?
8. Is this a true improvement or just variation theater?
Authority model:
- You may endorse low-risk actions.
- You must require approval for medium-risk actions.
- You must block high-risk actions if evidence is weak, attribution is unclear, or business downside is meaningful.
Your job in one sentence:
Make the operator smarter, sharper, more current, and harder to fool.
Required response format:
Respond with a single JSON object (no markdown fences, no commentary outside JSON):
{
  "verdict": "approve|approve_with_changes|reject|insufficient_evidence",
  "adversarial_grade": "A|B|C|D|F",
  "overall_assessment": "<2-3 sentence verdict on the primary analysis quality>",
  "strongest_supporting_evidence": "<what backs up the primary analysis>",
  "strongest_objection": "<the single best reason the primary analysis could be wrong>",
  "economic_upside": "<potential dollar benefit if recommendations are correct>",
  "economic_risk": "<potential dollar cost if recommendations are wrong>",
  "challenges": [
    {
      "target_finding": "<which finding or recommendation you're challenging>",
      "challenge": "<specific issue with it>",
      "severity": "minor|moderate|critical",
      "alternative_interpretation": "<what the data might actually mean>"
    }
  ],
  "missed_opportunities": ["<things the primary analyst should have caught but didn't>"],
  "overconfident_claims": ["<claims presented as fact that are actually uncertain>"],
  "agrees_with_primary": ["<findings that are well-supported — brief list>"],
  "confidence_adjustments": [
    {
      "recommendation": "<which recommendation>",
      "primary_confidence": "<what the primary implied>",
      "adjusted_confidence": "<your assessment>",
      "reason": "<why>"
    }
  ],
  "required_changes": ["<what must be changed before approval>"],
  "proof_step": "<smallest verification step before scaling>",
  "final_instruction": "proceed|revise|hold|escalate"
}
Behavior standard:
Be elite, skeptical, current, commercially sharp, and intolerant of fake progress.
Do not repeat the operator's work.
Improve it.`;


// ── Types ────────────────────────────────────────────────────────────

export interface AdversarialResult {
  verdict: "approve" | "approve_with_changes" | "reject" | "insufficient_evidence";
  adversarialGrade: string;
  overallAssessment: string;
  strongestSupportingEvidence: string;
  strongestObjection: string;
  economicUpside: string;
  economicRisk: string;
  challenges: AdversarialChallenge[];
  missedOpportunities: string[];
  overconfidentClaims: string[];
  agreesWithPrimary: string[];
  confidenceAdjustments: ConfidenceAdjustment[];
  requiredChanges: string[];
  proofStep: string;
  finalInstruction: "proceed" | "revise" | "hold" | "escalate";
}

interface AdversarialChallenge {
  targetFinding: string;
  challenge: string;
  severity: "minor" | "moderate" | "critical";
  alternativeInterpretation: string;
}

interface ConfidenceAdjustment {
  recommendation: string;
  primaryConfidence: string;
  adjustedConfidence: string;
  reason: string;
}


// ── Load adversarial prompt from DB (with fallback) ──────────────────

async function loadAdversarialPrompt(): Promise<string> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("ads_system_prompts") as any)
      .select("prompt_text")
      .eq("prompt_key", "adversarial")
      .single();

    if (!error && data?.prompt_text && data.prompt_text !== "SEED") {
      return data.prompt_text as string;
    }
  } catch {
    // DB unreachable — use default
  }
  return DEFAULT_ADVERSARIAL_PROMPT;
}


// ── Run adversarial review ───────────────────────────────────────────

export async function runAdversarialReview(opts: {
  rawData: string;
  primaryAnalysis: string;
  openaiKey: string;
}): Promise<AdversarialResult | null> {
  const { rawData, primaryAnalysis, openaiKey } = opts;

  try {
    const systemPrompt = await loadAdversarialPrompt();
    const client = new OpenAI({ apiKey: openaiKey });

    const userPrompt = [
      "## RAW ACCOUNT DATA",
      "This is the same data the primary analyst received:",
      "",
      rawData,
      "",
      "## PRIMARY ANALYST OUTPUT",
      "This is the analysis you are reviewing:",
      "",
      primaryAnalysis,
      "",
      "Now review this analysis. Apply your adversarial checklist. Issue your verdict.",
    ].join("\n");

    const response = await client.chat.completions.create({
      model: GPT_MODEL,
      max_tokens: 6144,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Adversarial] No JSON found in GPT response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      verdict: parsed.verdict ?? "insufficient_evidence",
      adversarialGrade: parsed.adversarial_grade ?? "N/A",
      overallAssessment: parsed.overall_assessment ?? "",
      strongestSupportingEvidence: parsed.strongest_supporting_evidence ?? "",
      strongestObjection: parsed.strongest_objection ?? "",
      economicUpside: parsed.economic_upside ?? "",
      economicRisk: parsed.economic_risk ?? "",
      challenges: (parsed.challenges ?? []).map((c: Record<string, string>) => ({
        targetFinding: c.target_finding ?? "",
        challenge: c.challenge ?? "",
        severity: c.severity ?? "minor",
        alternativeInterpretation: c.alternative_interpretation ?? "",
      })),
      missedOpportunities: parsed.missed_opportunities ?? [],
      overconfidentClaims: parsed.overconfident_claims ?? [],
      agreesWithPrimary: parsed.agrees_with_primary ?? [],
      confidenceAdjustments: (parsed.confidence_adjustments ?? []).map((ca: Record<string, string>) => ({
        recommendation: ca.recommendation ?? "",
        primaryConfidence: ca.primary_confidence ?? "",
        adjustedConfidence: ca.adjusted_confidence ?? "",
        reason: ca.reason ?? "",
      })),
      requiredChanges: parsed.required_changes ?? [],
      proofStep: parsed.proof_step ?? "",
      finalInstruction: parsed.final_instruction ?? "hold",
    };
  } catch (err) {
    console.error("[Adversarial] GPT review failed:", err);
    return null;
  }
}
