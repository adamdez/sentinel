/**
 * Valuation Surface Audit Tests
 *
 * These tests verify that NO inline MAO/ARV formulas remain in the codebase.
 * Every visible dollar amount derived from ARV or MAO must import from
 * src/lib/valuation.ts.
 *
 * If a new file introduces an inline formula, these tests will catch it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const SRC_ROOT = join(__dirname, "..", "..");

// Files that are ALLOWED to contain MAO/formula math
const ALLOWED_FILES = new Set([
  "src/lib/valuation.ts",           // The canonical kernel itself
  "src/lib/__tests__/valuation-kernel.test.ts",  // Its tests
  "src/lib/__tests__/valuation-phase25.test.ts", // Phase 2.5 tests
  "src/lib/__tests__/valuation-surface-audit.test.ts",  // This file
  "docs/comp-calculator-template.md", // Documentation reference
]);

function walkDir(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
        walkDir(full, files);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        files.push(full);
      }
    } catch {
      // skip unreadable
    }
  }
  return files;
}

/**
 * Patterns that indicate inline MAO/ARV formulas.
 * These should ONLY appear in the kernel or its tests.
 */
const FORBIDDEN_PATTERNS = [
  // Hardcoded MAO percentages applied to ARV
  /arv\s*\*\s*0\.75/i,
  /arv\s*\*\s*0\.70/i,
  /arv\s*\*\s*0\.65/i,
  // Hardcoded rehab as percentage of ARV
  /arv\s*\*\s*0\.10/i,
  // Hardcoded "$40,000" or "40000" as rehab (in formula context)
  /bestArv\s*\*\s*0\.75\s*-\s*40000/,
  // AVM quick screen percentages
  /avm\s*\*\s*0\.50/i,
  /avm\s*\*\s*0\.65/i,
];

describe("valuation surface audit", () => {
  const allFiles = walkDir(SRC_ROOT);

  it("no inline MAO/ARV formulas exist outside the kernel", () => {
    const violations: { file: string; line: number; pattern: string; content: string }[] = [];

    for (const filePath of allFiles) {
      const rel = relative(SRC_ROOT, filePath).replace(/\\/g, "/");
      if (ALLOWED_FILES.has(rel)) continue;

      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file: rel,
              line: i + 1,
              pattern: pattern.source,
              content: line.trim().substring(0, 100),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line} — matched /${v.pattern}/ — "${v.content}"`)
        .join("\n");
      expect.fail(
        `Found ${violations.length} inline MAO/ARV formula(s) outside the valuation kernel:\n${msg}\n\nAll formula logic must use imports from src/lib/valuation.ts`,
      );
    }
  });

  it("valuation kernel file exists and exports required functions", () => {
    const kernelPath = join(SRC_ROOT, "lib", "valuation.ts");
    const content = readFileSync(kernelPath, "utf-8");
    expect(content).toContain("export function calculateARVRange");
    expect(content).toContain("export function calculateArvConfidence");
    expect(content).toContain("export function calculateQuickScreen");
    expect(content).toContain("export function calculateWholesaleUnderwrite");
    expect(content).toContain("export function buildValuationWarnings");
    expect(content).toContain("export function buildValuationSnapshot");
    expect(content).toContain("export function getRehabGuidance");
    expect(content).toContain("FORMULA_VERSION");
    expect(content).toContain("export const DEFAULTS");
  });

  it("master-client-file-modal imports from valuation kernel", () => {
    const mcfPath = join(SRC_ROOT, "components", "sentinel", "master-client-file-modal.tsx");
    const content = readFileSync(mcfPath, "utf-8");
    expect(content).toContain("from \"@/lib/valuation\"");
    expect(content).toContain("calculateWholesaleUnderwrite");
  });

  it("calculator-tab imports from valuation kernel", () => {
    const calcPath = join(SRC_ROOT, "components", "sentinel", "client-file-v2", "tabs", "calculator-tab.tsx");
    const content = readFileSync(calcPath, "utf-8");
    expect(content).toContain("from \"@/lib/valuation\"");
    expect(content).toContain("calculateWholesaleUnderwrite");
  });

  it("deep-crawl route imports from valuation kernel", () => {
    const deepCrawlPath = join(SRC_ROOT, "app", "api", "prospects", "deep-crawl", "route.ts");
    const content = readFileSync(deepCrawlPath, "utf-8");
    expect(content).toContain("from \"@/lib/valuation\"");
    expect(content).toContain("calculateQuickScreen");
  });
});
