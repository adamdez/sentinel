import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  type TinaAuthorityResearchRunResult,
  type TinaAuthorityWorkItemView,
} from "@/tina/lib/authority-work";
import {
  classifyTinaResearchSource,
  evaluateTinaTaxIdea,
} from "@/tina/lib/research-policy";
import type { TinaResearchDossier } from "@/tina/lib/research-dossiers";
import type { TinaWorkspaceDraft } from "@/tina/types";

const TINA_RESEARCH_MODEL = process.env.TINA_AI_MODEL_RESEARCH ?? "gpt-5.4";

const TinaResearchRunSchema = z.object({
  summary: z.string().min(1).max(260),
  memo: z.string().min(1).max(2400),
  substantialAuthorityLikely: z.boolean(),
  reasonableBasisLikely: z.boolean(),
  needsDisclosure: z.boolean(),
  looksLikeTaxShelterOrReportableTransaction: z.boolean(),
  isFrivolous: z.boolean(),
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

type TinaResearchRunParsed = z.infer<typeof TinaResearchRunSchema>;

interface TinaCitationRollup {
  citations: ReturnType<typeof normalizeCitations>;
  hasPrimarySupport: boolean;
  hasPrimaryWarning: boolean;
}

const PRIMARY_AUTHORITY_CONFLICT_MESSAGE =
  "Primary authority appears conflicted (both support and warning signals). Human conflict resolution required before return impact.";

function buildResearchPrompt(
  draft: TinaWorkspaceDraft,
  dossier: TinaResearchDossier,
  workItem: TinaAuthorityWorkItemView
): string {
  const profile = draft.profile;
  const facts = [
    `Business name: ${profile.businessName || "Unknown"}`,
    `Tax year: ${profile.taxYear || "Unknown"}`,
    `Entity type: ${profile.entityType}`,
    `Accounting method: ${profile.accountingMethod}`,
    `Washington business: ${profile.formationState === "WA" ? "Yes" : `No, formed in ${profile.formationState || "Unknown"}`}`,
    `Payroll: ${profile.hasPayroll ? "Yes" : "No"}`,
    `Contractors: ${profile.paysContractors ? "Yes" : "No"}`,
    `Inventory: ${profile.hasInventory ? "Yes" : "No"}`,
    `Fixed assets: ${profile.hasFixedAssets ? "Yes" : "No"}`,
    `Sales tax: ${profile.collectsSalesTax ? "Yes" : "No"}`,
    `Idaho activity: ${profile.hasIdahoActivity ? "Yes" : "No"}`,
  ];

  const existingCitations =
    workItem.citations.length > 0
      ? workItem.citations
          .map((citation) => `- ${citation.title} (${citation.url || "no url"}) [${citation.sourceClass}]`)
          .join("\n")
      : "None yet.";

  const missingAuthority =
    workItem.missingAuthority.length > 0
      ? workItem.missingAuthority.map((item) => `- ${item}`).join("\n")
      : "None saved yet.";

  return [
    "You are Tina's tax-law research assistant for a business-tax preparation workflow.",
    "Search deeply and creatively for useful ideas, but do not confuse discovery with filing authority.",
    "You may inspect forums, community chatter, and secondary analysis for ideas.",
    "However, only primary authority should count as support for filing positions.",
    "Use plain language. Be concise but useful.",
    "If the support is weak, say so clearly.",
    "If disclosure may be needed, say so clearly.",
    "If the idea looks too risky or frivolous, say so clearly.",
    "Return only grounded sources you actually found.",
    "",
    "Business facts:",
    ...facts,
    "",
    `Research idea: ${dossier.title}`,
    `Idea summary: ${dossier.summary}`,
    `What Tina is trying to prove: ${workItem.memoFocus}`,
    `Reviewer question: ${workItem.reviewerQuestion}`,
    `Discovery prompt: ${dossier.discoveryPrompt}`,
    `Authority prompt: ${dossier.authorityPrompt}`,
    "",
    "Existing memo:",
    workItem.memo || "None yet.",
    "",
    "Existing citations:",
    existingCitations,
    "",
    "Missing authority list:",
    missingAuthority,
  ].join("\n");
}

function sanitizeResearchMemo(summary: string, memo: string): string {
  return `${summary}\n\n${memo}`.trim();
}

function toDisclosureDecision(parsed: TinaResearchRunParsed): TinaAuthorityResearchRunResult["disclosureDecision"] {
  if (!parsed.needsDisclosure) return "not_needed";
  return parsed.substantialAuthorityLikely ? "needs_review" : "required";
}

function toWorkStatus(bucket: ReturnType<typeof evaluateTinaTaxIdea>["bucket"]): TinaAuthorityResearchRunResult["status"] {
  switch (bucket) {
    case "authoritative_and_usable":
    case "usable_with_disclosure":
      return "ready_for_reviewer";
    case "reject":
      return "rejected";
    default:
      return "researching";
  }
}

function toReviewerDecision(bucket: ReturnType<typeof evaluateTinaTaxIdea>["bucket"]): TinaAuthorityResearchRunResult["reviewerDecision"] {
  switch (bucket) {
    case "reject":
      return "do_not_use";
    case "authoritative_and_usable":
    case "usable_with_disclosure":
      return "pending";
    default:
      return "need_more_support";
  }
}

function normalizeCitations(parsed: TinaResearchRunParsed) {
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
        title: citation.title,
        url: citation.url,
        sourceClass: classification.sourceClass,
        effect,
        note: citation.note,
      };
    })
    .filter((citation) => citation.title.trim().length > 0 && citation.url.trim().length > 0);
}

function rollupCitationSignals(parsed: TinaResearchRunParsed): TinaCitationRollup {
  const citations = normalizeCitations(parsed);
  const hasPrimarySupport = citations.some(
    (citation) => citation.sourceClass === "primary_authority" && citation.effect === "supports"
  );
  const hasPrimaryWarning = citations.some(
    (citation) => citation.sourceClass === "primary_authority" && citation.effect === "warns"
  );

  return {
    citations,
    hasPrimarySupport,
    hasPrimaryWarning,
  };
}

export async function runTinaAuthorityResearch(args: {
  draft: TinaWorkspaceDraft;
  dossier: TinaResearchDossier;
  workItem: TinaAuthorityWorkItemView;
}): Promise<TinaAuthorityResearchRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Tina needs OPENAI_API_KEY before she can run a live authority search.");
  }

  const client = new OpenAI({ apiKey });
  const prompt = buildResearchPrompt(args.draft, args.dossier, args.workItem);

  const response = await client.responses.parse({
    model: TINA_RESEARCH_MODEL,
    reasoning: { effort: "high" },
    tools: [{ type: "web_search_preview", search_context_size: "high" }],
    include: ["web_search_call.action.sources"],
    text: {
      format: zodTextFormat(TinaResearchRunSchema, "tina_research_run"),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: [
      {
        role: "developer" as const,
        content: [
          {
            type: "input_text" as const,
            text: "Research deeply. Use broad search for ideas, but only let primary authority count as filing support.",
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
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("Tina did not get a usable research result back.");
  }

  const rollup = rollupCitationSignals(parsed);
  const sourceClasses = rollup.citations.map((citation) => citation.sourceClass);
  const decision = evaluateTinaTaxIdea({
    sourceClasses,
    hasPrimaryAuthority: rollup.hasPrimarySupport,
    hasSubstantialAuthority: parsed.substantialAuthorityLikely,
    hasReasonableBasis: parsed.reasonableBasisLikely,
    needsDisclosure: parsed.needsDisclosure,
    isTaxShelterLike: parsed.looksLikeTaxShelterOrReportableTransaction,
    isFrivolous: parsed.isFrivolous,
  });

  const hasPrimaryConflict = rollup.hasPrimarySupport && rollup.hasPrimaryWarning;

  const missingAuthority = hasPrimaryConflict
    ? Array.from(
        new Set([
          ...parsed.missingAuthority,
          PRIMARY_AUTHORITY_CONFLICT_MESSAGE,
        ])
      )
    : parsed.missingAuthority;

  const status: TinaAuthorityResearchRunResult["status"] = hasPrimaryConflict
    ? "researching"
    : toWorkStatus(decision.bucket);

  const reviewerDecision: TinaAuthorityResearchRunResult["reviewerDecision"] = hasPrimaryConflict
    ? "need_more_support"
    : toReviewerDecision(decision.bucket);

  const now = new Date().toISOString();

  return {
    memo: sanitizeResearchMemo(parsed.summary, parsed.memo),
    citations: rollup.citations,
    missingAuthority,
    status,
    reviewerDecision,
    disclosureDecision: toDisclosureDecision(parsed),
    lastAiRunAt: now,
  };
}
