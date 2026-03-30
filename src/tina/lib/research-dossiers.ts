import { buildTinaResearchIdeas, type TinaTaxIdeaLead } from "@/tina/lib/research-ideas";
import type { TinaWorkspaceDraft } from "@/tina/types";

export type TinaResearchDossierStatus =
  | "needs_primary_authority"
  | "needs_disclosure_review"
  | "review_ready"
  | "rejected";

export type TinaResearchStepStatus = "done" | "ready" | "waiting";

export interface TinaResearchChecklistStep {
  id: string;
  label: string;
  status: TinaResearchStepStatus;
  reason: string;
}

export interface TinaResearchDossier {
  id: string;
  title: string;
  status: TinaResearchDossierStatus;
  summary: string;
  nextStep: string;
  authorityPrompt: string;
  discoveryPrompt: string;
  steps: TinaResearchChecklistStep[];
  documentIds: string[];
  factIds: string[];
}

function buildSteps(idea: TinaTaxIdeaLead): TinaResearchChecklistStep[] {
  const hasGroundingSignals = idea.sourceLabels.length > 0 || idea.factIds.length > 0 || idea.documentIds.length > 0;
  const authorityReady =
    idea.decisionBucket === "authoritative_and_usable" ||
    idea.decisionBucket === "usable_with_disclosure";
  const disclosureNeeded = idea.decisionBucket === "usable_with_disclosure";
  const rejected = idea.decisionBucket === "reject";

  return [
    {
      id: "facts",
      label: "Match the idea to this business",
      status: hasGroundingSignals ? "done" : "ready",
      reason: hasGroundingSignals
        ? "Tina already has facts or papers that make this idea worth checking."
        : "Tina still needs clearer business facts before this idea is worth deeper work.",
    },
    {
      id: "authority",
      label: "Find primary authority",
      status: authorityReady ? "done" : rejected ? "waiting" : "ready",
      reason: authorityReady
        ? "Tina has enough primary authority to move past idea stage."
        : rejected
          ? "Tina should not spend more authority work here unless new facts change the picture."
          : "Tina still needs IRS, Washington DOR, statute, regulation, or court support before this idea can touch the return.",
    },
    {
      id: "disclosure",
      label: "Check disclosure and edge risk",
      status:
        idea.decisionBucket === "authoritative_and_usable"
          ? "done"
          : disclosureNeeded
            ? "ready"
            : rejected
              ? "waiting"
              : "waiting",
      reason:
        idea.decisionBucket === "authoritative_and_usable"
          ? "Tina does not currently see a special disclosure path blocking this idea."
          : disclosureNeeded
            ? "This idea may still work, but only if disclosure handling and risk review are done carefully."
            : rejected
              ? "Rejected ideas should not move into disclosure handling."
              : "Disclosure review only starts after Tina finds real authority support.",
    },
    {
      id: "filing",
      label: "Decide whether it can affect the return",
      status:
        idea.decisionBucket === "authoritative_and_usable" ||
        idea.decisionBucket === "usable_with_disclosure"
          ? "ready"
          : rejected
            ? "waiting"
            : "waiting",
      reason:
        idea.decisionBucket === "authoritative_and_usable"
          ? "This idea can move into human review for filing use."
          : idea.decisionBucket === "usable_with_disclosure"
            ? "This idea can only move forward after human review and disclosure handling."
            : rejected
              ? "This idea should stay out of the return."
              : "This idea is still research-only and cannot change the return yet.",
    },
  ];
}

export function buildTinaResearchDossierFromIdea(idea: TinaTaxIdeaLead): TinaResearchDossier {
  const status: TinaResearchDossierStatus =
    idea.decisionBucket === "authoritative_and_usable"
      ? "review_ready"
      : idea.decisionBucket === "usable_with_disclosure"
        ? "needs_disclosure_review"
        : idea.decisionBucket === "reject"
          ? "rejected"
          : "needs_primary_authority";

  const summary =
    idea.decisionBucket === "authoritative_and_usable"
      ? "Tina has enough support for a reviewer to decide whether this should affect the federal return or filing packet."
      : idea.decisionBucket === "usable_with_disclosure"
        ? "Tina may be able to use this idea, but only with disclosure-level review before it touches the federal package."
        : idea.decisionBucket === "reject"
          ? "Tina should keep this idea out of the federal return unless new authority changes the analysis."
          : "Tina still needs primary authority before this idea can move beyond research and affect the federal package.";

  return {
    id: idea.id,
    title: idea.title,
    status,
    summary,
    nextStep: idea.nextStep,
    discoveryPrompt: idea.searchPrompt,
    authorityPrompt: `${idea.searchPrompt} Use primary authority only, explain whether disclosure is needed, and state whether this idea should stay out of the federal return. If a point matters only to a separate state filing, label it as a reviewer note instead of treating it like a federal return position.`,
    steps: buildSteps(idea),
    documentIds: idea.documentIds,
    factIds: idea.factIds,
  };
}

export function buildTinaResearchDossiers(draft: TinaWorkspaceDraft): TinaResearchDossier[] {
  return buildTinaResearchIdeas(draft).map((idea) => buildTinaResearchDossierFromIdea(idea));
}
