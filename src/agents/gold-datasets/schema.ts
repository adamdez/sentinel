/**
 * Gold Dataset Schema — TypeScript types for agent test cases
 *
 * Every agent must have a gold dataset before going to production.
 * Gold datasets are known-good input/output pairs built from real
 * operator-reviewed production data (or hand-crafted seeds).
 *
 * Used for:
 *   1. Regression testing after prompt or logic changes
 *   2. Validating agent outputs before production enable
 *   3. Scoring prompt quality over time
 *   4. Comparing model versions (e.g., Claude 3.5 vs 4)
 */

// ── Core types ──────────────────────────────────────────────────────

export type AgentName =
  | "research"
  | "qa"
  | "follow-up"
  | "dispo"
  | "exception"
  | "ads-monitor"
  | "browser-research";

export type ValidationSeverity = "pass" | "warn" | "fail";

export interface ValidationResult {
  /** Whether the check passed */
  pass: boolean;
  /** Human-readable explanation */
  reason: string;
  /** Severity — "warn" means soft failure (logged but not blocking) */
  severity: ValidationSeverity;
  /** Which check produced this result */
  checkName: string;
}

export interface TestCaseResult {
  testCaseName: string;
  agentName: AgentName;
  pass: boolean;
  validations: ValidationResult[];
  durationMs: number;
  error?: string;
}

export interface GoldDatasetRunResult {
  agentName: AgentName;
  totalCases: number;
  passed: number;
  warned: number;
  failed: number;
  results: TestCaseResult[];
  runAt: string;
}

// ── Validation check definitions (declarative, JSON-serializable) ───

/**
 * A single declarative validation check that can be expressed in JSON.
 * The runner interprets these to validate agent output fields.
 */
export type ValidationCheck =
  | FieldExistsCheck
  | FieldEqualsCheck
  | FieldInRangeCheck
  | FieldContainsCheck
  | FieldNotContainsCheck
  | FieldMinLengthCheck
  | FieldMinCountCheck
  | FieldTypeCheck
  | CustomCheck;

interface BaseCheck {
  /** Name of this check (for reporting) */
  name: string;
  /** Severity if the check fails */
  severity: ValidationSeverity;
}

export interface FieldExistsCheck extends BaseCheck {
  type: "field_exists";
  /** Dot-path to the field, e.g. "dossier.situationSummary" */
  field: string;
}

export interface FieldEqualsCheck extends BaseCheck {
  type: "field_equals";
  field: string;
  value: string | number | boolean | null;
}

export interface FieldInRangeCheck extends BaseCheck {
  type: "field_in_range";
  field: string;
  min: number;
  max: number;
}

export interface FieldContainsCheck extends BaseCheck {
  type: "field_contains";
  /** Dot-path to a string field */
  field: string;
  /** Substrings that should appear (case-insensitive) */
  anyOf: string[];
}

export interface FieldNotContainsCheck extends BaseCheck {
  type: "field_not_contains";
  field: string;
  /** Substrings that must NOT appear (case-insensitive) */
  noneOf: string[];
}

export interface FieldMinLengthCheck extends BaseCheck {
  type: "field_min_length";
  field: string;
  /** Minimum string length or array length */
  min: number;
}

export interface FieldMinCountCheck extends BaseCheck {
  type: "field_min_count";
  /** Dot-path to an array field */
  field: string;
  min: number;
}

export interface FieldTypeCheck extends BaseCheck {
  type: "field_type";
  field: string;
  expected: "string" | "number" | "boolean" | "object" | "array";
}

export interface CustomCheck extends BaseCheck {
  type: "custom";
  /** Description of what the custom check does (for documentation) */
  description: string;
  /** Custom check function — only used when loading from TS, not JSON */
  fn?: (output: Record<string, unknown>) => boolean;
}

// ── Test case structure ─────────────────────────────────────────────

/**
 * A single gold dataset test case. Can be defined in JSON or TypeScript.
 *
 * JSON files use `checks` for declarative validation.
 * TypeScript files can also provide a `validate` function.
 */
export interface GoldTestCase<
  TInput = Record<string, unknown>,
  TExpected = Record<string, unknown>,
> {
  /** Unique name within the dataset */
  name: string;
  /** Human-readable description of what this test case covers */
  description: string;
  /** Agent input payload */
  input: TInput;
  /** Expected output shape (for documentation and reference) */
  expectedOutput: TExpected;
  /** Declarative validation checks (JSON-safe) */
  checks: ValidationCheck[];
  /** Optional programmatic validator (TS only, not serializable) */
  validate?: (output: Record<string, unknown>) => { pass: boolean; reason: string };
}

/**
 * A gold dataset file structure (what the JSON files look like).
 */
export interface GoldDatasetFile {
  /** Which agent this dataset is for */
  agent: AgentName;
  /** Schema version for forward compatibility */
  version: 1;
  /** Description of this dataset */
  description: string;
  /** The test cases */
  cases: GoldTestCase[];
}
