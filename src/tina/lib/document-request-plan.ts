import type {
  TinaDocumentRequestPlanItem,
  TinaDocumentRequestPlanSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(item: TinaDocumentRequestPlanItem): TinaDocumentRequestPlanItem {
  return {
    ...item,
    relatedFactIds: unique(item.relatedFactIds),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

function existingIds(items: TinaDocumentRequestPlanItem[]): Set<string> {
  return new Set(items.map((item) => item.id));
}

export function buildTinaDocumentRequestPlan(
  draft: TinaWorkspaceDraft
): TinaDocumentRequestPlanSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const authorityPositionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const evidenceSufficiency = buildTinaEvidenceSufficiency(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const items: TinaDocumentRequestPlanItem[] = [];

  startPath.proofRequirements
    .filter((requirement) => requirement.status === "needed")
    .forEach((requirement) => {
      items.push(
        buildItem({
          id: `proof-${requirement.id}`,
          audience: "owner",
          category: "ownership",
          priority:
            startPath.route === "blocked" || requirement.priority === "required"
              ? "immediate"
              : "next",
          title: requirement.label,
          summary: requirement.reason,
          request: `Upload or confirm: ${requirement.label}.`,
          whyItMatters: "Tina needs this proof to set the correct tax lane and stop wrong-lane prep.",
          relatedFactIds: requirement.relatedFactIds,
          relatedDocumentIds: requirement.relatedDocumentIds,
        })
      );
    });

  booksReconstruction.areas
    .filter((area) => area.status !== "ready")
    .forEach((area) => {
      items.push(
        buildItem({
          id: `books-${area.id}`,
          audience: "owner",
          category: "books",
          priority: area.status === "blocked" ? "immediate" : "next",
          title: area.title,
          summary: area.summary,
          request: `Upload cleaner ledger, bank, or support detail for ${area.title.toLowerCase()}.`,
          whyItMatters: "Tina needs a cleaner books-to-tax picture before she can treat the file like reviewer-grade work.",
          relatedFactIds: area.relatedFactIds,
          relatedDocumentIds: area.relatedDocumentIds,
        })
      );
    });

  entityRecordMatrix.items
    .filter(
      (item) =>
        item.status === "missing" &&
        (item.criticality === "critical" || startPath.recommendation.laneId !== "schedule_c_single_member_llc")
    )
    .forEach((item) => {
      items.push(
        buildItem({
          id: `entity-record-${item.id}`,
          audience: "owner",
          category: "entity",
          priority: item.criticality === "critical" ? "immediate" : "next",
          title: item.title,
          summary: item.summary,
          request: `Upload or confirm the records Tina needs for: ${item.title}.`,
          whyItMatters:
            "Lane-specific entity records are what let Tina move from rough routing into believable return-family prep.",
          relatedFactIds: item.matchedFactIds,
          relatedDocumentIds: item.matchedDocumentIds,
        })
      );
    });

  entityEconomicsReadiness.checks
    .filter((check) => check.status === "blocked" || check.status === "needs_review")
    .forEach((check) => {
      items.push(
        buildItem({
          id: `economics-${check.id}`,
          audience: "reviewer",
          category: "economics",
          priority: check.status === "blocked" ? "immediate" : "next",
          title: check.title,
          summary: check.summary,
          request: `Reviewer should resolve the economics story for ${check.title.toLowerCase()}.`,
          whyItMatters: check.whyItMatters,
          relatedFactIds: check.relatedFactIds,
          relatedDocumentIds: check.relatedDocumentIds,
        })
      );
    });

  authorityPositionMatrix.items
    .filter(
      (item) =>
        item.recommendation === "hold_for_authority" ||
        item.recommendation === "hold_for_facts"
    )
    .forEach((item) => {
      items.push(
        buildItem({
          id: `authority-${item.id}`,
          audience: item.recommendation === "hold_for_facts" ? "owner" : "reviewer",
          category: "authority",
          priority: item.priority,
          title: item.title,
          summary: item.summary,
          request:
            item.recommendation === "hold_for_authority"
              ? `Reviewer should build or confirm authority support for ${item.title.toLowerCase()}.`
              : `Upload stronger support for ${item.title.toLowerCase()}.`,
          whyItMatters:
            "Authority-backed planning is only real when Tina can show both the law and the facts behind the position.",
          relatedFactIds: item.relatedFactIds,
          relatedDocumentIds: item.relatedDocumentIds,
        })
      );
    });

  disclosureReadiness.items
    .filter((item) => item.status === "required" || item.status === "needs_review")
    .forEach((item) => {
      items.push(
        buildItem({
          id: `disclosure-${item.id}`,
          audience: "reviewer",
          category: "authority",
          priority: item.status === "required" ? "immediate" : "next",
          title: item.title,
          summary: item.summary,
          request: item.requiredAction,
          whyItMatters: item.whyItMatters,
          relatedFactIds: [],
          relatedDocumentIds: item.relatedDocumentIds,
        })
      );
    });

  industryEvidenceMatrix.items
    .filter((item) => item.status !== "covered")
    .forEach((item) => {
      items.push(
        buildItem({
          id: `industry-${item.id}`,
          audience: "owner",
          category: "industry",
          priority: item.status === "missing" && item.materiality === "low" ? "later" : "next",
          title: `${item.playbookTitle}: ${item.requirement}`,
          summary: item.summary,
          request: `Upload or point Tina to: ${item.requirement}.`,
          whyItMatters:
            "Industry-specific records are often what separate a plausible tax position from a reviewer-trusted one.",
          relatedFactIds: item.matchedFactIds,
          relatedDocumentIds: item.matchedDocumentIds,
        })
      );
    });

  companionFormCalculations.items
    .filter((item) => item.status === "blocked" || item.status === "needs_review")
    .forEach((item) => {
      items.push(
        buildItem({
          id: `forms-${item.id}`,
          audience: "owner",
          category: "forms",
          priority: item.status === "blocked" ? "immediate" : "next",
          title: item.title,
          summary: item.summary,
          request:
            item.requiredRecords.length > 0
              ? `Upload or confirm: ${item.requiredRecords.slice(0, 3).join("; ")}.`
              : `Provide the missing support Tina needs for ${item.title.toLowerCase()}.`,
          whyItMatters:
            "These records are what let Tina move from a core Schedule C view toward a more complete federal form set.",
          relatedFactIds: [],
          relatedDocumentIds: item.relatedDocumentIds,
        })
      );
    });

  evidenceSufficiency.lines
    .filter((line) => line.level === "missing" || line.level === "weak")
    .slice(0, 5)
    .forEach((line) => {
      items.push(
        buildItem({
          id: `evidence-${line.id}`,
          audience: line.relatedDocumentIds.length > 0 ? "reviewer" : "owner",
          category: "evidence",
          priority: line.level === "missing" ? "immediate" : "next",
          title: `${line.lineNumber} ${line.label}`,
          summary: line.summary,
          request:
            line.relatedDocumentIds.length > 0
              ? `Reviewer should verify the support chain for ${line.lineNumber} before trusting it as final.`
              : `Upload stronger support for ${line.lineNumber} ${line.label}.`,
          whyItMatters:
            "Weak or missing line-level evidence is exactly the kind of thing a skeptical CPA will challenge first.",
          relatedFactIds: line.relatedFactIds,
          relatedDocumentIds: line.relatedDocumentIds,
        })
      );
    });

  draft.scheduleCDraft.fields
    .filter(
      (field) =>
        typeof field.amount === "number" &&
        field.amount !== 0 &&
        field.sourceDocumentIds.length === 0 &&
        !existingIds(items).has(`evidence-${field.id}`)
    )
    .slice(0, 5)
    .forEach((field) => {
      items.push(
        buildItem({
          id: `evidence-${field.id}`,
          audience: "owner",
          category: "evidence",
          priority: "immediate",
          title: `${field.lineNumber} ${field.label}`,
          summary: "Tina has a non-zero draft line here, but no attached source documents yet.",
          request: `Upload stronger support for ${field.lineNumber} ${field.label}.`,
          whyItMatters:
            "A non-zero line without attached support is exactly the kind of gap a reviewer will challenge immediately.",
          relatedFactIds: [],
          relatedDocumentIds: [],
        })
      );
    });

  const dedupedItems = items.filter(
    (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const immediateCount = dedupedItems.filter((item) => item.priority === "immediate").length;
  const overallStatus =
    dedupedItems.length === 0
      ? "clear"
      : immediateCount > 0
        ? "blocked"
        : "action_queue";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "clear"
        ? "Tina does not currently see a missing-document action queue beyond the saved file."
        : overallStatus === "blocked"
          ? `Tina sees ${immediateCount} immediate document or proof request${
              immediateCount === 1 ? "" : "s"
            } before she should act finished.`
          : `Tina has ${dedupedItems.length} queued document or proof follow-up item${
              dedupedItems.length === 1 ? "" : "s"
            }.`,
    nextStep:
      overallStatus === "clear"
        ? "Keep the request plan quiet until new blockers or missing-proof gaps appear."
        : overallStatus === "blocked"
          ? "Start with the immediate requests first so Tina can unblock route, books, and companion-form confidence."
          : "Work through the next-tier record requests so Tina can keep raising reviewer confidence.",
    items: dedupedItems,
  };
}
