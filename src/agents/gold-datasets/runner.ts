/**
 * Gold Dataset Runner — Loads test cases and validates agent outputs
 *
 * Two modes:
 *   1. Declarative (JSON): loads .json files, runs `checks` against output
 *   2. Programmatic (TS): uses `validate` functions from index.ts
 *
 * Usage:
 *   import { runGoldDataset, runAllGoldDatasets, loadJsonDataset } from "./runner";
 *
 *   // Run a single agent's JSON dataset
 *   const dataset = loadJsonDataset("research");
 *   const results = runGoldDataset(dataset, agentOutputProducer);
 *
 *   // Validate a single output against a specific test case's checks
 *   const result = validateOutput(testCase, actualOutput);
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  AgentName,
  GoldDatasetFile,
  GoldTestCase,
  GoldDatasetRunResult,
  TestCaseResult,
  ValidationCheck,
  ValidationResult,
  ValidationSeverity,
} from "./schema";

// ── Field access helper ─────────────────────────────────────────────

/**
 * Resolve a dot-path like "dossier.topFacts" against an object.
 * Returns undefined if any segment is missing.
 */
function getField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── Check executors ─────────────────────────────────────────────────

function runCheck(
  check: ValidationCheck,
  output: Record<string, unknown>,
): ValidationResult {
  const base = { checkName: check.name, severity: check.severity };

  switch (check.type) {
    case "field_exists": {
      const val = getField(output, check.field);
      const exists = val !== undefined && val !== null;
      return {
        ...base,
        pass: exists,
        reason: exists
          ? `Field "${check.field}" exists`
          : `Field "${check.field}" is missing or null`,
      };
    }

    case "field_equals": {
      const val = getField(output, check.field);
      const eq = val === check.value;
      return {
        ...base,
        pass: eq,
        reason: eq
          ? `Field "${check.field}" equals ${JSON.stringify(check.value)}`
          : `Field "${check.field}" is ${JSON.stringify(val)}, expected ${JSON.stringify(check.value)}`,
      };
    }

    case "field_in_range": {
      const val = getField(output, check.field);
      if (typeof val !== "number") {
        return { ...base, pass: false, reason: `Field "${check.field}" is not a number (got ${typeof val})` };
      }
      const inRange = val >= check.min && val <= check.max;
      return {
        ...base,
        pass: inRange,
        reason: inRange
          ? `Field "${check.field}" is ${val} (within ${check.min}-${check.max})`
          : `Field "${check.field}" is ${val} (expected ${check.min}-${check.max})`,
      };
    }

    case "field_contains": {
      const val = getField(output, check.field);
      if (typeof val !== "string") {
        return { ...base, pass: false, reason: `Field "${check.field}" is not a string` };
      }
      const lower = val.toLowerCase();
      const found = check.anyOf.some((s) => lower.includes(s.toLowerCase()));
      return {
        ...base,
        pass: found,
        reason: found
          ? `Field "${check.field}" contains one of [${check.anyOf.join(", ")}]`
          : `Field "${check.field}" does not contain any of [${check.anyOf.join(", ")}]`,
      };
    }

    case "field_not_contains": {
      const val = getField(output, check.field);
      if (typeof val !== "string") {
        // If the field doesn't exist as a string, the "not contains" trivially passes
        return { ...base, pass: true, reason: `Field "${check.field}" is not a string (check passes trivially)` };
      }
      const lower = val.toLowerCase();
      const bad = check.noneOf.filter((s) => lower.includes(s.toLowerCase()));
      const clean = bad.length === 0;
      return {
        ...base,
        pass: clean,
        reason: clean
          ? `Field "${check.field}" does not contain forbidden terms`
          : `Field "${check.field}" contains forbidden terms: [${bad.join(", ")}]`,
      };
    }

    case "field_min_length": {
      const val = getField(output, check.field);
      if (typeof val === "string") {
        const ok = val.length >= check.min;
        return {
          ...base,
          pass: ok,
          reason: ok
            ? `Field "${check.field}" length ${val.length} >= ${check.min}`
            : `Field "${check.field}" length ${val.length} < ${check.min}`,
        };
      }
      if (Array.isArray(val)) {
        const ok = val.length >= check.min;
        return {
          ...base,
          pass: ok,
          reason: ok
            ? `Field "${check.field}" has ${val.length} items >= ${check.min}`
            : `Field "${check.field}" has ${val.length} items < ${check.min}`,
        };
      }
      return { ...base, pass: false, reason: `Field "${check.field}" is neither string nor array` };
    }

    case "field_min_count": {
      const val = getField(output, check.field);
      if (!Array.isArray(val)) {
        return { ...base, pass: false, reason: `Field "${check.field}" is not an array` };
      }
      const ok = val.length >= check.min;
      return {
        ...base,
        pass: ok,
        reason: ok
          ? `Field "${check.field}" has ${val.length} items >= ${check.min}`
          : `Field "${check.field}" has ${val.length} items < ${check.min}`,
      };
    }

    case "field_type": {
      const val = getField(output, check.field);
      const actualType = Array.isArray(val) ? "array" : typeof val;
      const ok = actualType === check.expected;
      return {
        ...base,
        pass: ok,
        reason: ok
          ? `Field "${check.field}" is type "${check.expected}"`
          : `Field "${check.field}" is type "${actualType}", expected "${check.expected}"`,
      };
    }

    case "custom": {
      if (!check.fn) {
        return { ...base, pass: true, reason: `Custom check "${check.name}" has no fn (skipped)` };
      }
      try {
        const ok = check.fn(output);
        return {
          ...base,
          pass: ok,
          reason: ok ? `Custom check "${check.name}" passed` : `Custom check "${check.name}" failed`,
        };
      } catch (err) {
        return {
          ...base,
          pass: false,
          reason: `Custom check "${check.name}" threw: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    default:
      return { ...base, pass: false, reason: `Unknown check type: ${(check as ValidationCheck).type}` };
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Validate a single agent output against a test case's checks.
 */
export function validateOutput(
  testCase: GoldTestCase,
  output: Record<string, unknown>,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Run declarative checks
  for (const check of testCase.checks) {
    results.push(runCheck(check, output));
  }

  // Run programmatic validator if present
  if (testCase.validate) {
    const custom = testCase.validate(output);
    results.push({
      pass: custom.pass,
      reason: custom.reason,
      severity: custom.pass ? "pass" : "fail",
      checkName: "validate_fn",
    });
  }

  return results;
}

/**
 * Run a full gold dataset against an output producer function.
 *
 * The `produceOutput` function receives the test case input and should
 * return the agent's output. This allows testing against both real agents
 * and mock/stub outputs.
 */
export async function runGoldDataset(
  dataset: GoldDatasetFile,
  produceOutput: (input: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>,
): Promise<GoldDatasetRunResult> {
  const results: TestCaseResult[] = [];

  for (const testCase of dataset.cases) {
    const start = Date.now();
    try {
      const output = await produceOutput(testCase.input as Record<string, unknown>);
      const validations = validateOutput(testCase, output);
      const hasFailure = validations.some((v) => !v.pass && v.severity === "fail");
      const hasWarn = validations.some((v) => !v.pass && v.severity === "warn");

      results.push({
        testCaseName: testCase.name,
        agentName: dataset.agent,
        pass: !hasFailure,
        validations,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        testCaseName: testCase.name,
        agentName: dataset.agent,
        pass: false,
        validations: [],
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const warned = results.filter((r) =>
    r.validations.some((v) => !v.pass && v.severity === "warn") && r.pass,
  ).length;
  const failed = results.filter((r) => !r.pass).length;

  return {
    agentName: dataset.agent,
    totalCases: dataset.cases.length,
    passed,
    warned,
    failed,
    results,
    runAt: new Date().toISOString(),
  };
}

/**
 * Validate a test case using its expectedOutput as the "output".
 * Useful for verifying that the gold dataset itself is internally consistent
 * (i.e., the expectedOutput passes the checks).
 */
export function selfValidateDataset(dataset: GoldDatasetFile): GoldDatasetRunResult {
  const results: TestCaseResult[] = [];

  for (const testCase of dataset.cases) {
    const start = Date.now();
    const output = testCase.expectedOutput as Record<string, unknown>;
    const validations = validateOutput(testCase, output);
    const hasFailure = validations.some((v) => !v.pass && v.severity === "fail");

    results.push({
      testCaseName: testCase.name,
      agentName: dataset.agent,
      pass: !hasFailure,
      validations,
      durationMs: Date.now() - start,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const warned = results.filter((r) =>
    r.validations.some((v) => !v.pass && v.severity === "warn") && r.pass,
  ).length;
  const failed = results.filter((r) => !r.pass).length;

  return {
    agentName: dataset.agent,
    totalCases: dataset.cases.length,
    passed,
    warned,
    failed,
    results,
    runAt: new Date().toISOString(),
  };
}

/**
 * Load a gold dataset JSON file for a specific agent.
 * Looks in src/agents/gold-datasets/{agentName}.json
 */
export function loadJsonDataset(agentName: AgentName): GoldDatasetFile {
  const filePath = join(__dirname, `${agentName}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Gold dataset file not found: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as GoldDatasetFile;

  if (parsed.agent !== agentName) {
    throw new Error(`Dataset file agent "${parsed.agent}" does not match requested "${agentName}"`);
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported dataset version: ${parsed.version}`);
  }

  return parsed;
}

/**
 * Load all available gold dataset JSON files.
 */
export function loadAllJsonDatasets(): GoldDatasetFile[] {
  const agents: AgentName[] = [
    "research", "qa", "follow-up", "dispo", "exception", "ads-monitor", "browser-research",
  ];
  const datasets: GoldDatasetFile[] = [];
  for (const agent of agents) {
    try {
      datasets.push(loadJsonDataset(agent));
    } catch {
      // Skip agents that don't have a JSON dataset yet
    }
  }
  return datasets;
}

/**
 * Pretty-print a run result to the console.
 */
export function printRunResult(result: GoldDatasetRunResult): void {
  const icon = result.failed === 0 ? "[PASS]" : "[FAIL]";
  console.log(`\n${icon} ${result.agentName}: ${result.passed}/${result.totalCases} passed`);

  for (const tc of result.results) {
    const tcIcon = tc.pass ? "  OK" : "  FAIL";
    console.log(`${tcIcon}  ${tc.testCaseName}`);
    if (tc.error) {
      console.log(`        Error: ${tc.error}`);
    }
    for (const v of tc.validations) {
      if (!v.pass) {
        console.log(`        [${v.severity}] ${v.checkName}: ${v.reason}`);
      }
    }
  }
}

/**
 * Self-validate all loaded JSON datasets and print results.
 * Useful as a CI check to ensure gold datasets are internally consistent.
 */
export function selfValidateAll(): { allPassed: boolean; results: GoldDatasetRunResult[] } {
  const datasets = loadAllJsonDatasets();
  const results: GoldDatasetRunResult[] = [];
  let allPassed = true;

  for (const dataset of datasets) {
    const result = selfValidateDataset(dataset);
    results.push(result);
    if (result.failed > 0) allPassed = false;
    printRunResult(result);
  }

  const total = results.reduce((s, r) => s + r.totalCases, 0);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  console.log(`\n--- Total: ${totalPassed}/${total} passed across ${results.length} agents ---\n`);

  return { allPassed, results };
}
