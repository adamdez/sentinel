import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "src", "tina", "data", "irs-authority-registry.json");
const OUTPUT_DIR =
  process.env.TINA_IRS_WATCH_OUTPUT_DIR ??
  path.join(ROOT, "output", "tina-irs-authority-watch");
const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.TINA_IRS_WATCH_TIMEOUT_MS ?? `${30_000}`,
  10
);

if (!fs.existsSync(MANIFEST_PATH)) {
  throw new Error(`IRS authority manifest not found at ${MANIFEST_PATH}`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const sources = Array.isArray(manifest.sources) ? manifest.sources : [];
const latestReportPath = path.join(OUTPUT_DIR, "latest.json");
const previousReport = fs.existsSync(latestReportPath)
  ? JSON.parse(fs.readFileSync(latestReportPath, "utf8"))
  : null;
const previousResultsById = new Map(
  Array.isArray(previousReport?.results)
    ? previousReport.results.map((result) => [result.id, result])
    : []
);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function toSha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractTitle(body) {
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? collapseWhitespace(match[1]) : null;
}

function compareWithPrevious(previous, next) {
  if (!previous) return "new";

  if (
    previous.status !== next.status ||
    previous.finalUrl !== next.finalUrl ||
    previous.etag !== next.etag ||
    previous.lastModified !== next.lastModified ||
    previous.bodyHash !== next.bodyHash
  ) {
    return "changed";
  }

  return "unchanged";
}

async function inspectSource(source) {
  const startedAt = new Date().toISOString();

  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "Sentinel-Tina-IRS-Authority-Watch/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });
    const body = await response.text();
    const contentType = response.headers.get("content-type");
    const bodyHash = toSha256(body);
    const title = contentType?.includes("html") ? extractTitle(body) : null;

    return {
      id: source.id,
      title: source.title,
      url: source.url,
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
      contentType,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      bodyHash,
      pageTitle: title,
      checkedAt: startedAt,
      error: null,
    };
  } catch (error) {
    return {
      id: source.id,
      title: source.title,
      url: source.url,
      finalUrl: source.url,
      status: null,
      ok: false,
      contentType: null,
      etag: null,
      lastModified: null,
      bodyHash: null,
      pageTitle: null,
      checkedAt: startedAt,
      error: error instanceof Error ? error.message : "Unknown fetch failure",
    };
  }
}

function buildSummary(report) {
  const total = report.results.length;
  const okCount = report.results.filter((result) => result.ok).length;
  const changed = report.results.filter((result) => result.changeType === "changed").length;
  const fresh = report.results.filter((result) => result.changeType === "new").length;
  const failed = report.results.filter((result) => !result.ok).length;

  const lines = [
    "# Tina IRS Authority Watch",
    "",
    `- Ran at: ${report.generatedAt}`,
    `- Registry verified in code: ${report.verifiedAt}`,
    `- Supported tax year in code: ${report.supportedTaxYear}`,
    `- Sources checked: ${total}`,
    `- Reachable sources: ${okCount}`,
    `- Changed since last report: ${changed}`,
    `- First-time sources in this report: ${fresh}`,
    `- Failed checks: ${failed}`,
    "",
    "## Results",
    "",
  ];

  for (const result of report.results) {
    const state = !result.ok
      ? "failed"
      : result.changeType === "changed"
        ? "changed"
        : result.changeType === "new"
          ? "new"
          : "unchanged";
    lines.push(`- ${result.title}: ${state}`);
    lines.push(`  - URL: ${result.finalUrl}`);
    if (result.pageTitle) lines.push(`  - Page title: ${result.pageTitle}`);
    if (result.lastModified) lines.push(`  - Last-Modified: ${result.lastModified}`);
    if (result.etag) lines.push(`  - ETag: ${result.etag}`);
    if (!result.ok && result.error) lines.push(`  - Error: ${result.error}`);
  }

  return `${lines.join("\n")}\n`;
}

const results = [];

for (const source of sources) {
  const inspected = await inspectSource(source);
  const previous = previousResultsById.get(source.id) ?? null;
  results.push({
    ...inspected,
    changeType: compareWithPrevious(previous, inspected),
  });
}

const generatedAt = new Date().toISOString();
const safeTimestamp = generatedAt.replace(/[:.]/g, "-");
const report = {
  generatedAt,
  manifestVersion: manifest.version,
  verifiedAt: manifest.verifiedAt,
  supportedTaxYear: manifest.supportedTaxYear,
  sourceCount: sources.length,
  results,
};

const snapshotPath = path.join(OUTPUT_DIR, `snapshot-${safeTimestamp}.json`);
const summaryPath = path.join(OUTPUT_DIR, "summary.md");

fs.writeFileSync(snapshotPath, JSON.stringify(report, null, 2));
fs.writeFileSync(latestReportPath, JSON.stringify(report, null, 2));
fs.writeFileSync(summaryPath, buildSummary(report));

console.log(`Wrote Tina IRS authority watch summary to ${summaryPath}`);
console.log(`Wrote Tina IRS authority watch snapshot to ${snapshotPath}`);
