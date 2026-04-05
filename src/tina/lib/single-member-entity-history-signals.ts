export interface TinaSingleMemberEntityHistorySignalProfile {
  singleMemberSignal: boolean;
  solePropSignal: boolean;
  spouseSignal: boolean;
  communityPropertySignal: boolean;
  multiOwnerSignal: boolean;
  ownershipChangeSignal: boolean;
  transitionTimelineSignal: boolean;
  priorReturnSignal: boolean;
  priorReturnMismatchSignal: boolean;
  booksNotCaughtUpSignal: boolean;
  corporateBooksSignal: boolean;
  payrollStartedSignal: boolean;
  scheduleCSignal: boolean;
  partnershipSignal: boolean;
  ownershipProofSignal: boolean;
}

const SINGLE_MEMBER_PATTERNS = [
  /\bsingle member llc\b/i,
  /\bsingle-member llc\b/i,
  /\bsingle owner\b/i,
  /\bsingle-owner\b/i,
  /\bone owner\b/i,
  /\bsole owner\b/i,
  /\bsole member\b/i,
];
const SOLE_PROP_PATTERNS = [/\bsole prop\b/i, /\bsole proprietor\b/i, /\bschedule c\b/i];
const SPOUSE_PATTERNS = [
  /\bspouse\b/i,
  /\bmarried couple\b/i,
  /\bhusband wife\b/i,
  /\bwife husband\b/i,
];
const COMMUNITY_PROPERTY_PATTERNS = [
  /\bcommunity property\b/i,
  /\bqualified joint venture\b/i,
  /\bqjv\b/i,
];
const MULTI_OWNER_PATTERNS = [
  /\btwo or more members\b/i,
  /\bmultiple owners\b/i,
  /\bmulti owner\b/i,
  /\bmulti-owner\b/i,
  /\bmulti member llc\b/i,
  /\bmulti-member llc\b/i,
  /\b50 50\b/i,
  /\bownership percentage\b/i,
  /\bpartner\b/i,
];
const OWNERSHIP_CHANGE_PATTERNS = [
  /\bownership changed\b/i,
  /\bowner exit\b/i,
  /\bowner enter\b/i,
  /\bnew owner\b/i,
  /\bpartner exit\b/i,
  /\bbuyout\b/i,
  /\bredemption\b/i,
  /\bformer owner\b/i,
  /\btransfer\b/i,
  /\bdivorce\b/i,
  /\binheritance\b/i,
];
const TRANSITION_TIMELINE_PATTERNS = [
  /\btransition timeline\b/i,
  /\bconversion date\b/i,
  /\bchanged structure\b/i,
  /\bbecame an llc\b/i,
  /\bbecame an s corp\b/i,
  /\bentity changed\b/i,
  /\bmidyear\b/i,
  /\bmid-year\b/i,
];
const PRIOR_RETURN_PATTERNS = [
  /\bprior return\b/i,
  /\bprior-year\b/i,
  /\bprior year\b/i,
  /\bfiled return family\b/i,
  /\bchanged accountants twice\b/i,
  /\bprior preparer\b/i,
];
const PRIOR_RETURN_MISMATCH_PATTERNS = [
  /\bno clean election trail\b/i,
  /\bno one sure how it was taxed\b/i,
  /\bcontradict current bookkeeping posture\b/i,
  /\bbooks and filings never caught up\b/i,
  /\bprior returns still reflect the old posture\b/i,
  /\bprior returns may contradict current bookkeeping posture\b/i,
  /\bbooks still look like the old business\b/i,
  /\breturn family may have changed midstream\b/i,
];
const BOOKS_NOT_CAUGHT_UP_PATTERNS = [
  /\bbooks never caught up\b/i,
  /\bchart of accounts\b/i,
  /\bstill reflect the old posture\b/i,
  /\bstill reflect the old business\b/i,
  /\bowner-flow labels\b/i,
  /\bseparate entity books actually started\b/i,
  /\bwhen payroll and separate entity books actually started\b/i,
  /\brestated current-year books\b/i,
  /\bold business\b/i,
];
const CORPORATE_BOOKS_PATTERNS = [
  /\bpayroll like an s corp\b/i,
  /\bofficer pay\b/i,
  /\bshareholder distribution\b/i,
  /\bshareholder\b/i,
  /\bwages versus draws\b/i,
  /\bequity labels\b/i,
];
const PAYROLL_STARTED_PATTERNS = [
  /\bwhen payroll started\b/i,
  /\bpayroll actually started\b/i,
  /\bseparate entity books actually started\b/i,
  /\bran payroll\b/i,
];
const PARTNERSHIP_PATTERNS = [/\b1065\b/i, /\bschedule k-1\b/i, /\bpartnership\b/i];
const OWNERSHIP_PROOF_PATTERNS = [
  /\boperating agreement\b/i,
  /\bcap table\b/i,
  /\bownership schedule\b/i,
  /\bbuyout agreement\b/i,
  /\btransfer agreement\b/i,
  /\bmembership certificates\b/i,
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function buildTinaSingleMemberEntityHistorySignalProfileFromText(
  text: string
): TinaSingleMemberEntityHistorySignalProfile {
  const haystack = normalize(text);

  return {
    singleMemberSignal: hasAny(haystack, SINGLE_MEMBER_PATTERNS),
    solePropSignal: hasAny(haystack, SOLE_PROP_PATTERNS),
    spouseSignal: hasAny(haystack, SPOUSE_PATTERNS),
    communityPropertySignal: hasAny(haystack, COMMUNITY_PROPERTY_PATTERNS),
    multiOwnerSignal: hasAny(haystack, MULTI_OWNER_PATTERNS),
    ownershipChangeSignal: hasAny(haystack, OWNERSHIP_CHANGE_PATTERNS),
    transitionTimelineSignal: hasAny(haystack, TRANSITION_TIMELINE_PATTERNS),
    priorReturnSignal: hasAny(haystack, PRIOR_RETURN_PATTERNS),
    priorReturnMismatchSignal: hasAny(haystack, PRIOR_RETURN_MISMATCH_PATTERNS),
    booksNotCaughtUpSignal: hasAny(haystack, BOOKS_NOT_CAUGHT_UP_PATTERNS),
    corporateBooksSignal: hasAny(haystack, CORPORATE_BOOKS_PATTERNS),
    payrollStartedSignal: hasAny(haystack, PAYROLL_STARTED_PATTERNS),
    scheduleCSignal: hasAny(haystack, SOLE_PROP_PATTERNS),
    partnershipSignal: hasAny(haystack, PARTNERSHIP_PATTERNS),
    ownershipProofSignal: hasAny(haystack, OWNERSHIP_PROOF_PATTERNS),
  };
}
