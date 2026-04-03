import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaTaxTreatmentPolicy } from "@/tina/lib/tax-treatment-policy";
import type {
  TinaMaterialityPriorityItem,
  TinaMaterialityPrioritySnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(args: TinaMaterialityPriorityItem): TinaMaterialityPriorityItem {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

export function buildTinaMaterialityPriority(
  draft: TinaWorkspaceDraft
): TinaMaterialityPrioritySnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const treatmentPolicy = buildTinaTaxTreatmentPolicy(draft);
  const evidenceSufficiency = buildTinaEvidenceSufficiency(draft);
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const packageReadiness = buildTinaPackageReadiness(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const items: TinaMaterialityPriorityItem[] = [];

  startPath.blockingReasons.forEach((reason, index) => {
    items.push(
      buildItem({
        id: `start-path-blocker-${index + 1}`,
        title: "Resolve filing-path blocker",
        source: "start_path",
        priority: "immediate",
        materiality: "high",
        summary: reason,
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  });

  startPath.proofRequirements
    .filter((requirement) => requirement.status === "needed")
    .forEach((requirement) => {
      items.push(
        buildItem({
          id: `start-path-proof-${requirement.id}`,
          title: requirement.label,
          source: "start_path",
          priority: requirement.priority === "required" ? "immediate" : "next",
          materiality: requirement.priority === "required" ? "high" : "medium",
          summary: requirement.reason,
          relatedFactIds: requirement.relatedFactIds,
          relatedDocumentIds: requirement.relatedDocumentIds,
        })
      );
    });

  treatmentPolicy.decisions.forEach((decision) => {
    items.push(
      buildItem({
        id: `treatment-policy-${decision.id}`,
        title: decision.title,
        source: "treatment_policy",
        priority:
          decision.status === "blocked"
            ? "immediate"
            : decision.status === "review_required"
              ? "next"
              : "monitor",
        materiality: decision.materiality,
        summary: `${decision.summary} ${decision.nextStep}`.trim(),
        relatedFactIds: decision.relatedFactIds,
        relatedDocumentIds: decision.relatedDocumentIds,
      })
    );
  });

  evidenceSufficiency.issues.forEach((issue) => {
    items.push(
      buildItem({
        id: `evidence-${issue.id}`,
        title: issue.title,
        source: "evidence",
        priority: issue.severity === "blocking" ? "immediate" : "next",
        materiality: issue.severity === "blocking" ? "high" : "medium",
        summary: issue.summary,
        relatedFactIds: issue.relatedFactIds,
        relatedDocumentIds: issue.relatedDocumentIds,
      })
    );
  });

  booksReconstruction.areas
    .filter((area) => area.status !== "ready")
    .forEach((area) => {
      items.push(
        buildItem({
          id: `books-${area.id}`,
          title: area.title,
          source: "books",
          priority: area.status === "blocked" ? "immediate" : "next",
          materiality: area.status === "blocked" ? "high" : "medium",
          summary: area.summary,
          relatedFactIds: area.relatedFactIds,
          relatedDocumentIds: area.relatedDocumentIds,
        })
      );
    });

  packageReadiness.items.slice(0, 5).forEach((item) => {
    items.push(
      buildItem({
        id: `package-${item.id}`,
        title: item.title,
        source: "package",
        priority: item.severity === "blocking" ? "immediate" : "next",
        materiality: item.severity === "blocking" ? "high" : "medium",
        summary: item.summary,
        relatedFactIds: [],
        relatedDocumentIds: item.sourceDocumentIds,
      })
    );
  });

  formReadiness.reasons.slice(0, 5).forEach((reason) => {
    items.push(
      buildItem({
        id: `form-${reason.id}`,
        title: reason.title,
        source: "form",
        priority: reason.severity === "blocking" ? "immediate" : "next",
        materiality: reason.severity === "blocking" ? "high" : "medium",
        summary: reason.summary,
        relatedFactIds: [],
        relatedDocumentIds: [],
      })
    );
  });

  const uniqueItems = items.filter(
    (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const immediateCount = uniqueItems.filter((item) => item.priority === "immediate").length;
  const nextCount = uniqueItems.filter((item) => item.priority === "next").length;
  const overallStatus: TinaMaterialityPrioritySnapshot["overallStatus"] =
    immediateCount > 0 ? "immediate_action" : nextCount > 0 ? "review_queue" : "monitor_only";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "immediate_action"
        ? `Tina sees ${immediateCount} immediate high-priority item${immediateCount === 1 ? "" : "s"} that deserve action before polish work.`
        : overallStatus === "review_queue"
          ? `Tina sees ${nextCount} next-priority review item${nextCount === 1 ? "" : "s"} after the immediate blockers are cleared.`
          : "Tina does not currently see urgent or next-priority materiality items beyond normal monitoring.",
    nextStep:
      overallStatus === "immediate_action"
        ? "Clear the immediate high-priority items first so Tina is not polishing around real blockers."
        : overallStatus === "review_queue"
          ? "Work through the next-priority reviewer items before chasing lower-signal cleanup."
          : "Keep monitoring for new blockers while Tina pushes the supported lane forward.",
    items: uniqueItems,
  };
}
