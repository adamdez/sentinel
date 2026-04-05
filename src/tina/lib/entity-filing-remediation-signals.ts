import { buildTinaEntityContinuitySignalProfileFromText } from "@/tina/lib/entity-continuity-signals";
import type { TinaFilingLaneId } from "@/tina/types";

export interface TinaEntityFilingRemediationSignalProfile {
  priorReturnLanes: TinaFilingLaneId[];
  electionLanes: TinaFilingLaneId[];
  likelyMissingLanes: TinaFilingLaneId[];
  hasPriorReturnFamilySignal: boolean;
  hasElectionSignal: boolean;
  hasElectionAcceptanceSignal: boolean;
  hasElectionRejectionSignal: boolean;
  hasMissingReturnSignal: boolean;
  hasExtensionSignal: boolean;
  hasPriorPreparerMismatchSignal: boolean;
  hasElectionReliefSignal: boolean;
  hasElectionUnprovedSignal: boolean;
  hasTransitionTimelineSignal: boolean;
  hasStateRegistrationDriftSignal: boolean;
  hasInitialEntityTypeSignal: boolean;
  hasBeginningBalanceDriftSignal: boolean;
  hasAmendedReturnSignal: boolean;
  hasAmendmentSequencingSignal: boolean;
  hasBacklogYearSignal: boolean;
  hasOwnerCountDuringYearSignal: boolean;
  hasMultiOwnerSignal: boolean;
  hasSingleOwnerSignal: boolean;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueLanes(values: TinaFilingLaneId[]): TinaFilingLaneId[] {
  return Array.from(new Set(values.filter((value) => value !== "unknown")));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function inferLanesFromText(text: string): TinaFilingLaneId[] {
  const lanes: TinaFilingLaneId[] = [];

  if (/\bschedule c\b|\bform 1040\b|\bdisregarded\b|\bsole prop\b/i.test(text)) {
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

  return uniqueLanes(lanes);
}

function collectLikelyMissingLanes(text: string): TinaFilingLaneId[] {
  const lanes: TinaFilingLaneId[] = [];

  if (
    /\bno 1065\b|\bmissing 1065\b|\bmissing partnership return\b|\bno partnership return\b|\bunfiled partnership return\b/i.test(
      text
    )
  ) {
    lanes.push("1065");
  }
  if (
    /\bno 1120-s\b|\bno 1120s\b|\bmissing 1120-s\b|\bmissing 1120s\b|\bunfiled s corp return\b|\bno s corp return\b/i.test(
      text
    )
  ) {
    lanes.push("1120_s");
  }
  if (
    /\bno 1120\b|\bmissing 1120\b|\bunfiled c corp return\b|\bno c corp return\b/i.test(text)
  ) {
    lanes.push("1120");
  }
  if (/\bmissing schedule c\b|\bno schedule c\b|\bunfiled schedule c\b/i.test(text)) {
    lanes.push("schedule_c_single_member_llc");
  }

  return uniqueLanes(lanes);
}

export function buildTinaEntityFilingRemediationSignalProfileFromText(
  text: string
): TinaEntityFilingRemediationSignalProfile {
  const normalizedText = normalize(text);
  const continuitySignals = buildTinaEntityContinuitySignalProfileFromText(text);
  const likelyMissingLanes = collectLikelyMissingLanes(text);
  const hasElectionAcceptancePhrase =
    /\birs acceptance\b|\bacceptance letter\b|\baccepted by irs\b|\baccepted election\b|\bacceptance trail\b/i.test(
      normalizedText
    );
  const hasElectionAcceptanceNegation =
    /\b(no|missing|weak|absent|without|unclear|can t prove)\b[^.]{0,24}\b(irs acceptance|acceptance letter|accepted by irs|accepted election|acceptance trail)\b/i.test(
      normalizedText
    );

  return {
    priorReturnLanes: uniqueLanes([
      ...continuitySignals.priorFilingLanes,
      ...inferLanesFromText(
        Array.from(
          normalizedText.matchAll(
            /\bprior(?:-|\s)?year\b[^.]{0,120}|\bprior return\b[^.]{0,120}|\bfiled return\b[^.]{0,120}/gi
          )
        )
          .map((match) => match[0] ?? "")
          .join(" ")
      ),
    ]),
    electionLanes: uniqueLanes([
      ...continuitySignals.electionLanes,
      ...inferLanesFromText(
        Array.from(
          normalizedText.matchAll(
            /\bform 2553\b[^.]{0,120}|\bform 8832\b[^.]{0,120}|\blate election\b[^.]{0,120}|\belection trail\b[^.]{0,120}/gi
          )
        )
          .map((match) => match[0] ?? "")
          .join(" ")
      ),
    ]),
    likelyMissingLanes,
    hasPriorReturnFamilySignal:
      continuitySignals.priorFilingLanes.length > 0 ||
      /\bprior(?:-|\s)?year\b|\bprior return\b|\bfiled return\b|\bprior preparer\b/i.test(
        normalizedText
      ),
    hasElectionSignal:
      continuitySignals.electionLanes.length > 0 ||
      /\bform 2553\b|\bform 8832\b|\belection\b|\bs corporation\b|\bc corporation\b/i.test(
        normalizedText
      ),
    hasElectionAcceptanceSignal:
      hasElectionAcceptancePhrase && !hasElectionAcceptanceNegation,
    hasElectionRejectionSignal:
      /\brejected\b|\brejection letter\b|\birs rejected\b|\belection failed\b|\binvalid election\b/i.test(
        normalizedText
      ),
    hasMissingReturnSignal:
      /\bmissing\b[^.]{0,30}\b(return|filing|forms?|k-1)\b|\bmissed filings\b|\byears of missed filings\b|\bnever filed\b|\bunfiled\b|\bomitted completely\b|\bno one filed\b/i.test(
        normalizedText
      ) || likelyMissingLanes.length > 0,
    hasExtensionSignal:
      /\bextension\b|\bextended\b|\bform 7004\b|\bform 4868\b|\bextension history\b/i.test(
        normalizedText
      ),
    hasPriorPreparerMismatchSignal:
      /\bprior returns? do not match\b|\bprior return drift\b|\bprior preparers? changed return families correctly\b|\bchanged accountants\b|\bbooks and filings never caught up\b|\bcurrent bookkeeping posture\b/i.test(
        normalizedText
      ),
    hasElectionReliefSignal:
      continuitySignals.hasLateElectionSignal ||
      /\blate election\b|\blate-election\b|\brelief\b|\belection failed\b|\binvalid election\b|\bacceptance trail\b/i.test(
        normalizedText
      ),
    hasElectionUnprovedSignal:
      /\bno clean election trail\b|\bcan t prove\b[^.]{0,20}\belection\b|\bweak or absent\b[^.]{0,20}\belection\b|\bunclear tax\b|\bno one can prove whether\b/i.test(
        normalizedText
      ) ||
      (/\belection documents?\b|\bform 2553 if election is claimed\b/i.test(normalizedText) &&
        !/\birs acceptance\b|\baccepted\b|\bacceptance letter\b/i.test(normalizedText)),
    hasTransitionTimelineSignal:
      continuitySignals.hasEntityChangeSignal ||
      /\bentity changed\b|\bchanged structure\b|\bbecame an llc\b|\blater an s corp\b|\btransition timeline\b|\bconversion dates\b|\bbooks never caught up\b/i.test(
        normalizedText
      ),
    hasStateRegistrationDriftSignal:
      continuitySignals.hasMultiStateSignal ||
      /\bformed in one state\b|\boperating in another\b|\bannual report posture\b|\bqualification state\b|\bstate accounts?\b|\bregistered in\b|\bnexus\b/i.test(
        normalizedText
      ),
    hasInitialEntityTypeSignal:
      /\binitial entity type\b|\bstarted as\b|\bformed as\b|\boriginally a\b|\bbecame an llc\b/i.test(
        normalizedText
      ),
    hasBeginningBalanceDriftSignal:
      /\bbeginning balances?\b|\bopening balances?\b|\brolled? forward\b|\broll from balances\b|\bbooks diverge\b|\bdo not reconcile to filed\b/i.test(
        normalizedText
      ),
    hasAmendedReturnSignal:
      /\bamended return\b|\bamend(ed)? prior-year\b|\bstate amended-return posture\b|\bprior-year filing error\b/i.test(
        normalizedText
      ),
    hasAmendmentSequencingSignal:
      /\bprior-year filing error\b|\bamended return\b|\bcurrent-year adjustment\b|\bseparate those paths\b|\bbefore finalizing the current year\b/i.test(
        normalizedText
      ),
    hasBacklogYearSignal:
      /\bwhich years are missing\b|\bprior years\b|\bbacklog years\b|\byears of missed filings\b|\bmultiple years\b/i.test(
        normalizedText
      ),
    hasOwnerCountDuringYearSignal:
      continuitySignals.hasOwnershipChangeSignal ||
      /\bhow many owners existed during the year and when\b|\bownership timeline\b|\bmidyear owner\b|\bmid-year owner\b|\bwho owned what and when\b/i.test(
        normalizedText
      ),
    hasMultiOwnerSignal:
      /\btwo or more members\b|\bmultiple owners\b|\bmulti owner\b|\bmulti-member llc\b|\bpartners?\b/i.test(
        normalizedText
      ),
    hasSingleOwnerSignal:
      /\bsingle owner\b|\bsingle-owner\b|\bsingle member llc\b|\bsingle-member llc\b/i.test(
        normalizedText
      ),
  };
}
