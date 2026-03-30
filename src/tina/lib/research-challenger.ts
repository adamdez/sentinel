import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  type TinaAuthorityChallengeRunResult,
  type TinaAuthorityWorkItemView,
} from "@/tina/lib/authority-work";
import { classifyTinaResearchSource } from "@/tina/lib/research-policy";
import type { TinaResearchDossier } from "@/tina/lib/research-dossiers";
import {
  buildTinaResearchGroundingLines,
  getTinaResearchExecutionProfile,
  normalizeTinaStoredResearchMemo,
} from "@/tina/lib/research-runtime";
import { sanitizeTinaAiText, sanitizeTinaAiTextList } from "@/tina/lib/ai-text-normalization";
import {
  hasTinaContractorSignal,
  hasTinaFixedAssetSignal,
  hasTinaIdahoSignal,
  hasTinaInventorySignal,
  hasTinaPayrollSignal,
  hasTinaSalesTaxSignal,
} from "@/tina/lib/source-fact-signals";
import type { TinaWorkspaceDraft } from "@/tina/types";

const TINA_RESEARCH_CHALLENGE_MODEL =
  process.env.TINA_AI_MODEL_RESEARCH_CHALLENGE ??
  process.env.TINA_AI_MODEL_RESEARCH ??
  "gpt-5.4";

const TinaResearchChallengeSchema = z.object({
  summary: z.string().min(1).max(260),
  challengeMemo: z.string().min(1).max(12_000),
  verdict: z.enum(["survives", "needs_care", "likely_fails"]),
  needsDisclosure: z.boolean(),
  challengeWarnings: z.array(z.string().min(1).max(600)).max(6),
  challengeQuestions: z.array(z.string().min(1).max(600)).max(6),
  citations: z
    .array(
      z.object({
        title: z.string().min(1).max(180),
        url: z.string().min(1).max(500),
        effect: z.enum(["supports", "warns", "background"]),
        note: z.string().min(1).max(220),
      })
    )
    .max(6),
  missingAuthority: z.array(z.string().min(1).max(180)).max(6),
});

type TinaResearchChallengeParsed = z.infer<typeof TinaResearchChallengeSchema>;

function normalizeTinaChallengeShortLine(value: string, maxLength = 220): string {
  const normalized = sanitizeTinaAiText(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const clipped = normalized.slice(0, Math.max(maxLength - 3, 1)).trimEnd();
  return `${clipped}...`;
}

export function normalizeTinaChallengeShortList(values: string[], maxLength = 220): string[] {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeTinaChallengeShortLine(value, maxLength);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    normalizedValues.push(normalized);
  });

  return normalizedValues;
}

function buildChallengePrompt(
  draft: TinaWorkspaceDraft,
  dossier: TinaResearchDossier,
  workItem: TinaAuthorityWorkItemView
): string {
  const profile = draft.profile;
  const executionProfile = getTinaResearchExecutionProfile(dossier.id);
  const payrollDetected = hasTinaPayrollSignal(profile, draft.sourceFacts);
  const contractorDetected = hasTinaContractorSignal(profile, draft.sourceFacts);
  const inventoryDetected = hasTinaInventorySignal(profile, draft.sourceFacts);
  const fixedAssetDetected = hasTinaFixedAssetSignal(profile, draft.sourceFacts);
  const salesTaxDetected = hasTinaSalesTaxSignal(profile, draft.sourceFacts);
  const idahoDetected = hasTinaIdahoSignal(profile, draft.sourceFacts);
  const groundingLines = buildTinaResearchGroundingLines(draft, dossier);
  const facts = [
    `Business name: ${profile.businessName || "Unknown"}`,
    `Tax year: ${profile.taxYear || "Unknown"}`,
    `Entity type: ${profile.entityType}`,
    `LLC federal tax treatment: ${profile.llcFederalTaxTreatment}`,
    `LLC community-property spouse path: ${profile.llcCommunityPropertyStatus}`,
    `Accounting method: ${profile.accountingMethod}`,
    `Washington business: ${profile.formationState === "WA" ? "Yes" : `No, formed in ${profile.formationState || "Unknown"}`}`,
    `Payroll: ${payrollDetected ? "Yes" : "No"}`,
    `Contractors: ${contractorDetected ? "Yes" : "No"}`,
    `Inventory: ${inventoryDetected ? "Yes" : "No"}`,
    `Fixed assets: ${fixedAssetDetected ? "Yes" : "No"}`,
    `Sales tax: ${salesTaxDetected ? "Yes" : "No"}`,
    `Idaho activity: ${idahoDetected ? "Yes" : "No"}`,
  ];

  const citations =
    workItem.citations.length > 0
      ? workItem.citations
          .map(
            (citation) =>
              `- ${citation.title} (${citation.url || "no url"}) [${citation.sourceClass}] [${citation.effect}]`
          )
          .join("\n")
      : "None yet.";

  return [
    "You are Tina's adversarial tax reviewer.",
    "Your job is to pressure-test a possible tax advantage, not to help it survive.",
    "Search deeply for why the idea might fail, narrow fact-pattern fits, disclosure risk, contrary authority, audit traps, and factual assumptions that could break the position.",
    "You may use forums, community chatter, and secondary commentary to generate failure theories, but only primary authority should count as support or warning in the final analysis.",
    "Be skeptical, concrete, and plain-spoken.",
    "Stay tightly scoped to the saved business facts instead of surveying every possible edge case.",
    "If the idea still survives, explain why it survives despite the pressure test.",
    "If the idea is too weak or too fact-sensitive, say that clearly.",
    "Keep the challenge memo concise and comfortably under 7,000 characters. Keep warnings and reviewer questions short.",
    "Do not repeat the whole research memo. Focus on the 3 to 5 biggest failure theories.",
    "Do not put URLs, markdown links, or citation callouts inside the summary or challenge memo. Save every source link for the citations array only.",
    "",
    "Business facts:",
    ...facts,
    "",
    `Research idea: ${dossier.title}`,
    `Dossier summary: ${dossier.summary}`,
    `What Tina is trying to prove: ${workItem.memoFocus}`,
    `Reviewer question: ${workItem.reviewerQuestion}`,
    `Discovery prompt: ${dossier.discoveryPrompt}`,
    `Authority prompt: ${dossier.authorityPrompt}`,
    ...(executionProfile.scopeNote ? ["", `Scope note: ${executionProfile.scopeNote}`] : []),
    ...(groundingLines.length > 0 ? ["", "Saved-paper grounding:", ...groundingLines] : []),
    "",
    "Current Tina memo:",
    workItem.memo || "None yet.",
    "",
    "Current saved citations:",
    citations,
    "",
    "Try to break the idea. Then say whether it survives, needs care, or likely fails.",
  ].join("\n");
}

function normalizeChallengeMemo(summary: string, memo: string): string {
  return normalizeTinaStoredResearchMemo({ summary, memo });
}

function normalizeChallengeCitations(parsed: TinaResearchChallengeParsed) {
  return parsed.citations
    .map((citation) => {
      const classification = classifyTinaResearchSource(citation.url);
      const effect =
        classification.sourceClass !== "primary_authority" && citation.effect === "supports"
          ? "background"
          : citation.effect;

      return {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: sanitizeTinaAiText(citation.title),
        url: citation.url,
        sourceClass: classification.sourceClass,
        effect,
        note: sanitizeTinaAiText(citation.note),
      };
    })
    .filter((citation) => citation.title.trim().length > 0 && citation.url.trim().length > 0);
}

function deriveChallengeResult(args: {
  parsed: TinaResearchChallengeParsed;
  workItem: TinaAuthorityWorkItemView;
}): Omit<TinaAuthorityChallengeRunResult, "challengeMemo" | "challengeWarnings" | "challengeQuestions" | "citations" | "missingAuthority" | "lastChallengeRunAt"> {
  const combinedCitations = [...args.workItem.citations, ...normalizeChallengeCitations(args.parsed)];
  const hasPrimarySupport = combinedCitations.some(
    (citation) => citation.sourceClass === "primary_authority" && citation.effect === "supports"
  );

  if (args.parsed.verdict === "likely_fails") {
    return {
      challengeVerdict: "likely_fails",
      status: "rejected",
      reviewerDecision: "do_not_use",
      disclosureDecision: args.parsed.needsDisclosure ? "required" : "needs_review",
    };
  }

  if (args.parsed.verdict === "needs_care") {
    return {
      challengeVerdict: "needs_care",
      status: hasPrimarySupport ? "ready_for_reviewer" : "researching",
      reviewerDecision: hasPrimarySupport ? "pending" : "need_more_support",
      disclosureDecision: args.parsed.needsDisclosure ? "needs_review" : "unknown",
    };
  }

  return {
    challengeVerdict: "survives",
    status: hasPrimarySupport ? "ready_for_reviewer" : "researching",
    reviewerDecision: hasPrimarySupport ? "pending" : "need_more_support",
    disclosureDecision: args.parsed.needsDisclosure ? "needs_review" : "not_needed",
  };
}

export async function runTinaAuthorityChallenge(args: {
  draft: TinaWorkspaceDraft;
  dossier: TinaResearchDossier;
  workItem: TinaAuthorityWorkItemView;
}): Promise<TinaAuthorityChallengeRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Tina needs OPENAI_API_KEY before she can stress-test this idea.");
  }

  const client = new OpenAI({ apiKey });
  const executionProfile = getTinaResearchExecutionProfile(args.dossier.id);
  const prompt = buildChallengePrompt(args.draft, args.dossier, args.workItem);

  const response = await client.responses.parse(
    {
      model: TINA_RESEARCH_CHALLENGE_MODEL,
      reasoning: { effort: executionProfile.challengeReasoningEffort },
      tools: [{ type: "web_search_preview", search_context_size: executionProfile.searchContextSize }],
      include: ["web_search_call.action.sources"],
      text: {
        format: zodTextFormat(TinaResearchChallengeSchema, "tina_research_challenge"),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: [
        {
          role: "developer" as const,
          content: [
            {
              type: "input_text" as const,
              text: "Pressure-test this tax idea. Search broadly for failure theories, but only let primary authority count as final support or warning.",
            },
          ],
        },
        {
          role: "user" as const,
          content: [
            {
              type: "input_text" as const,
              text: prompt,
            },
          ],
        },
      ] as any,
    },
    {
      maxRetries: 0,
      timeout: executionProfile.challengeTimeoutMs,
    }
  );

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("Tina did not get a usable challenge result back.");
  }

  const citations = normalizeChallengeCitations(parsed);
  const derived = deriveChallengeResult({ parsed, workItem: args.workItem });
  const now = new Date().toISOString();

  return {
    ...derived,
    challengeMemo: normalizeChallengeMemo(parsed.summary, parsed.challengeMemo),
    challengeWarnings: normalizeTinaChallengeShortList(parsed.challengeWarnings),
    challengeQuestions: normalizeTinaChallengeShortList(parsed.challengeQuestions),
    citations,
    missingAuthority: sanitizeTinaAiTextList(parsed.missingAuthority),
    lastChallengeRunAt: now,
  };
}
