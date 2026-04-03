import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import type {
  TinaOfficialFederalFormId,
  TinaScheduleCPdfRenderMode,
  TinaScheduleCReturnSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function formatMoney(value: number | null): string {
  if (value === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, maxChars: number): string[] {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return [trimmed];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (word.length <= maxChars) {
      current = word;
      return;
    }

    let remaining = word;
    while (remaining.length > maxChars) {
      lines.push(remaining.slice(0, maxChars - 1) + "-");
      remaining = remaining.slice(maxChars - 1);
    }
    current = remaining;
  });

  if (current) lines.push(current);
  return lines;
}

function buildContentLines(args: {
  snapshot: TinaScheduleCReturnSnapshot;
  blockedStartPath: boolean;
  blockedRouteSummary: string | null;
  blockedRouteDetails: string[];
  officialTemplateTitle: string | null;
  unsupportedCoverageCount: number;
  weakEvidenceCount: number;
  moderateEvidenceCount: number;
}): string[] {
  const {
    snapshot,
    blockedStartPath,
    blockedRouteSummary,
    blockedRouteDetails,
    officialTemplateTitle,
    unsupportedCoverageCount,
    weakEvidenceCount,
    moderateEvidenceCount,
  } = args;
  const lines: string[] = [];
  const pushWrapped = (value: string, maxChars = 92, step = 16) => {
    wrapText(value, maxChars).forEach((line, index) => {
      if (index > 0 || lines[lines.length - 1] !== "BT") {
        lines.push(`0 -${step} Td`);
      }
      lines.push(`(${escapePdfText(line)}) Tj`);
    });
  };
  lines.push("BT");
  lines.push("/F1 18 Tf");
  lines.push("50 760 Td");
  lines.push(
    `(${escapePdfText(
      blockedStartPath
        ? `Tina Filing Path Blocked Notice (${snapshot.taxYear || "Tax Year"})`
        : `Schedule C - Tina Return Snapshot (${snapshot.taxYear || "Tax Year"})`
    )}) Tj`
  );
  lines.push("0 -24 Td");
  lines.push("/F1 11 Tf");
  lines.push(`(${escapePdfText(`Business: ${snapshot.businessName || "Unnamed business"}`)}) Tj`);
  lines.push("0 -18 Td");
  pushWrapped(snapshot.summary);

  if (officialTemplateTitle) {
    lines.push("0 -18 Td");
    pushWrapped(`Official blank form foundation stored locally: ${officialTemplateTitle}.`);
  }

  if (blockedStartPath) {
    lines.push("0 -18 Td");
    pushWrapped(
      "This is not a Schedule C form draft. Tina blocked the filing path before form production."
    );
    if (blockedRouteSummary) {
      lines.push("0 -18 Td");
      pushWrapped(`Why blocked: ${blockedRouteSummary}`);
    }
    blockedRouteDetails.slice(0, 6).forEach((detail) => {
      lines.push("0 -16 Td");
      pushWrapped(`- ${detail}`, 88, 14);
    });
  }

  lines.push("0 -18 Td");
  pushWrapped(`Activity: ${snapshot.header.principalBusinessActivity || "Missing"}`);
  lines.push("0 -18 Td");
  pushWrapped(
    `Business code: ${snapshot.header.naicsCode || "Missing"} | Method: ${snapshot.header.accountingMethod}`
  );
  lines.push("0 -24 Td");
  lines.push("/F1 12 Tf");
  lines.push(
    `(${escapePdfText(
      blockedStartPath
        ? "Route status"
        : "Line   Label                              Amount      Status"
    )}) Tj`
  );
  lines.push("0 -14 Td");
  lines.push(
    `(${escapePdfText(
      blockedStartPath
        ? "----------"
        : "----   --------------------------------  ----------  ---------------"
    )}) Tj`
  );

  if (blockedStartPath) {
    lines.push("0 -14 Td");
    lines.push(`(${escapePdfText(`Route: blocked | Lane: ${snapshot.laneId}`)}) Tj`);
  } else {
    snapshot.fields.forEach((field) => {
      const label = `${field.lineNumber.padEnd(6)} ${field.label.padEnd(32)} ${formatMoney(field.amount).padEnd(10)} ${field.status}`;
      lines.push("0 -14 Td");
      lines.push(`(${escapePdfText(label)}) Tj`);
    });
  }

  lines.push("0 -24 Td");
  lines.push("/F1 12 Tf");
  lines.push(`(${escapePdfText("Validation")}) Tj`);

  if (snapshot.validationIssues.length === 0) {
    lines.push("0 -14 Td");
    pushWrapped(
      blockedStartPath
        ? "Routing is blocked. This notice is not a validation pass."
        : "No current validation issues."
    );
  } else {
    snapshot.validationIssues.slice(0, 12).forEach((issue) => {
      lines.push("0 -14 Td");
      pushWrapped(`[${issue.severity}] ${issue.title}`, 88, 14);
    });
  }

  if (!blockedStartPath) {
    lines.push("0 -20 Td");
    lines.push("/F1 12 Tf");
    lines.push(`(${escapePdfText("Evidence and Coverage")}) Tj`);
    lines.push("0 -14 Td");
    pushWrapped(
      `Non-zero line evidence: ${weakEvidenceCount} weak, ${moderateEvidenceCount} moderate, ${Math.max(
        snapshot.fields.filter((field) => typeof field.amount === "number" && field.amount !== 0).length -
          weakEvidenceCount -
          moderateEvidenceCount,
        0
      )} stronger-supported line(s).`,
      88,
      14
    );
    lines.push("0 -14 Td");
    pushWrapped(
      unsupportedCoverageCount > 0
        ? `Unsupported Schedule C sections still present: ${unsupportedCoverageCount}.`
        : "No currently unsupported Schedule C sections are flagged for this output.",
      88,
      14
    );
  }

  lines.push("ET");
  return lines;
}

function encodePdfTextDocument(lines: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const contentStream = lines.join("\n");
  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj"
  );
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push(
    `5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return encoder.encode(pdf);
}

export interface TinaScheduleCPdfExport {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  snapshot: TinaScheduleCReturnSnapshot;
  renderMode: TinaScheduleCPdfRenderMode;
  officialTemplateId: TinaOfficialFederalFormId | null;
  officialTemplateTitle: string | null;
}

export function buildTinaScheduleCPdfExport(
  draft: TinaWorkspaceDraft
): TinaScheduleCPdfExport {
  const startPath = buildTinaStartPathAssessment(draft);
  const snapshot = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formTrace = buildTinaScheduleCFormTrace(draft);
  const officialFormTemplates = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const blockedStartPath =
    startPath.route !== "supported" || startPath.recommendation.laneId !== "schedule_c_single_member_llc";
  const primaryOfficialTemplate =
    officialFormTemplates.templates.find(
      (template) => template.id === officialFormTemplates.primaryTemplateId
    ) ?? null;
  const fileBase = (snapshot.businessName || "business")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "business";
  const fileName = blockedStartPath
    ? `tina-start-path-blocked-${fileBase}-${snapshot.taxYear || "tax-year"}.pdf`
    : `tina-schedule-c-${fileBase}-${snapshot.taxYear || "tax-year"}.pdf`;
  const blockedRouteDetails = [
    ...startPath.blockingReasons,
    ...startPath.reviewReasons,
    ...startPath.proofRequirements
      .filter((requirement) => requirement.status === "needed")
      .map((requirement) => `${requirement.label}: ${requirement.reason}`),
  ];
  const unsupportedCoverageCount = formCoverage.items.filter(
    (item) => item.status === "unsupported"
  ).length;
  const nonZeroTraceLines = formTrace.lines.filter(
    (line) => typeof line.amount === "number" && line.amount !== 0
  );
  const weakEvidenceCount = nonZeroTraceLines.filter(
    (line) => line.evidenceSupportLevel === "weak" || line.evidenceSupportLevel === "missing"
  ).length;
  const moderateEvidenceCount = nonZeroTraceLines.filter(
    (line) => line.evidenceSupportLevel === "moderate"
  ).length;
  const bytes = encodePdfTextDocument(
    buildContentLines({
      snapshot,
      blockedStartPath,
      blockedRouteSummary: blockedStartPath ? startPath.recommendation.summary : null,
      blockedRouteDetails,
      officialTemplateTitle: primaryOfficialTemplate?.title ?? null,
      unsupportedCoverageCount,
      weakEvidenceCount,
      moderateEvidenceCount,
    })
  );

  return {
    fileName,
    mimeType: "application/pdf",
    bytes,
    snapshot,
    renderMode: blockedStartPath ? "blocked_route_notice" : "tina_schedule_c_draft",
    officialTemplateId: primaryOfficialTemplate?.id ?? null,
    officialTemplateTitle: primaryOfficialTemplate?.title ?? null,
  };
}
