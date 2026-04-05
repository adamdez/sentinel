export interface TinaPayrollComplianceSignalProfile {
  payrollSignal: boolean;
  payrollProviderSignal: boolean;
  manualPayrollSignal: boolean;
  quarterlyFilingSignal: boolean;
  annualWageFormSignal: boolean;
  depositSignal: boolean;
  missedComplianceSignal: boolean;
  ownerCompSignal: boolean;
  contractorSignal: boolean;
  quarterMentions: string[];
}

const PAYROLL_PATTERNS = [
  /\bpayroll\b/i,
  /\bpayroll register\b/i,
  /\bpayroll summary\b/i,
  /\bw-2\b/i,
  /\bwages?\b/i,
  /\bsalary\b/i,
  /\bofficer pay\b/i,
  /\breasonable compensation\b/i,
];
const PAYROLL_PROVIDER_PATTERNS = [
  /\bpayroll provider\b/i,
  /\bgusto\b/i,
  /\badp\b/i,
  /\bpaychex\b/i,
  /\bquickbooks payroll\b/i,
  /\brippling\b/i,
];
const MANUAL_PAYROLL_PATTERNS = [
  /\bmanual payroll\b/i,
  /\bpaid wages manually\b/i,
  /\bmanual paychecks?\b/i,
  /\bpayroll journal\b/i,
  /\bhandwritten payroll\b/i,
];
const QUARTERLY_FILING_PATTERNS = [
  /\b941\b/i,
  /\bquarterly payroll\b/i,
  /\bquarterly filing\b/i,
  /\bquarterly return\b/i,
  /\bq[1-4]\b/i,
  /\bfirst quarter\b/i,
  /\bsecond quarter\b/i,
  /\bthird quarter\b/i,
  /\bfourth quarter\b/i,
];
const ANNUAL_WAGE_FORM_PATTERNS = [
  /\bw-2\b/i,
  /\bw-3\b/i,
  /\byear-end wage\b/i,
  /\bannual wage form\b/i,
];
const DEPOSIT_PATTERNS = [
  /\bdeposit schedule\b/i,
  /\bpayroll deposit\b/i,
  /\bpayroll tax deposit\b/i,
  /\beftps\b/i,
  /\bwithholding deposit\b/i,
  /\bfuta deposit\b/i,
];
const MISSED_COMPLIANCE_PATTERNS = [
  /\blate deposit\b/i,
  /\bmissed deposit\b/i,
  /\blate payroll filing\b/i,
  /\bmissing payroll filing\b/i,
  /\bpayroll filings? (?:lagged|broke|missing|late|incomplete)\b/i,
  /\bincomplete or inconsistent\b/i,
  /\bbroken compliance trail\b/i,
  /\bnot filed\b/i,
  /\bunfiled\b/i,
  /\blate or missing\b/i,
];
const OWNER_COMP_PATTERNS = [
  /\bofficer pay\b/i,
  /\bshareholder salary\b/i,
  /\bowner compensation\b/i,
  /\bowner comp\b/i,
  /\breasonable compensation\b/i,
];
const CONTRACTOR_PATTERNS = [
  /\b1099\b/i,
  /\bcontractor\b/i,
  /\bsubcontractor\b/i,
  /\bcontract labor\b/i,
  /\bvendor labor\b/i,
];
const NEGATED_PAYROLL_PATTERNS = [
  /\bno payroll\b/i,
  /\bwithout payroll\b/i,
  /\bno payroll provider\b/i,
  /\bnot on payroll\b/i,
];
const NEGATED_PROVIDER_PATTERNS = [/\bno payroll provider\b/i, /\bwithout a payroll provider\b/i];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function extractQuarterMentions(text: string): string[] {
  const matches = [
    ...Array.from(text.matchAll(/\bq([1-4])\b/gi)).map((match) => `Q${match[1]}`),
    ...Array.from(text.matchAll(/\b(first|second|third|fourth) quarter\b/gi)).map((match) => {
      const label = (match[1] ?? "").toLowerCase();
      return label === "first"
        ? "Q1"
        : label === "second"
          ? "Q2"
          : label === "third"
            ? "Q3"
            : "Q4";
    }),
  ];

  return unique(matches);
}

export function buildTinaPayrollComplianceSignalProfileFromText(
  text: string
): TinaPayrollComplianceSignalProfile {
  const haystack = normalize(text);
  const negatedPayroll = hasAny(haystack, NEGATED_PAYROLL_PATTERNS);
  const negatedProvider = hasAny(haystack, NEGATED_PROVIDER_PATTERNS);

  return {
    payrollSignal: hasAny(haystack, PAYROLL_PATTERNS) && !negatedPayroll,
    payrollProviderSignal: hasAny(haystack, PAYROLL_PROVIDER_PATTERNS) && !negatedProvider,
    manualPayrollSignal: hasAny(haystack, MANUAL_PAYROLL_PATTERNS),
    quarterlyFilingSignal: hasAny(haystack, QUARTERLY_FILING_PATTERNS),
    annualWageFormSignal: hasAny(haystack, ANNUAL_WAGE_FORM_PATTERNS),
    depositSignal: hasAny(haystack, DEPOSIT_PATTERNS),
    missedComplianceSignal: hasAny(haystack, MISSED_COMPLIANCE_PATTERNS),
    ownerCompSignal: hasAny(haystack, OWNER_COMP_PATTERNS),
    contractorSignal: hasAny(haystack, CONTRACTOR_PATTERNS),
    quarterMentions: extractQuarterMentions(text),
  };
}
