import { buildTinaBenchmarkDashboardReport } from "@/tina/lib/benchmark-dashboard";
import { buildTinaBenchmarkRescoreReport } from "@/tina/lib/benchmark-rescore";
import { buildTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { buildTinaClientIntakeReviewReport } from "@/tina/lib/client-intake-review";
import { buildTinaCurrentFileReviewerReality } from "@/tina/lib/current-file-reviewer-reality";
import { buildTinaEntityReturnIntakeContract } from "@/tina/lib/entity-return-intake-contract";
import { buildTinaFinalPackageQualityReport } from "@/tina/lib/final-package-quality";
import { buildTinaFilingApprovalReport } from "@/tina/lib/filing-approval";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import { buildTinaMefReadinessReport } from "@/tina/lib/mef-readiness";
import { buildTinaNumericProofRows } from "@/tina/lib/numeric-proof";
import { buildTinaPlanningReport } from "@/tina/lib/planning-report";
import { buildTinaReviewDeliveryReport } from "@/tina/lib/review-delivery";
import { buildTinaReviewTraceRows } from "@/tina/lib/review-trace";
import { buildTinaSCorpPrepReport } from "@/tina/lib/s-corp-prep";
import { buildTinaSCorpReviewReport } from "@/tina/lib/s-corp-review";
import { buildTinaScheduleCExportContract } from "@/tina/lib/schedule-c-export-contract";
import { buildTinaScheduleCScenarioProfile } from "@/tina/lib/schedule-c-scenario-profile";
import { buildTinaTransactionReconciliationReport } from "@/tina/lib/transaction-reconciliation";
import type { TinaWorkspaceDraft } from "@/tina/types";

function formatMoney(value: number | null): string {
  if (value === null) return "No dollar amount yet";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface TinaCpaPacketExport {
  fileName: string;
  mimeType: string;
  contents: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPacketBodyHtml(lines: string[]): string {
  const html: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ")) {
      html.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      html.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("  - ")) {
      html.push(`<div class="bullet bullet-nested">${escapeHtml(line.slice(4))}</div>`);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      html.push(`<div class="bullet">${escapeHtml(trimmed.slice(2))}</div>`);
      continue;
    }

    html.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  return html.join("\n");
}

function renderSummaryCard(label: string, value: string): string {
  return `<div class="summary-card"><p class="label">${escapeHtml(label)}</p><p class="value">${escapeHtml(value)}</p></div>`;
}

function renderMetricCard(label: string, value: string, tone: "neutral" | "positive" | "warning" | "critical" = "neutral"): string {
  return `<div class="metric-card tone-${tone}"><p class="label">${escapeHtml(label)}</p><p class="value">${escapeHtml(value)}</p></div>`;
}

function renderStatusRow(title: string, status: string, summary: string): string {
  return `<div class="status-row">
    <div class="status-title-wrap">
      <div class="status-title">${escapeHtml(title)}</div>
      <div class="status-summary">${escapeHtml(summary)}</div>
    </div>
    <div class="status-pill status-${escapeHtml(status)}">${escapeHtml(status.replace(/_/g, " "))}</div>
  </div>`;
}

function renderBulletItems(items: string[]): string {
  if (items.length === 0) {
    return `<div class="empty-note">No current items.</div>`;
  }

  return items
    .map((item) => `<div class="bullet">${escapeHtml(item)}</div>`)
    .join("\n");
}

function renderTraceabilityRows(rows: Array<{ label: string; amount: string; summary: string; support: string }>): string {
  if (rows.length === 0) {
    return `<div class="empty-note">Tina does not have source-to-return trace rows yet.</div>`;
  }

  return rows
    .map(
      (row) => `<div class="trace-row">
        <div>
          <div class="trace-label">${escapeHtml(row.label)}</div>
          <div class="trace-summary">${escapeHtml(row.summary)}</div>
        </div>
        <div class="trace-meta">
          <div class="trace-amount">${escapeHtml(row.amount)}</div>
          <div class="trace-support">${escapeHtml(row.support)}</div>
        </div>
      </div>`
    )
    .join("\n");
}

function renderSupportIndex(groups: Array<{ label: string; items: string[] }>): string {
  if (groups.length === 0) {
    return `<div class="empty-note">No saved support papers yet.</div>`;
  }

  return groups
    .map(
      (group) => `<div class="support-group">
        <div class="support-title">${escapeHtml(group.label)}</div>
        ${group.items.map((item) => `<div class="support-item">${escapeHtml(item)}</div>`).join("\n")}
      </div>`
    )
    .join("\n");
}

function buildPrintablePacketHtml(args: {
  businessName: string;
  taxYear: string;
  laneTitle: string;
  packetStatus: string;
  nextStep: string;
  fastPassHtml: string;
  thresholdsHtml: string;
  traceabilityHtml: string;
  entityInsertHtml: string;
  exceptionsHtml: string;
  supportIndexHtml: string;
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tina CPA Review Packet</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #14213d;
        --muted: #5b6475;
        --line: #d7dde8;
        --panel: #ffffff;
        --panel-alt: #f6f8fb;
        --accent: #1746a2;
        --accent-soft: #e8f0ff;
        --warn: #8a5b00;
        --warn-soft: #fff5db;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        background: #eef2f7;
        color: var(--ink);
        font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .packet {
        max-width: 980px;
        margin: 0 auto;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 18px 60px rgba(20, 33, 61, 0.08);
      }
      .hero {
        padding: 32px;
        background: linear-gradient(145deg, #17356f 0%, #224a91 55%, #eef4ff 160%);
        color: white;
      }
      .eyebrow {
        margin: 0 0 8px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.8;
      }
      .hero h1 {
        margin: 0;
        font-size: 34px;
        line-height: 1.1;
      }
      .hero p {
        margin: 12px 0 0;
        max-width: 720px;
        font-size: 15px;
        line-height: 1.7;
        color: rgba(255,255,255,0.9);
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        padding: 24px 32px 0;
      }
      .summary-card {
        padding: 16px 18px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--panel-alt);
      }
      .summary-card .label {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .summary-card .value {
        margin: 10px 0 0;
        font-size: 16px;
        line-height: 1.5;
        font-weight: 600;
        color: var(--ink);
      }
      .next-step {
        margin: 20px 32px 0;
        padding: 18px 20px;
        border: 1px solid #f0d8a5;
        border-radius: 18px;
        background: var(--warn-soft);
      }
      .next-step .label {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--warn);
      }
      .next-step .value {
        margin: 0;
        font-size: 15px;
        line-height: 1.7;
        color: #4f3a00;
      }
      .section-grid {
        display: grid;
        gap: 18px;
        padding: 24px 32px 0;
      }
      .section-card {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: white;
        overflow: hidden;
      }
      .section-card-header {
        padding: 18px 20px 12px;
        border-bottom: 1px solid var(--line);
        background: var(--panel-alt);
      }
      .section-card-header h2 {
        margin: 0;
        font-size: 18px;
        color: var(--ink);
      }
      .section-card-header p {
        margin: 8px 0 0;
        font-size: 14px;
        line-height: 1.7;
        color: var(--muted);
      }
      .section-card-body {
        padding: 18px 20px 20px;
      }
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
      }
      .metric-card {
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel-alt);
      }
      .metric-card.tone-positive { background: #ebf9f0; border-color: #ccebd8; }
      .metric-card.tone-warning { background: #fff6e6; border-color: #efd4a3; }
      .metric-card.tone-critical { background: #fff0ef; border-color: #efcbc7; }
      .metric-card .label {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .metric-card .value {
        margin: 10px 0 0;
        font-size: 15px;
        line-height: 1.55;
        font-weight: 600;
      }
      .status-stack { display: grid; gap: 12px; }
      .status-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel-alt);
      }
      .status-title { font-size: 15px; font-weight: 700; color: var(--ink); }
      .status-summary { margin-top: 6px; font-size: 14px; line-height: 1.65; color: var(--muted); }
      .status-pill {
        white-space: nowrap;
        padding: 7px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        border: 1px solid var(--line);
        background: white;
      }
      .status-ready, .status-complete { background: #ebf9f0; border-color: #ccebd8; color: #1f6b42; }
      .status-needs-review, .status-needs_review, .status-waiting { background: #fff6e6; border-color: #efd4a3; color: #8a5b00; }
      .status-blocked, .status-error { background: #fff0ef; border-color: #efcbc7; color: #8f3128; }
      .trace-stack, .support-stack { display: grid; gap: 12px; }
      .trace-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel-alt);
      }
      .trace-label { font-size: 15px; font-weight: 700; color: var(--ink); }
      .trace-summary { margin-top: 6px; font-size: 14px; line-height: 1.65; color: var(--muted); }
      .trace-meta { text-align: right; min-width: 180px; }
      .trace-amount { font-size: 15px; font-weight: 700; color: var(--ink); }
      .trace-support { margin-top: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); }
      .support-group {
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel-alt);
      }
      .support-title {
        margin-bottom: 10px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .support-item {
        padding: 8px 0;
        border-top: 1px solid rgba(91, 100, 117, 0.15);
        font-size: 14px;
        line-height: 1.6;
        color: var(--ink);
      }
      .support-item:first-of-type { border-top: none; padding-top: 0; }
      .empty-note {
        padding: 16px;
        border: 1px dashed var(--line);
        border-radius: 16px;
        background: var(--panel-alt);
        font-size: 14px;
        line-height: 1.65;
        color: var(--muted);
      }
      .body {
        padding: 28px 32px 36px;
      }
      .body h1 {
        margin: 0 0 18px;
        font-size: 26px;
        line-height: 1.2;
        color: var(--ink);
      }
      .body h2 {
        margin: 28px 0 14px;
        padding-top: 20px;
        border-top: 1px solid var(--line);
        font-size: 20px;
        line-height: 1.3;
        color: var(--accent);
      }
      .body p {
        margin: 0 0 12px;
        font-size: 15px;
        line-height: 1.75;
        color: var(--ink);
      }
      .bullet {
        position: relative;
        margin: 0 0 10px;
        padding: 12px 14px 12px 38px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--panel-alt);
        font-size: 14px;
        line-height: 1.65;
        color: var(--ink);
      }
      .bullet::before {
        content: "";
        position: absolute;
        left: 16px;
        top: 18px;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--accent);
      }
      .bullet-nested {
        margin-left: 24px;
        background: white;
      }
      .bullet-nested::before {
        background: #7c8aa5;
      }
      @media print {
        body {
          padding: 0;
          background: white;
        }
        .packet {
          box-shadow: none;
          border: none;
          border-radius: 0;
        }
        .hero {
          background: #17356f !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .summary-card,
        .bullet,
        .next-step {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    </style>
  </head>
  <body>
    <main class="packet">
      <section class="hero">
        <p class="eyebrow">Tina CPA Review Packet</p>
        <h1>${escapeHtml(args.businessName)}</h1>
        <p>Tina prepared this packet for CPA review. It is organized for fast skimming, obvious blockers, and source-backed follow-up.</p>
      </section>
      <section class="summary-grid">
        <div class="summary-card">
          <p class="label">Tax year</p>
          <p class="value">${escapeHtml(args.taxYear)}</p>
        </div>
        <div class="summary-card">
          <p class="label">Filing lane</p>
          <p class="value">${escapeHtml(args.laneTitle)}</p>
        </div>
        <div class="summary-card">
          <p class="label">Packet status</p>
          <p class="value">${escapeHtml(args.packetStatus)}</p>
        </div>
      </section>
      <section class="next-step">
        <p class="label">Next step</p>
        <p class="value">${escapeHtml(args.nextStep)}</p>
      </section>
      <section class="section-grid">
        <div class="section-card">
          <div class="section-card-header">
            <h2>Reviewer fast pass</h2>
            <p>The first skim page for a skeptical CPA: what Tina thinks is ready, what is blocked, and where scrutiny belongs first.</p>
          </div>
          <div class="section-card-body">
            <div class="metrics-grid">
              ${args.fastPassHtml}
            </div>
          </div>
        </div>
        <div class="section-card">
          <div class="section-card-header">
            <h2>Review thresholds</h2>
            <p>Explicit gate checks so the reviewer does not have to infer whether the packet is merely present or actually review-usable.</p>
          </div>
          <div class="section-card-body">
            <div class="status-stack">
              ${args.thresholdsHtml}
            </div>
          </div>
        </div>
        <div class="section-card">
          <div class="section-card-header">
            <h2>Source-to-return index</h2>
            <p>The fastest route from return-facing number to what supports it, including the places Tina still does not have enough proof.</p>
          </div>
          <div class="section-card-body">
            <div class="trace-stack">
              ${args.traceabilityHtml}
            </div>
          </div>
        </div>
        <div class="section-card">
          <div class="section-card-header">
            <h2>Entity-specific review insert</h2>
            <p>The lane-specific hot spots a skeptical CPA will look for first.</p>
          </div>
          <div class="section-card-body">
            <div class="status-stack">
              ${args.entityInsertHtml}
            </div>
          </div>
        </div>
        <div class="section-card">
          <div class="section-card-header">
            <h2>Exceptions and open loops</h2>
            <p>Everything Tina still wants the CPA to see explicitly instead of reconstructing by hand.</p>
          </div>
          <div class="section-card-body">
            ${args.exceptionsHtml}
          </div>
        </div>
        <div class="section-card">
          <div class="section-card-header">
            <h2>Support archive index</h2>
            <p>The paper trail Tina believes belongs with this packet.</p>
          </div>
          <div class="section-card-body">
            <div class="support-stack">
              ${args.supportIndexHtml}
            </div>
          </div>
        </div>
      </section>
      <section class="body">
        <div class="section-card-header" style="padding: 0 0 18px; border-bottom: none; background: transparent;">
          <h2 style="margin: 0; padding-top: 0; border-top: none;">Detailed packet appendix</h2>
          <p style="margin-top: 8px;">The pages above are the fast-review packet. This appendix keeps the deeper Tina record available without forcing the CPA to start there.</p>
        </div>
        ${args.bodyHtml}
      </section>
    </main>
  </body>
</html>`;
}

export function buildTinaCpaPacketExport(draft: TinaWorkspaceDraft): TinaCpaPacketExport {
  const handoff = buildTinaCpaHandoff(draft);
  const intakeReview = buildTinaClientIntakeReviewReport(draft);
  const lane = recommendTinaFilingLane(draft.profile);
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const mefReadiness = buildTinaMefReadinessReport(draft);
  const filingApproval = buildTinaFilingApprovalReport(draft);
  const reviewDelivery = buildTinaReviewDeliveryReport(draft);
  const exportContract = buildTinaScheduleCExportContract(draft);
  const entityIntakeContract = buildTinaEntityReturnIntakeContract(draft);
  const sCorpPrep = buildTinaSCorpPrepReport(draft);
  const sCorpReview = buildTinaSCorpReviewReport(draft);
  const scenarioProfile = buildTinaScheduleCScenarioProfile(draft);
  const currentFileReality = buildTinaCurrentFileReviewerReality(draft);
  const packageQuality = buildTinaFinalPackageQualityReport(draft);
  const reviewTraceRows = buildTinaReviewTraceRows(draft);
  const numericProofRows = buildTinaNumericProofRows(draft);
  const reconciliation = buildTinaTransactionReconciliationReport(draft);
  const planningReport = buildTinaPlanningReport(draft);
  const benchmarkRescore = buildTinaBenchmarkRescoreReport(draft);
  const benchmarkDashboard = buildTinaBenchmarkDashboardReport(draft);
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const fastPassHtml = [
    renderMetricCard(
      "Send posture",
      reviewDelivery.status.replace(/_/g, " "),
      reviewDelivery.status === "ready_to_send"
        ? "positive"
        : reviewDelivery.status === "blocked"
          ? "critical"
          : "warning"
    ),
    renderMetricCard(
      "Packet sections",
      `${handoff.artifacts.length} sections built`,
      handoff.status === "complete" ? "positive" : handoff.status === "stale" ? "warning" : "neutral"
    ),
    renderMetricCard(
      "Open blockers",
      `${intakeReview.blockers.length + packageQuality.checks.filter((check) => check.status === "blocked").length} blocker${intakeReview.blockers.length + packageQuality.checks.filter((check) => check.status === "blocked").length === 1 ? "" : "s"}`,
      intakeReview.blockers.length + packageQuality.checks.filter((check) => check.status === "blocked").length > 0 ? "critical" : "positive"
    ),
    renderMetricCard(
      "Reviewer reality",
      currentFileReality.patterns.length > 0 ? `${currentFileReality.patterns.length} learned pattern${currentFileReality.patterns.length === 1 ? "" : "s"}` : "No direct reviewer history yet",
      currentFileReality.patterns.length > 0 ? "warning" : "neutral"
    ),
  ].join("\n");

  const thresholdRows: string[] = [
    ...reviewDelivery.checks.map((check) => renderStatusRow(check.title, check.status, check.summary)),
    ...packageQuality.checks.map((check) => renderStatusRow(check.title, check.status, check.summary)),
  ];

  const traceabilityRows = (
    reviewTraceRows.length > 0
      ? reviewTraceRows.slice(0, 10).map((row) => ({
          label: `${row.lineNumber} ${row.label}`,
          amount: formatMoney(row.amount),
          summary: row.summary,
          support:
            row.reconciliationStatus !== "unknown"
              ? `Reconciliation ${row.reconciliationStatus.replace(/_/g, " ")}`
              : row.fieldStatus.replace(/_/g, " "),
        }))
      : numericProofRows.slice(0, 10).map((row) => ({
          label: `${row.lineNumber} ${row.label}`,
          amount: formatMoney(row.amount),
          summary: row.summary,
          support: `Proof ${row.supportLevel.replace(/_/g, " ")}`,
        }))
  );

  const entityRows: string[] = [];
  if (lane.support === "supported") {
    entityRows.push(...scenarioProfile.signals.slice(0, 6).map((signal) => renderStatusRow(signal.title, "needs_review", signal.summary)));
  } else {
    if (sCorpReview.status !== "unsupported") {
      entityRows.push(...sCorpReview.sections.map((section) => renderStatusRow(section.title, section.status, section.summary)));
    }
    if (sCorpPrep.status !== "unsupported") {
      entityRows.push(...sCorpPrep.sections.map((section) => renderStatusRow(section.title, section.status, section.summary)));
    }
  }

  const exceptionItems = [
    ...intakeReview.blockers.map((item) => `${item.title}: ${item.summary}`),
    ...draft.packageReadiness.items.map((item) => `${item.title} [${item.severity}]`),
    ...packageQuality.checks
      .filter((check) => check.status !== "ready")
      .map((check) => `${check.title}: ${check.summary}`),
  ];

  const supportGroupsMap = new Map<string, string[]>();
  draft.documents.forEach((document) => {
    const key = document.requestLabel ?? document.category.replace(/_/g, " ");
    const current = supportGroupsMap.get(key) ?? [];
    current.push(document.name);
    supportGroupsMap.set(key, current);
  });
  const supportGroups = Array.from(supportGroupsMap.entries()).map(([label, items]) => ({ label, items }));

  const lines: string[] = [
    "# Tina CPA Review Packet",
    "",
    `- Business: ${businessName}`,
    `- Tax year: ${taxYear}`,
    `- Filing lane: ${lane.title}`,
    `- Packet status: ${handoff.summary}`,
    `- Next step: ${handoff.nextStep}`,
    "",
    "## Packet sections",
  ];

  handoff.artifacts.forEach((artifact) => {
    lines.push(`- ${artifact.title} [${artifact.status}]`);
    lines.push(`  - ${artifact.summary}`);
    artifact.includes.forEach((item) => {
      lines.push(`  - ${item}`);
    });
  });

  if (lane.support === "supported") {
    lines.push("", "## Schedule C draft");
    if (draft.scheduleCDraft.fields.length > 0) {
      draft.scheduleCDraft.fields.forEach((field) => {
        lines.push(
          `- ${field.lineNumber} ${field.label}: ${formatMoney(field.amount)} [${field.status}]`
        );
        lines.push(`  - ${field.summary}`);
      });
    } else {
      lines.push("- Tina has not built any Schedule C draft boxes yet.");
    }

    if (draft.scheduleCDraft.notes.length > 0) {
      lines.push("", "## Draft notes");
      draft.scheduleCDraft.notes.forEach((note) => {
        lines.push(`- ${note.title} [${note.severity}]`);
        lines.push(`  - ${note.summary}`);
      });
    }
  } else {
    lines.push("", "## Entity-return intake contract");
    lines.push(`- Status: ${entityIntakeContract.status.replace(/_/g, " ")}`);
    lines.push(`- Lane: ${entityIntakeContract.laneTitle}`);
    lines.push(`- ${entityIntakeContract.summary}`);
    lines.push(`- Next step: ${entityIntakeContract.nextStep}`);
    if (entityIntakeContract.blockerTitles.length > 0) {
      lines.push("- Intake blockers:");
      entityIntakeContract.blockerTitles.forEach((title) => {
        lines.push(`  - ${title}`);
      });
    }
    if (entityIntakeContract.messySignalTitles.length > 0) {
      lines.push("- Messy signals:");
      entityIntakeContract.messySignalTitles.forEach((title) => {
        lines.push(`  - ${title}`);
      });
    }
    if (sCorpReview.status !== "unsupported") {
      lines.push("", "## 1120-S review spine");
      lines.push(`- Status: ${sCorpReview.status.replace(/_/g, " ")}`);
      lines.push(`- ${sCorpReview.summary}`);
      lines.push(`- Next step: ${sCorpReview.nextStep}`);
      sCorpReview.sections.forEach((section) => {
        lines.push(`- ${section.title} [${section.status}]`);
        lines.push(`  - ${section.summary}`);
        section.includes.forEach((item) => {
          lines.push(`  - ${item}`);
        });
      });
    }
    if (sCorpPrep.status !== "unsupported") {
      lines.push("", "## 1120-S prep spine");
      lines.push(`- Status: ${sCorpPrep.status.replace(/_/g, " ")}`);
      lines.push(`- ${sCorpPrep.summary}`);
      lines.push(`- Next step: ${sCorpPrep.nextStep}`);
      sCorpPrep.sections.forEach((section) => {
        lines.push(`- ${section.title} [${section.status}]`);
        lines.push(`  - ${section.summary}`);
        lines.push(`  - Next prep action: ${section.nextPrepAction}`);
        section.includes.forEach((item) => {
          lines.push(`  - ${item}`);
        });
      });
    }
  }

  lines.push("", "## Open items");
  if (draft.packageReadiness.items.length > 0) {
    draft.packageReadiness.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.severity}]`);
      lines.push(`  - ${item.summary}`);
    });
  } else {
    lines.push("- Tina does not see any open filing-package items right now.");
  }

  lines.push("", "## Saved papers");
  if (draft.documents.length > 0) {
    draft.documents.forEach((document) => {
      lines.push(`- ${document.name} (${document.category.replace(/_/g, " ")})`);
    });
  } else {
    lines.push("- No saved papers yet.");
  }

  lines.push("", "## Client intake review");
  lines.push(`- Status: ${intakeReview.status.replace(/_/g, " ")}`);
  lines.push(`- Profile lane: ${intakeReview.laneTitle}`);
  lines.push(
    `- Document lane: ${
      intakeReview.likelyLaneByDocuments === "unknown"
        ? "Needs lane confirmation"
        : intakeReview.likelyLaneByDocuments.replace(/_/g, " ")
    }`
  );
  lines.push(`- ${intakeReview.summary}`);
  lines.push(`- Next step: ${intakeReview.nextStep}`);
  if (intakeReview.blockers.length > 0) {
    lines.push("- Intake blockers:");
    intakeReview.blockers.forEach((item) => {
      lines.push(`  - ${item.title}`);
      lines.push(`  - ${item.summary}`);
    });
  }
  if (intakeReview.missingRequired.length > 0) {
    lines.push("- Missing required intake support:");
    intakeReview.missingRequired.forEach((item) => {
      lines.push(`  - ${item.label}`);
    });
  }
  if (intakeReview.messySignals.length > 0) {
    lines.push("- Messy intake signals:");
    intakeReview.messySignals.forEach((item) => {
      lines.push(`  - ${item.title}: ${item.summary}`);
    });
  }

  lines.push("", "## Authority work");
  if (draft.authorityWork.length > 0) {
    draft.authorityWork.forEach((item) => {
      lines.push(`- ${item.ideaId} [${item.status}]`);
      if (item.memo) lines.push(`  - Tina note: ${item.memo}`);
      if (item.reviewerNotes) lines.push(`  - Reviewer note: ${item.reviewerNotes}`);
      lines.push(`  - Citations saved: ${item.citations.length}`);
    });
  } else {
    lines.push("- No saved authority work items yet.");
  }

  lines.push("", "## Tax position register");
  if (draft.taxPositionMemory.records.length > 0) {
    draft.taxPositionMemory.records.forEach((record) => {
      lines.push(`- ${record.title} [${record.status} | confidence: ${record.confidence}]`);
      lines.push(`  - ${record.summary}`);
      lines.push(`  - Treatment: ${record.treatmentSummary}`);
      lines.push(`  - Reviewer guidance: ${record.reviewerGuidance}`);
    });
  } else {
    lines.push("- No saved tax position records yet.");
  }

  if (lane.support === "supported") {
    lines.push("", "## Current-lane scenario profile");
    lines.push(`- ${scenarioProfile.summary}`);
    if (scenarioProfile.signals.length > 0) {
      scenarioProfile.signals.forEach((signal) => {
        lines.push(`- ${signal.title} [${signal.tag}]`);
        lines.push(`  - ${signal.summary}`);
      });
    } else {
      lines.push("- Tina does not see specialized Schedule C scenario families in the current file yet.");
    }

    lines.push("", "## Return trace");
    if (reviewTraceRows.length > 0) {
      reviewTraceRows.forEach((row) => {
        lines.push(
          `- ${row.lineNumber} ${row.label}: ${formatMoney(row.amount)} [${row.fieldStatus}]`
        );
        lines.push(`  - ${row.summary}`);
        if (row.reconciliationStatus !== "unknown") {
          lines.push(
            `  - Reconciliation: ${row.reconciliationStatus.replace(/_/g, " ")}; lineage clusters ${row.lineageCount}`
          );
        }
      });
    } else {
      lines.push("- Tina does not have any return-trace rows yet.");
    }

    lines.push("", "## Numeric proof");
    if (numericProofRows.length > 0) {
      numericProofRows.forEach((row) => {
        lines.push(
          `- ${row.lineNumber} ${row.label}: ${formatMoney(row.amount)} [support: ${row.supportLevel}]`
        );
        lines.push(`  - ${row.summary}`);
        row.bookEntries.forEach((entry) => {
          lines.push(
            `  - ${entry.label}: in ${formatMoney(entry.moneyIn)}, out ${formatMoney(entry.moneyOut)}, net ${formatMoney(entry.net)}, coverage ${entry.dateCoverage ?? "unknown"}`
          );
        });
        row.transactionGroups.forEach((group) => {
          lines.push(`  - Transaction group: ${group}`);
        });
        row.transactionAnchors.forEach((anchor) => {
          lines.push(`  - Anchor: ${anchor}`);
        });
      });
    } else {
      lines.push("- Tina does not have numeric proof rows for the current return draft yet.");
    }

    lines.push("", "## Transaction reconciliation");
    lines.push(`- ${reconciliation.summary}`);
    lines.push(`- Next step: ${reconciliation.nextStep}`);
    if (reconciliation.groups.length > 0) {
      reconciliation.groups.forEach((group) => {
        lines.push(`- ${group.label} [${group.status}]`);
        lines.push(
          `  - ${group.summary} Lineage clusters: ${group.lineageCount}; grouped flows: ${group.transactionGroupCount}; ledger buckets: ${group.bucketCount}; mismatches: ${group.mismatchCount}.`
        );
      });
    } else {
      lines.push("- Tina does not have transaction-group reconciliation rows yet.");
    }
  }

  lines.push("", "## Live acceptance benchmark");
  lines.push(`- ${liveAcceptance.summary}`);
  lines.push(`- Next step: ${liveAcceptance.nextStep}`);
  lines.push(`- Benchmark movement: ${liveAcceptance.benchmarkMovement.summary}`);
  liveAcceptance.windows.forEach((window) => {
    lines.push(
      `- ${window.label}: ${window.totalOutcomes} outcome${window.totalOutcomes === 1 ? "" : "s"}, acceptance score ${window.acceptanceScore ?? 0}/100, trust ${window.trustLevel.replace(/_/g, " ")}`
    );
  });
  if (liveAcceptance.cohorts.length > 0) {
    lines.push("  - Cohorts:");
    liveAcceptance.cohorts.forEach((cohort) => {
      lines.push(
        `  - ${cohort.label}: ${cohort.totalOutcomes} outcome${cohort.totalOutcomes === 1 ? "" : "s"}, acceptance score ${cohort.acceptanceScore ?? 0}/100, trust ${cohort.trustLevel.replace(/_/g, " ")}`
      );
    });
  }
  if (liveAcceptance.currentFileCohorts.length > 0) {
    lines.push("  - Current file cohorts:");
    liveAcceptance.currentFileCohorts.forEach((cohort) => {
      lines.push(
        `  - ${cohort.label}: acceptance score ${cohort.acceptanceScore ?? 0}/100, trust ${cohort.trustLevel.replace(/_/g, " ")}, next step: ${cohort.nextStep}`
      );
    });
  }
  if (liveAcceptance.unstablePatterns.length > 0) {
    lines.push("  - Unstable patterns:");
    liveAcceptance.unstablePatterns.forEach((pattern) => {
      lines.push(
        `  - ${pattern.label}: ${pattern.acceptanceScore}/100, next step: ${pattern.nextStep}`
      );
    });
  }

  lines.push("", "## Benchmark rescore");
  lines.push(`- ${benchmarkRescore.summary}`);
  lines.push(`- Next step: ${benchmarkRescore.nextStep}`);
  const cohortProposalLines =
    benchmarkRescore.cohortProposals.length > 0
      ? benchmarkRescore.cohortProposals.slice(0, 8)
      : [];
  if (cohortProposalLines.length > 0) {
    lines.push("- Cohort-specific proposals:");
    cohortProposalLines.forEach((proposal) => {
      lines.push(
        `  - ${proposal.cohortLabel}: ${proposal.skillId.replace(/_/g, " ")} [${proposal.recommendation}]`
      );
      lines.push(`  - ${proposal.summary}`);
    });
  }

  lines.push("", "## Internal benchmark dashboard");
  lines.push(`- ${benchmarkDashboard.summary}`);
  lines.push(`- Next step: ${benchmarkDashboard.nextStep}`);
  benchmarkDashboard.cards.forEach((card) => {
    lines.push(`- ${card.title} [${card.status}]`);
    lines.push(`  - ${card.summary}`);
    card.lines.forEach((line) => {
      lines.push(`  - ${line}`);
    });
  });

  lines.push("", "## Current-file reviewer reality");
  lines.push(`- ${currentFileReality.summary}`);
  lines.push(`- Next step: ${currentFileReality.nextStep}`);
  currentFileReality.lessons.forEach((lesson) => {
    lines.push(`  - Lesson: ${lesson}`);
  });
  currentFileReality.patterns.forEach((pattern) => {
    lines.push(
      `  - ${pattern.title}: ${pattern.verdict} via ${pattern.matchType === "cohort" ? "cohort match" : "direct file match"}${pattern.matchedCaseTags.length > 0 ? ` [${pattern.matchedCaseTags.join(", ")}]` : ""}`
    );
  });

  lines.push("", "## Final package quality");
  lines.push(`- ${packageQuality.summary}`);
  lines.push(`- Next step: ${packageQuality.nextStep}`);
  packageQuality.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });

  lines.push("", "## Filing approval");
  lines.push(`- Status: ${filingApproval.status.replace(/_/g, " ")}`);
  lines.push(`- ${filingApproval.summary}`);
  lines.push(`- Next step: ${filingApproval.nextStep}`);
  filingApproval.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });

  if (lane.support === "supported") {
    lines.push("", "## MeF readiness");
    lines.push(`- Status: ${mefReadiness.status.replace(/_/g, " ")}`);
    lines.push(`- Return type: ${mefReadiness.returnType}`);
    lines.push(`- Schedules: ${mefReadiness.schedules.join(", ")}`);
    lines.push(`- ${mefReadiness.summary}`);
    lines.push(`- Next step: ${mefReadiness.nextStep}`);
    mefReadiness.checks.forEach((check) => {
      lines.push(`- ${check.title} [${check.status}]`);
      lines.push(`  - ${check.summary}`);
    });
    if (mefReadiness.attachments.length > 0) {
      lines.push("- Attachment manifest:");
      mefReadiness.attachments.forEach((attachment) => {
        lines.push(
          `  - ${attachment.sourceName}: ${attachment.disposition.replace(/_/g, " ")}`
        );
        if (attachment.mefFileName) {
          lines.push(`  - MeF file name: ${attachment.mefFileName}`);
        }
        if (attachment.description) {
          lines.push(`  - Description: ${attachment.description}`);
        }
        lines.push(`  - ${attachment.summary}`);
      });
    }
  }

  if (lane.support === "supported") {
    lines.push("", "## 1040/Schedule C export contract");
    lines.push(`- Status: ${exportContract.status.replace(/_/g, " ")}`);
    lines.push(`- ${exportContract.summary}`);
    lines.push(`- Next step: ${exportContract.nextStep}`);
    lines.push(`- Contract version: ${exportContract.contractVersion}`);
    lines.push(`- Return type: ${exportContract.returnType}`);
    lines.push(`- Schedules: ${exportContract.schedules.join(", ")}`);
    if (exportContract.fields.length > 0) {
      exportContract.fields.forEach((field) => {
        lines.push(
          `- ${field.lineNumber} ${field.label}: ${formatMoney(field.amount)} [${field.status}; support ${field.supportLevel}]`
        );
        lines.push(`  - ${field.summary}`);
        if (field.scenarioTags.length > 0) {
          lines.push(`  - Scenario tags: ${field.scenarioTags.join(", ")}`);
        }
      });
    } else {
      lines.push("- Tina does not have any export-contract fields yet.");
    }
    if (exportContract.unresolvedIssues.length > 0) {
      lines.push("- Unresolved export issues:");
      exportContract.unresolvedIssues.forEach((issue) => {
        lines.push(`  - ${issue.title} [${issue.severity}]`);
        lines.push(`  - ${issue.summary}`);
      });
    }
  }

  lines.push("", "## Review delivery");
  lines.push(`- Status: ${reviewDelivery.status.replace(/_/g, " ")}`);
  lines.push(`- ${reviewDelivery.summary}`);
  lines.push(`- Next step: ${reviewDelivery.nextStep}`);
  reviewDelivery.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });

  lines.push("", "## Planning and tradeoffs");
  lines.push(`- ${planningReport.summary}`);
  lines.push(`- Next step: ${planningReport.nextStep}`);
  if (planningReport.scenarios.length > 0) {
    planningReport.scenarios.forEach((scenario) => {
      lines.push(
        `- ${scenario.title} [support: ${scenario.supportLevel} | payoff: ${scenario.payoffWindow.replace(/_/g, " ")}]`
      );
      lines.push(`  - Tradeoff: ${scenario.tradeoff}`);
      lines.push(`  - Next step: ${scenario.nextStep}`);
    });
  }

  lines.push("", "## Tina note", "");
  lines.push(
    "This packet is a reviewer-ready brief from Tina. It is not a filed return, and it should travel with the source papers and human review notes."
  );

  return {
    fileName: `tina-cpa-packet-${slug}-${taxYear}.html`,
    mimeType: "text/html; charset=utf-8",
    contents: buildPrintablePacketHtml({
      businessName,
      taxYear,
      laneTitle: lane.title,
      packetStatus: handoff.summary,
      nextStep: handoff.nextStep,
      fastPassHtml,
      thresholdsHtml:
        thresholdRows.length > 0
          ? thresholdRows.join("\n")
          : `<div class="empty-note">No threshold rows are available yet.</div>`,
      traceabilityHtml: renderTraceabilityRows(traceabilityRows),
      entityInsertHtml:
        entityRows.length > 0
          ? entityRows.join("\n")
          : `<div class="empty-note">No entity-specific inserts are available yet.</div>`,
      exceptionsHtml: renderBulletItems(exceptionItems),
      supportIndexHtml: renderSupportIndex(supportGroups),
      bodyHtml: renderPacketBodyHtml(lines),
    }),
  };
}
