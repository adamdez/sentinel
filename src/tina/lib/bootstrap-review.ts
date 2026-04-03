import { buildTinaChecklist } from "@/tina/lib/checklist";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaBootstrapFact,
  TinaBootstrapReview,
  TinaChecklistItem,
  TinaReviewItem,
  TinaReviewSeverity,
  TinaWorkspaceDraft,
} from "@/tina/types";

export function createDefaultTinaBootstrapReview(): TinaBootstrapReview {
  return {
    lastRunAt: null,
    profileFingerprint: null,
    status: "idle",
    summary: "Tina has not checked your setup yet.",
    nextStep: "When you are ready, ask Tina to check what she already knows.",
    facts: [],
    items: [],
  };
}

function buildFact(id: string, label: string, value: string, source: TinaBootstrapFact["source"]): TinaBootstrapFact {
  return {
    id,
    label,
    value,
    source,
    status: source === "prior_return" ? "review" : "ready",
  };
}

function toIssueFromChecklistItem(item: TinaChecklistItem): TinaReviewItem {
  const severity: TinaReviewSeverity =
    item.priority === "required"
      ? "needs_attention"
      : item.priority === "recommended"
        ? "watch"
        : "watch";

  return {
    id: `request-${item.id}`,
    title: item.label,
    summary: item.reason,
    severity,
    status: "open",
    category: "setup",
    requestId: item.id,
    documentId: null,
    factId: null,
  };
}

function buildSummary(items: TinaReviewItem[]): { summary: string; nextStep: string } {
  const blockingCount = items.filter((item) => item.severity === "blocking").length;
  const attentionCount = items.filter((item) => item.severity === "needs_attention").length;
  const watchCount = items.filter((item) => item.severity === "watch").length;

  if (blockingCount > 0) {
    return {
      summary: `Tina found ${blockingCount} thing${blockingCount === 1 ? "" : "s"} that must be fixed before she can safely move ahead.`,
      nextStep: "Start with the blocking items first. Tina is stopping there instead of guessing.",
    };
  }

  if (attentionCount > 0) {
    return {
      summary: `Tina can keep moving, but she still needs ${attentionCount} important paper${attentionCount === 1 ? "" : "s"} or answer${attentionCount === 1 ? "" : "s"}.`,
      nextStep: "Bring the important papers next so Tina can keep building your tax package.",
    };
  }

  if (watchCount > 0) {
    return {
      summary: `Tina has the basics and only sees ${watchCount} smaller follow-up item${watchCount === 1 ? "" : "s"} right now.`,
      nextStep: "You can keep going. Tina will keep these smaller follow-ups on her list.",
    };
  }

  return {
    summary: "Nice work. Tina has enough of the basics to move to the next step.",
    nextStep: "Keep adding your papers and Tina can start the deeper tax prep work next.",
  };
}

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function markTinaBootstrapReviewStale(review: TinaBootstrapReview): TinaBootstrapReview {
  if (review.status === "idle" || review.status === "stale") return review;
  return {
    ...review,
    status: "stale",
    summary: "Your answers changed, so Tina should check this setup again.",
    nextStep: "Ask Tina to check your setup one more time so the review stays current.",
  };
}

export function buildTinaBootstrapReview(draft: TinaWorkspaceDraft): TinaBootstrapReview {
  const profileFingerprint = buildTinaProfileFingerprint(draft.profile);
  const priorReturnDocument = draft.priorReturnDocumentId
    ? draft.documents.find((document) => document.id === draft.priorReturnDocumentId) ?? null
    : null;
  const completedReadings = draft.documentReadings.filter((reading) => reading.status === "complete");
  const startPath = buildTinaStartPathAssessment(draft);
  const recommendation = startPath.recommendation;
  const checklist = buildTinaChecklist(draft, recommendation);
  const facts: TinaBootstrapFact[] = [];
  const items: TinaReviewItem[] = [];

  if (draft.profile.businessName.trim()) {
    facts.push(buildFact("business-name", "Business name", draft.profile.businessName.trim(), "organizer"));
  }

  if (draft.profile.taxYear.trim()) {
    facts.push(buildFact("tax-year", "Tax year", draft.profile.taxYear.trim(), "organizer"));
  }

  if (priorReturnDocument) {
    facts.push(buildFact("prior-return", "Last year's return", priorReturnDocument.name, "prior_return"));
  } else if (draft.priorReturn) {
    facts.push(buildFact("prior-return-local", "Last year's return", `${draft.priorReturn.fileName} (saved on this device)`, "prior_return"));
  }

  if (draft.profile.entityType !== "unsure") {
    facts.push(buildFact("entity-type", "Business type", recommendation.title, "organizer"));
  }

  if (draft.profile.accountingMethod !== "unsure") {
    facts.push(buildFact("accounting-method", "Accounting method", draft.profile.accountingMethod === "cash" ? "Cash" : "Accrual", "organizer"));
  }

  if (draft.profile.formationState.trim()) {
    facts.push(buildFact("formation-state", "Formation state", draft.profile.formationState.trim(), "organizer"));
  }

  if (draft.profile.naicsCode.trim()) {
    facts.push(buildFact("business-activity", "Business activity", draft.profile.naicsCode.trim(), "organizer"));
  }

  if (draft.profile.hasPayroll) {
    facts.push(buildFact("payroll", "Payroll", "Yes, this business ran payroll.", "organizer"));
  }

  if (draft.profile.paysContractors) {
    facts.push(buildFact("contractors", "Contractors", "Yes, this business paid contractors.", "organizer"));
  }

  if (draft.profile.hasInventory) {
    facts.push(buildFact("inventory", "Inventory", "Yes, this business tracks inventory.", "organizer"));
  }

  if (draft.profile.hasFixedAssets) {
    facts.push(buildFact("fixed-assets", "Fixed assets", "Yes, this business has equipment or other big purchases.", "organizer"));
  }

  if (draft.profile.collectsSalesTax) {
    facts.push(buildFact("sales-tax", "Sales tax", "Yes, this business collects sales tax.", "organizer"));
  }

  completedReadings.forEach((reading) => {
    const document = draft.documents.find((item) => item.id === reading.documentId);
    if (!document?.requestLabel) return;

    facts.push({
      id: `reading-${reading.documentId}`,
      label: document.requestLabel,
      value: reading.summary,
      source: "document_vault",
      status: "ready",
    });
  });

  draft.sourceFacts.forEach((fact) => {
    facts.push({
      id: `source-fact-${fact.id}`,
      label: fact.label,
      value: fact.value,
      source: "document_vault",
      status: fact.confidence === "high" ? "ready" : "review",
    });
  });

  if (draft.profile.businessName.trim()) {
    const businessNameFact = draft.sourceFacts.find(
      (fact) => normalizeForComparison(fact.label) === "business name"
    );

    if (
      businessNameFact &&
      normalizeForComparison(businessNameFact.value) !==
        normalizeForComparison(draft.profile.businessName)
    ) {
      items.push({
        id: "business-name-mismatch",
        title: "Business name does not match yet",
      summary:
        "The business name you typed does not match the business name Tina found in a saved paper. This should be reviewed before deeper prep starts.",
      severity: "needs_attention",
      status: "open",
      category: "fact_mismatch",
      requestId: null,
      documentId: businessNameFact.sourceDocumentId,
      factId: businessNameFact.id,
    });
  }
  }

  recommendation.blockers.forEach((blocker, index) => {
    items.push({
      id: `blocker-${index + 1}`,
      title: "Tina needs this fixed first",
      summary: blocker,
      severity: "blocking",
      status: "open",
      category: "setup",
      requestId: null,
      documentId: null,
      factId: null,
    });
  });

  startPath.reviewReasons.forEach((reason, index) => {
    items.push({
      id: `start-path-review-${index + 1}`,
      title: "Tina wants reviewer control on the starting path",
      summary: reason,
      severity: "needs_attention",
      status: "open",
      category: "setup",
      requestId: null,
      documentId: null,
      factId: null,
    });
  });

  checklist
    .filter((item) => item.status === "needed" && item.id !== "lane-review")
    .forEach((item) => {
      items.push(toIssueFromChecklistItem(item));
    });

  const uniqueItems = items.filter(
    (item, index) =>
      items.findIndex((candidate) => candidate.title === item.title && candidate.summary === item.summary) ===
      index
  );

  const messaging = buildSummary(uniqueItems);

  return {
    lastRunAt: new Date().toISOString(),
    profileFingerprint,
    status: "complete",
    summary: messaging.summary,
    nextStep: messaging.nextStep,
    facts,
    items: uniqueItems,
  };
}
