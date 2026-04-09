import { buildTinaReviewDeliveryReport } from "@/tina/lib/review-delivery";
import { buildTinaScheduleCScenarioProfile } from "@/tina/lib/schedule-c-scenario-profile";
import type { TinaWorkspaceDraft } from "@/tina/types";

export type TinaGuidedShellStatus = "blocked" | "needs_input" | "ready_to_send";

export interface TinaGuidedShellFact {
  label: string;
  value: string;
}

export interface TinaGuidedShellItem {
  id: string;
  title: string;
  summary: string;
}

export interface TinaGuidedShellContract {
  status: TinaGuidedShellStatus;
  summary: string;
  nextStep: string;
  needsNow: TinaGuidedShellItem[];
  knownNow: TinaGuidedShellFact[];
  blocked: TinaGuidedShellItem[];
  humanQuestions: TinaGuidedShellItem[];
  safeToSendToCpa: boolean;
}

function buildKnownNow(draft: TinaWorkspaceDraft): TinaGuidedShellFact[] {
  const facts: TinaGuidedShellFact[] = [];

  if (draft.profile.businessName.trim().length > 0) {
    facts.push({ label: "Business", value: draft.profile.businessName.trim() });
  }

  if (draft.profile.taxYear.trim().length > 0) {
    facts.push({ label: "Tax year", value: draft.profile.taxYear.trim() });
  }

  if (draft.profile.entityType !== "unsure") {
    facts.push({
      label: "Business type",
      value: draft.profile.entityType.replace(/_/g, " "),
    });
  }

  if (draft.priorReturnDocumentId || draft.priorReturn) {
    facts.push({ label: "Last year's return", value: "Saved" });
  }

  if (draft.documents.length > 0) {
    facts.push({ label: "Saved papers", value: `${draft.documents.length}` });
  }

  const readyFields = draft.scheduleCDraft.fields.filter((field) => field.status === "ready");
  if (readyFields.length > 0) {
    facts.push({
      label: "Draft boxes Tina supports",
      value: `${readyFields.length}`,
    });
  }

  return facts;
}

export function buildTinaGuidedShellContract(
  draft: TinaWorkspaceDraft
): TinaGuidedShellContract {
  const reviewDelivery = buildTinaReviewDeliveryReport(draft);
  const scenarioProfile = buildTinaScheduleCScenarioProfile(draft);

  const blocked = draft.packageReadiness.items
    .filter((item) => item.severity === "blocking")
    .slice(0, 4)
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
    }));

  const needsNow: TinaGuidedShellItem[] = [];

  if (!draft.priorReturnDocumentId && !draft.priorReturn) {
    needsNow.push({
      id: "guided-prior-return",
      title: "Add last year's return",
      summary: "Tina can move faster when last year's return is saved first.",
    });
  }

  if (draft.profile.entityType === "unsure") {
    needsNow.push({
      id: "guided-entity-type",
      title: "Answer what kind of business this is",
      summary: "Tina still needs the basic business type before she can trust the return path.",
    });
  }

  if (draft.documents.length === 0) {
    needsNow.push({
      id: "guided-papers",
      title: "Bring in the business papers",
      summary: "Tina still needs the working papers or ledger exports for the current tax year.",
    });
  }

  if (scenarioProfile.signals.length > 0) {
    needsNow.push({
      id: "guided-scenarios",
      title: "Keep the hard scenarios visible",
      summary: scenarioProfile.summary,
    });
  }

  const humanQuestions = [
    ...draft.bootstrapReview.items
      .filter((item) => item.status === "open")
      .slice(0, 2)
      .map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
      })),
    ...draft.scheduleCDraft.notes
      .filter((note) => note.severity === "needs_attention")
      .slice(0, 3)
      .map((note) => ({
        id: note.id,
        title: note.title,
        summary: note.summary,
      })),
  ].slice(0, 5);

  const status: TinaGuidedShellStatus =
    reviewDelivery.status === "blocked"
      ? "blocked"
      : reviewDelivery.status === "ready_to_send"
        ? "ready_to_send"
        : "needs_input";

  return {
    status,
    summary:
      status === "blocked"
        ? "Tina still has a few true blockers before the packet should leave the workspace."
        : status === "ready_to_send"
          ? "Tina has a clean packet that is safe to send to a CPA reviewer."
          : "Tina is moving, but she still needs a few human answers or final checks.",
    nextStep:
      needsNow[0]?.title ??
      humanQuestions[0]?.title ??
      reviewDelivery.nextStep,
    needsNow: needsNow.slice(0, 4),
    knownNow: buildKnownNow(draft).slice(0, 6),
    blocked,
    humanQuestions,
    safeToSendToCpa: reviewDelivery.status === "ready_to_send",
  };
}
