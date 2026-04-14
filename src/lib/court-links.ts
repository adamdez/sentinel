const SPOKANE_SUPERIOR_COURT_VIEWER =
  "https://cp.spokanecounty.org/courtdocumentviewer/PublicViewer/SCAllCasesByCaseNumber.aspx";

const WA_SUPERIOR_COURTS_SEARCH =
  "https://dw.courts.wa.gov/index.cfm?fa=home.superiorSearch&terms=accept%2FWashington-Courts-Search-Case-Records";

type CourtLinkInput = {
  source?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  courtName?: string | null;
  caseNumber?: string | null;
  instrumentNumber?: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isGenericWashingtonCourtUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/dw\.courts\.wa\.gov$/i.test(parsed.hostname)) return false;
    const fa = parsed.searchParams.get("fa")?.toLowerCase() ?? "";
    return fa === "home.namesearchresult"
      || fa === "home.namesearch"
      || fa === "home.casesearch"
      || fa === "home.caselist";
  } catch {
    return false;
  }
}

function isHelpfulRecorderUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /recording\.spokanecounty\.org/i.test(parsed.hostname) && Boolean(parsed.search);
  } catch {
    return false;
  }
}

function looksLikeSpokaneSuperiorCourt(input: CourtLinkInput): boolean {
  const courtNeedle = [
    normalizeText(input.courtName),
    normalizeText(input.sourceLabel),
  ].join(" ");

  if (courtNeedle.includes("spokane county superior court")) return true;

  try {
    const parsed = input.sourceUrl ? new URL(input.sourceUrl) : null;
    return parsed ? /cp\.spokanecounty\.org$/i.test(parsed.hostname) : false;
  } catch {
    return false;
  }
}

function normalizeCaseNumber(caseNumber: string | null | undefined): string | null {
  if (!caseNumber) return null;
  const cleaned = caseNumber.trim().replace(/\s+/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function buildSpokaneSuperiorBridgeUrl(caseNumber: string, fallbackUrl?: string | null): string {
  const params = new URLSearchParams({
    court: "spokane-superior",
    caseNumber,
  });

  if (fallbackUrl) {
    params.set("fallbackUrl", fallbackUrl);
  }

  return `/legal/court-link?${params.toString()}`;
}

export function resolveCourtSourceUrl(input: CourtLinkInput): string | null {
  const rawUrl = input.sourceUrl?.trim() || null;
  const normalizedCaseNumber = normalizeCaseNumber(input.caseNumber);
  const source = normalizeText(input.source);

  if (looksLikeSpokaneSuperiorCourt(input) && normalizedCaseNumber) {
    return buildSpokaneSuperiorBridgeUrl(normalizedCaseNumber, rawUrl ?? SPOKANE_SUPERIOR_COURT_VIEWER);
  }

  if (rawUrl && !isGenericWashingtonCourtUrl(rawUrl)) {
    return rawUrl;
  }

  if (rawUrl && isHelpfulRecorderUrl(rawUrl)) {
    return rawUrl;
  }

  if (looksLikeSpokaneSuperiorCourt(input)) {
    return SPOKANE_SUPERIOR_COURT_VIEWER;
  }

  if (source === "wa_courts" || (rawUrl && isGenericWashingtonCourtUrl(rawUrl))) {
    return WA_SUPERIOR_COURTS_SEARCH;
  }

  if (input.instrumentNumber && rawUrl) {
    return rawUrl;
  }

  return rawUrl;
}

export function resolveCourtSourceLink(
  input: CourtLinkInput,
  label = "Open Source",
): { label: string; url: string } | null {
  const url = resolveCourtSourceUrl(input);
  return url ? { label, url } : null;
}
