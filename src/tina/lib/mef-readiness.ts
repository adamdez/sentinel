import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type { TinaWorkspaceDraft } from "@/tina/types";

export type TinaMefReadinessStatus = "blocked" | "needs_review" | "ready_for_mef_handoff";
export type TinaMefCheckStatus = "ready" | "needs_review" | "blocked";
export type TinaMefAttachmentDisposition =
  | "binary_attachment_candidate"
  | "support_only";

export interface TinaMefReadinessCheck {
  id: string;
  title: string;
  status: TinaMefCheckStatus;
  summary: string;
}

export interface TinaMefAttachmentManifestItem {
  documentId: string;
  sourceName: string;
  disposition: TinaMefAttachmentDisposition;
  mefFileName: string | null;
  description: string | null;
  summary: string;
}

export interface TinaMefReadinessReport {
  status: TinaMefReadinessStatus;
  summary: string;
  nextStep: string;
  returnType: "1040";
  schedules: string[];
  checks: TinaMefReadinessCheck[];
  attachments: TinaMefAttachmentManifestItem[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clamp(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function buildPdfFileName(args: {
  businessName: string;
  taxYear: string;
  documentName: string;
}): string {
  const business = slugify(args.businessName || "business") || "business";
  const document = slugify(args.documentName.replace(/\.[^.]+$/, "")) || "support";
  const base = clamp(`${business}-${args.taxYear}-${document}`, 60);
  return `${base}.pdf`;
}

function buildAttachmentDescription(args: {
  requestLabel: string | null;
  documentName: string;
  taxYear: string;
}): string {
  const label = args.requestLabel?.trim() || args.documentName;
  return clamp(`TY${args.taxYear} ${label} attachment`, 128);
}

function buildAttachmentManifest(draft: TinaWorkspaceDraft): TinaMefAttachmentManifestItem[] {
  return draft.documents.map((document) => {
    const isPdf = document.mimeType === "application/pdf";
    const sourceName = document.name;

    if (document.category === "prior_return") {
      return {
        documentId: document.id,
        sourceName,
        disposition: "support_only",
        mefFileName: null,
        description: null,
        summary:
          "Prior-year return is support for preparation and continuity, not an IRS binary attachment candidate by default.",
      };
    }

    if (isPdf) {
      return {
        documentId: document.id,
        sourceName,
        disposition: "binary_attachment_candidate",
        mefFileName: buildPdfFileName({
          businessName: draft.profile.businessName,
          taxYear: draft.profile.taxYear,
          documentName: document.name,
        }),
        description: buildAttachmentDescription({
          requestLabel: document.requestLabel,
          documentName: document.name,
          taxYear: draft.profile.taxYear,
        }),
        summary:
          "PDF support can travel as an MeF binary attachment if the CPA or transmitter decides the return needs it.",
      };
    }

    return {
      documentId: document.id,
      sourceName,
      disposition: "support_only",
      mefFileName: null,
      description: null,
      summary:
        "This source paper supports preparation and review, but it is not treated as an IRS binary attachment by default.",
    };
  });
}

function buildCheck(
  id: string,
  title: string,
  status: TinaMefCheckStatus,
  summary: string
): TinaMefReadinessCheck {
  return { id, title, status, summary };
}

export function buildTinaMefReadinessReport(
  draft: TinaWorkspaceDraft
): TinaMefReadinessReport {
  const lane = recommendTinaFilingLane(draft.profile);
  const attachments = buildAttachmentManifest(draft);
  const waitingFields = draft.scheduleCDraft.fields.filter((field) => field.status === "waiting");
  const attentionFields = draft.scheduleCDraft.fields.filter(
    (field) => field.status === "needs_attention"
  );
  const attentionNotes = draft.scheduleCDraft.notes.filter(
    (note) => note.severity === "needs_attention"
  );

  const laneStatus: TinaMefCheckStatus =
    lane.support === "supported" && lane.laneId === "schedule_c_single_member_llc"
      ? "ready"
      : "blocked";
  const returnMappingStatus: TinaMefCheckStatus =
    draft.scheduleCDraft.status !== "complete" || draft.packageReadiness.level === "blocked"
      ? "blocked"
      : waitingFields.length > 0 ||
          attentionFields.length > 0 ||
          attentionNotes.length > 0 ||
          draft.packageReadiness.level === "needs_review"
        ? "needs_review"
        : "ready";
  const attachmentStatus: TinaMefCheckStatus = "ready";
  const signatureStatus: TinaMefCheckStatus =
    draft.packageReadiness.level === "blocked" ? "blocked" : "ready";
  const transmitterStatus: TinaMefCheckStatus =
    draft.packageReadiness.level === "blocked" ? "blocked" : "ready";

  const checks: TinaMefReadinessCheck[] = [
    buildCheck(
      "mef_lane",
      "MeF lane support",
      laneStatus,
      laneStatus === "ready"
        ? "Tina is on her supported 1040/Schedule C lane, which maps to the individual MeF platform path."
        : "Tina is not on a supported 1040/Schedule C lane, so she should not present this packet as MeF-aligned."
    ),
    buildCheck(
      "return_mapping",
      "1040/Schedule C return mapping",
      returnMappingStatus,
      returnMappingStatus === "ready"
        ? "The current Schedule C draft and package gates are clean enough for CPA or transmitter mapping into a 1040-family MeF workflow."
        : returnMappingStatus === "needs_review"
          ? "The current draft still has review-level fields or notes, so MeF mapping should stay under human control."
          : "Tina still has blocked return-mapping gaps before a CPA should treat this as a MeF-ready handoff packet."
    ),
    buildCheck(
      "binary_attachments",
      "Binary attachment manifest",
      attachmentStatus,
      "Current PDF support papers already fit Tina's MeF-safe file-name and description rules, and non-PDF source papers stay support-only unless the CPA or transmitter intentionally attaches them."
    ),
    buildCheck(
      "signature_path",
      "Signature and authorization path",
      signatureStatus,
      signatureStatus === "ready"
        ? "Tina can hand the packet to the CPA or ERO with the signature step still governed outside Tina."
        : "Do not frame the packet as MeF-ready while the return package is still blocked upstream."
    ),
    buildCheck(
      "transmitter_boundary",
      "Schema and transmitter boundary",
      transmitterStatus,
      transmitterStatus === "ready"
        ? "Tina can prepare a MeF-aligned handoff, but current IRS schemas, business rules, and actual transmission still belong to approved software and an authorized e-file provider."
        : "Keep this packet out of MeF framing until the blocked return issues are cleared."
    ),
  ];

  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const reviewCount = checks.filter((check) => check.status === "needs_review").length;

  if (blockedCount > 0) {
    return {
      status: "blocked",
      summary:
        "Tina is not ready to present this packet as MeF-aligned because core 1040/Schedule C or package gates are still blocked.",
      nextStep:
        "Clear the blocked lane or return-mapping issues first, then rebuild the MeF readiness layer.",
      returnType: "1040",
      schedules: ["Schedule C"],
      checks,
      attachments,
    };
  }

  if (reviewCount > 0) {
    return {
      status: "needs_review",
      summary:
        "Tina has a meaningful MeF-aligned handoff, but a CPA or transmitter should still review attachment and field-level details before submission software takes over.",
      nextStep:
        "Use this packet as the 1040/Schedule C MeF handoff bundle, then let the CPA or transmitter handle any needed PDF attachment choices and final schema validation.",
      returnType: "1040",
      schedules: ["Schedule C"],
      checks,
      attachments,
    };
  }

  return {
    status: "ready_for_mef_handoff",
    summary:
      "Tina has a clean MeF-aligned 1040/Schedule C handoff packet for CPA or transmitter software.",
    nextStep:
      "Hand this packet to the CPA or authorized transmitter for final schema/business-rule validation, signature handling, and MeF submission.",
    returnType: "1040",
    schedules: ["Schedule C"],
    checks,
    attachments,
  };
}
