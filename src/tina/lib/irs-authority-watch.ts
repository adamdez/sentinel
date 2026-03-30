import fs from "node:fs";
import path from "node:path";
import type { TinaIrsAuthorityWatchStatus } from "@/tina/types";

interface TinaIrsAuthorityWatchReportResult {
  ok?: unknown;
  changeType?: unknown;
}

interface TinaIrsAuthorityWatchReport {
  generatedAt?: unknown;
  results?: unknown;
}

function buildMissingStatus(): TinaIrsAuthorityWatchStatus {
  return {
    level: "not_run",
    generatedAt: null,
    checkedCount: 0,
    failedCount: 0,
    changedCount: 0,
    newCount: 0,
    summary: "Tina has not run the IRS freshness watch for the current registry yet.",
    nextStep:
      "Run `npm run tina:irs-watch` so Tina can confirm the watched IRS sources are reachable before leaning on the freshness lane.",
  };
}

export function summarizeTinaIrsAuthorityWatchReport(
  rawReport: unknown
): TinaIrsAuthorityWatchStatus {
  if (!rawReport || typeof rawReport !== "object") {
    return {
      ...buildMissingStatus(),
      level: "needs_review",
      summary: "Tina could not read the latest IRS watch report.",
      nextStep:
        "Inspect `output/tina-irs-authority-watch/latest.json` and rerun `npm run tina:irs-watch` before relying on the watch status.",
    };
  }

  const report = rawReport as TinaIrsAuthorityWatchReport;
  const results = Array.isArray(report.results)
    ? (report.results as TinaIrsAuthorityWatchReportResult[])
    : [];
  const checkedCount = results.length;
  const failedCount = results.filter((result) => result.ok !== true).length;
  const changedCount = results.filter((result) => result.changeType === "changed").length;
  const newCount = results.filter((result) => result.changeType === "new").length;
  const generatedAt = typeof report.generatedAt === "string" ? report.generatedAt : null;

  if (checkedCount === 0) {
    return {
      level: "needs_review",
      generatedAt,
      checkedCount,
      failedCount,
      changedCount,
      newCount,
      summary: "Tina's latest IRS watch report is empty.",
      nextStep:
        "Rerun `npm run tina:irs-watch` before relying on the current watch output.",
    };
  }

  if (failedCount > 0) {
    return {
      level: "needs_review",
      generatedAt,
      checkedCount,
      failedCount,
      changedCount,
      newCount,
      summary: `The latest IRS watch could not reach ${failedCount} watched IRS source${
        failedCount === 1 ? "" : "s"
      }.`,
      nextStep:
        "Review the watch summary and rerun or recertify the IRS registry before leaning on fresh IRS-facing claims.",
    };
  }

  if (changedCount > 0) {
    return {
      level: "needs_review",
      generatedAt,
      checkedCount,
      failedCount,
      changedCount,
      newCount,
      summary: `The latest IRS watch found ${changedCount} changed IRS source${
        changedCount === 1 ? "" : "s"
      } since the prior stored run.`,
      nextStep:
        "Review the changed sources and recertify Tina's IRS registry before leaning on fresh IRS-facing claims.",
    };
  }

  if (newCount > 0 && newCount < checkedCount) {
    return {
      level: "needs_review",
      generatedAt,
      checkedCount,
      failedCount,
      changedCount,
      newCount,
      summary: `The latest IRS watch found ${newCount} newly watched IRS source${
        newCount === 1 ? "" : "s"
      }.`,
      nextStep:
        "Review the newly added sources and recertify Tina's IRS registry before leaning on fresh IRS-facing claims.",
    };
  }

  if (newCount === checkedCount) {
    return {
      level: "healthy",
      generatedAt,
      checkedCount,
      failedCount,
      changedCount,
      newCount,
      summary: `Tina has a first IRS watch baseline for ${checkedCount} watched IRS source${
        checkedCount === 1 ? "" : "s"
      }.`,
      nextStep:
        "Review this baseline once, then rerun the watch whenever the filing season or Tina's supported IRS lane changes.",
    };
  }

  return {
    level: "healthy",
    generatedAt,
    checkedCount,
    failedCount,
    changedCount,
    newCount,
    summary: `The latest IRS watch is clean across ${checkedCount} watched IRS source${
      checkedCount === 1 ? "" : "s"
    }.`,
    nextStep:
      "Keep rerunning the watch when Tina's supported IRS sources or the filing season changes.",
  };
}

export function loadTinaIrsAuthorityWatchStatus(options?: {
  reportPath?: string;
}): TinaIrsAuthorityWatchStatus {
  const reportPath =
    options?.reportPath ??
    path.join(process.cwd(), "output", "tina-irs-authority-watch", "latest.json");

  if (!fs.existsSync(reportPath)) {
    return buildMissingStatus();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(reportPath, "utf8")) as unknown;
    return summarizeTinaIrsAuthorityWatchReport(raw);
  } catch {
    return {
      ...buildMissingStatus(),
      level: "needs_review",
      summary: "Tina could not read the latest IRS watch report.",
      nextStep:
        "Inspect `output/tina-irs-authority-watch/latest.json` and rerun `npm run tina:irs-watch` before relying on the watch status.",
    };
  }
}
