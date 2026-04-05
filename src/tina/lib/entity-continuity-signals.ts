import type { TinaFilingLaneId } from "@/tina/types";

export interface TinaEntityContinuitySignalProfile {
  entityNames: string[];
  eins: string[];
  priorFilingLanes: TinaFilingLaneId[];
  electionLanes: TinaFilingLaneId[];
  ownershipSplitTexts: string[];
  formationStateMentions: string[];
  operatingStateMentions: string[];
  registrationStateMentions: string[];
  hasCurrentYearElectionSignal: boolean;
  hasLateElectionSignal: boolean;
  hasEntityChangeSignal: boolean;
  hasOwnershipChangeSignal: boolean;
  hasBuyoutSignal: boolean;
  hasFormerOwnerSignal: boolean;
  hasMultiStateSignal: boolean;
}

type TinaStatePattern = {
  label: string;
  fullName: string;
  abbreviation?: string;
};

const ENTITY_NAME_PATTERN =
  /\b([A-Z][A-Za-z0-9&,'(). -]{2,80}?\s(?:LLC|L\.L\.C\.|INC|INC\.|CORP|CORP\.|CORPORATION|CO\.|COMPANY|LP|L\.P\.|LTD|L\.T\.D\.|PLC|P\.L\.C\.|PC|P\.C\.))\b/g;
const IGNORED_ENTITY_NAME_PREFIXES = [
  "Form ",
  "Schedule ",
  "IRS ",
  "Line ",
  "State ",
  "Current ",
  "Prior ",
  "Filed ",
];

const STATE_PATTERNS: TinaStatePattern[] = [
  { label: "Washington", fullName: "washington", abbreviation: "WA" },
  { label: "Idaho", fullName: "idaho", abbreviation: "ID" },
  { label: "California", fullName: "california", abbreviation: "CA" },
  { label: "Oregon", fullName: "oregon", abbreviation: "OR" },
  { label: "Delaware", fullName: "delaware", abbreviation: "DE" },
  { label: "Nevada", fullName: "nevada", abbreviation: "NV" },
  { label: "Texas", fullName: "texas", abbreviation: "TX" },
  { label: "Florida", fullName: "florida", abbreviation: "FL" },
  { label: "New York", fullName: "new york", abbreviation: "NY" },
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferLanesFromText(text: string): TinaFilingLaneId[] {
  const lanes: TinaFilingLaneId[] = [];

  if (/\bschedule c\b|\bform 1040\b/i.test(text)) {
    lanes.push("schedule_c_single_member_llc");
  }
  if (/\bform 1065\b|\bpartnership\b|\bk-1\b/i.test(text)) {
    lanes.push("1065");
  }
  if (/\bform 2553\b|\b1120-s\b|\b1120s\b|\bs corporation\b|\bs-corp\b/i.test(text)) {
    lanes.push("1120_s");
  }
  if (/\bform 1120\b|\bc corporation\b|\bc-corp\b/i.test(text)) {
    lanes.push("1120");
  }

  return Array.from(new Set(lanes));
}

function extractEntityNames(text: string): string[] {
  const matches = Array.from(text.matchAll(ENTITY_NAME_PATTERN))
    .map((match) => match[1]?.trim() ?? "")
    .filter((value) => !IGNORED_ENTITY_NAME_PREFIXES.some((prefix) => value.startsWith(prefix)))
    .filter((value) => value.length <= 90);

  return unique(matches);
}

function extractEins(text: string): string[] {
  return unique(text.match(/\b\d{2}-\d{7}\b/g) ?? []);
}

function extractOwnershipSplits(text: string): string[] {
  return unique(
    Array.from(
      text.matchAll(/\b\d{1,3}\s*\/\s*\d{1,3}\b|\b\d{1,3}%\s*(?:and|\/|-)\s*\d{1,3}%\b/gi)
    ).map((match) => match[0]?.trim() ?? "")
  );
}

function collectContextSlices(args: {
  text: string;
  patterns: RegExp[];
  charsBefore: number;
  charsAfter: number;
}): string[] {
  const slices: string[] = [];

  args.patterns.forEach((pattern) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(args.text)) !== null) {
      const start = Math.max(0, match.index - args.charsBefore);
      const end = Math.min(
        args.text.length,
        match.index + (match[0]?.length ?? 0) + args.charsAfter
      );
      slices.push(args.text.slice(start, end));

      if ((match[0] ?? "").length === 0) {
        regex.lastIndex += 1;
      }
    }
  });

  return unique(slices.map((slice) => slice.trim()));
}

function extractStateMentions(args: {
  text: string;
  leadPatterns: string[];
}): string[] {
  const mentions = STATE_PATTERNS.filter((item) =>
    args.leadPatterns.some((leadPattern) => {
      const leadRegex = new RegExp(`${escapeRegExp(leadPattern)}[^.\\n]{0,60}`, "gi");
      const matches = Array.from(args.text.matchAll(leadRegex));

      return matches.some((match) => {
        const slice = match[0] ?? "";
        const normalizedSlice = normalize(slice);

        return (
          normalizedSlice.includes(item.fullName) ||
          (item.abbreviation
            ? new RegExp(`\\b${item.abbreviation}\\b`).test(slice)
            : false)
        );
      });
    })
  ).map((item) => item.label);

  return unique(mentions);
}

export function buildTinaEntityContinuitySignalProfileFromText(
  text: string
): TinaEntityContinuitySignalProfile {
  const normalizedText = normalize(text);
  const priorReturnSlices = collectContextSlices({
    text: normalizedText,
    patterns: [
      /\bprior(?:-|\s)?year\b/i,
      /\bprior return\b/i,
      /\bolder return\b/i,
      /\bfiled return\b/i,
      /\bfiled federal return\b/i,
    ],
    charsBefore: 80,
    charsAfter: 100,
  });
  const currentElectionSlices = collectContextSlices({
    text: normalizedText,
    patterns: [
      /\bcurrent(?:-|\s)?year\b/i,
      /\bthis year\b/i,
      /\blate election\b/i,
      /\bmissing election\b/i,
      /\brelief\b/i,
      /\bbecame\b/i,
      /\bconverted\b/i,
      /\bchanged structure\b/i,
      /\btransition timeline\b/i,
    ],
    charsBefore: 40,
    charsAfter: 140,
  });

  const priorFilingLanes = unique(
    priorReturnSlices.flatMap((slice) => inferLanesFromText(slice))
  ) as TinaFilingLaneId[];
  const electionLanes = unique(
    [
      ...currentElectionSlices.flatMap((slice) => inferLanesFromText(slice)),
      ...(currentElectionSlices.length === 0 && /\bform 2553\b|\b1120-s\b|\b1120s\b|\bs corp\b|\bs-corp\b/i.test(normalizedText)
        ? (["1120_s"] as TinaFilingLaneId[])
        : []),
      ...(currentElectionSlices.length === 0 && /\bform 1120\b|\bc corp\b|\bc-corp\b/i.test(normalizedText)
        ? (["1120"] as TinaFilingLaneId[])
        : []),
    ]
  ) as TinaFilingLaneId[];

  const formationStateMentions = extractStateMentions({
    text,
    leadPatterns: ["formed in", "formation state", "organized in"],
  });
  const operatingStateMentions = extractStateMentions({
    text,
    leadPatterns: ["operating in", "runs operations in", "work is performed in", "customers are served in"],
  });
  const registrationStateMentions = extractStateMentions({
    text,
    leadPatterns: ["registered in", "qualification state", "qualified in", "state account"],
  });

  return {
    entityNames: extractEntityNames(text),
    eins: extractEins(text),
    priorFilingLanes,
    electionLanes,
    ownershipSplitTexts: extractOwnershipSplits(text),
    formationStateMentions,
    operatingStateMentions,
    registrationStateMentions,
    hasCurrentYearElectionSignal: currentElectionSlices.some((slice) =>
      /\b2553\b|\b1120-s\b|\b1120s\b|\bs corporation\b|\bs-corp\b|\b1120\b|\bc corporation\b|\bc-corp\b|\belection\b/i.test(
        slice
      )
    ),
    hasLateElectionSignal:
      /\blate election\b|\bmissing election\b|\blate-election\b|\brelief\b|\bacceptance trail\b/i.test(
        normalizedText
      ),
    hasEntityChangeSignal:
      /\bbecame\b|\bconverted\b|\bchanged structure\b|\btransition timeline\b|\blegal conversion\b/i.test(
        normalizedText
      ),
    hasOwnershipChangeSignal:
      /\bownership changed\b|\bnew owner\b|\bowner exit\b|\bowner enter\b|\bmidyear owner\b|\bmid-year owner\b|\bownership transfer\b|\btransfer of (?:membership|ownership|interest)\b|\bsold interests\b|\bpartner exit\b/i.test(
        normalizedText
      ),
    hasBuyoutSignal: /\bbuyout\b|\bredemption\b/i.test(normalizedText),
    hasFormerOwnerSignal: /\bformer owner\b|\bretired owner\b/i.test(normalizedText),
    hasMultiStateSignal:
      /\bformed in one state\b|\boperating in another\b|\bqualification state\b|\bnexus\b|\bsales-tax permits\b|\bstate accounts\b/i.test(
        normalizedText
      ) ||
      formationStateMentions.length > 0 ||
      operatingStateMentions.length > 0 ||
      registrationStateMentions.length > 0,
  };
}
