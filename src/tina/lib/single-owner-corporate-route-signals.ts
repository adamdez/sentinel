export interface TinaSingleOwnerCorporateRouteSignalProfile {
  singleOwnerSignal: boolean;
  llcSignal: boolean;
  sCorpSignal: boolean;
  cCorpSignal: boolean;
  corporateSignal: boolean;
  electionSignal: boolean;
  electionAcceptanceSignal: boolean;
  electionReliefSignal: boolean;
  noPayrollSignal: boolean;
  payrollSignal: boolean;
  payrollAccountSignal: boolean;
  distributionSignal: boolean;
  drawSignal: boolean;
  ownerServiceSignal: boolean;
  reasonableCompSignal: boolean;
}

const SINGLE_OWNER_PATTERNS = [
  /\bsingle member llc\b/i,
  /\bsingle-member llc\b/i,
  /\bsingle owner\b/i,
  /\bsingle-owner\b/i,
  /\bone owner\b/i,
  /\bsole owner\b/i,
  /\bsingle shareholder\b/i,
  /\bsole shareholder\b/i,
];
const LLC_PATTERNS = [/\bllc\b/i, /\blimited liability company\b/i];
const S_CORP_PATTERNS = [
  /\bs corp\b/i,
  /\bs-corp\b/i,
  /\bs corporation\b/i,
  /\b1120-s\b/i,
  /\b1120s\b/i,
  /\bform 2553\b/i,
];
const C_CORP_PATTERNS = [
  /\bc corp\b/i,
  /\bc-corp\b/i,
  /\bc corporation\b/i,
  /\bform 1120\b/i,
  /\b1120\b/i,
  /\bform 8832\b/i,
];
const CORPORATE_PATTERNS = [
  /\bcorporation\b/i,
  /\bcorporate\b/i,
  /\bshareholder\b/i,
  /\bofficer\b/i,
];
const ELECTION_PATTERNS = [
  /\b2553\b/i,
  /\b8832\b/i,
  /\belection\b/i,
  /\bs corp election\b/i,
  /\bc corp election\b/i,
];
const ELECTION_ACCEPTANCE_PATTERNS = [
  /\bacceptance letter\b/i,
  /\birs accepted\b/i,
  /\belection accepted\b/i,
  /\baccepted by the irs\b/i,
];
const ELECTION_RELIEF_PATTERNS = [
  /\blate election\b/i,
  /\blate-election\b/i,
  /\belection relief\b/i,
  /\brelief request\b/i,
  /\brelief may be needed\b/i,
];
const NO_PAYROLL_PATTERNS = [
  /\bno payroll\b/i,
  /\bwithout payroll\b/i,
  /\bnever ran payroll\b/i,
  /\bskipped payroll\b/i,
  /\bno officer wages\b/i,
  /\bowner took draws instead of payroll\b/i,
  /\bdistributions instead of payroll\b/i,
];
const PAYROLL_PATTERNS = [
  /\bpayroll\b/i,
  /\bw-2\b/i,
  /\b941\b/i,
  /\bwages?\b/i,
  /\bsalary\b/i,
  /\bofficer pay\b/i,
  /\bpayroll provider\b/i,
];
const PAYROLL_ACCOUNT_PATTERNS = [
  /\bpayroll account\b/i,
  /\bpayroll provider\b/i,
  /\bgusto\b/i,
  /\badp\b/i,
  /\bpaychex\b/i,
  /\bquickbooks payroll\b/i,
  /\brippling\b/i,
];
const DISTRIBUTION_PATTERNS = [
  /\bdistribution\b/i,
  /\bshareholder distribution\b/i,
  /\bshareholder payout\b/i,
  /\bowner payout\b/i,
];
const DRAW_PATTERNS = [/\bdraws?\b/i, /\bowner draw\b/i, /\bmember draw\b/i];
const OWNER_SERVICE_PATTERNS = [
  /\bowner worked\b/i,
  /\bowner works\b/i,
  /\bowner runs the business\b/i,
  /\bowner operated the business\b/i,
  /\bfull-time owner\b/i,
  /\bactive owner\b/i,
  /\bmaterially participate/i,
  /\bperformed services\b/i,
];
const REASONABLE_COMP_PATTERNS = [
  /\breasonable compensation\b/i,
  /\breasonable comp\b/i,
  /\bofficer salary\b/i,
  /\bshareholder salary\b/i,
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function buildTinaSingleOwnerCorporateRouteSignalProfileFromText(
  text: string
): TinaSingleOwnerCorporateRouteSignalProfile {
  const haystack = normalize(text);
  const noPayrollSignal = hasAny(haystack, NO_PAYROLL_PATTERNS);

  return {
    singleOwnerSignal: hasAny(haystack, SINGLE_OWNER_PATTERNS),
    llcSignal: hasAny(haystack, LLC_PATTERNS),
    sCorpSignal: hasAny(haystack, S_CORP_PATTERNS),
    cCorpSignal: hasAny(haystack, C_CORP_PATTERNS),
    corporateSignal: hasAny(haystack, CORPORATE_PATTERNS),
    electionSignal: hasAny(haystack, ELECTION_PATTERNS),
    electionAcceptanceSignal: hasAny(haystack, ELECTION_ACCEPTANCE_PATTERNS),
    electionReliefSignal: hasAny(haystack, ELECTION_RELIEF_PATTERNS),
    noPayrollSignal,
    payrollSignal: hasAny(haystack, PAYROLL_PATTERNS) && !noPayrollSignal,
    payrollAccountSignal: hasAny(haystack, PAYROLL_ACCOUNT_PATTERNS) && !noPayrollSignal,
    distributionSignal: hasAny(haystack, DISTRIBUTION_PATTERNS),
    drawSignal: hasAny(haystack, DRAW_PATTERNS),
    ownerServiceSignal: hasAny(haystack, OWNER_SERVICE_PATTERNS),
    reasonableCompSignal: hasAny(haystack, REASONABLE_COMP_PATTERNS),
  };
}
