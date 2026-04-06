/**
 * County Legal Search — per-lead crawlers for recorded documents + court cases.
 *
 * Three sources, all Spokane County focused:
 *   1. Spokane County Recorder (recording.spokanecounty.org) — guest search
 *   2. WA Courts (dw.courts.wa.gov county=32) — per-lead name search
 *   3. Spokane County Liens page (spokanecounty.org/681/Liens)
 *
 * Uses Firecrawl /scrape with LLM extraction and /search for broader queries.
 * Results normalized to the recorded_documents schema shape.
 */

const FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v1/scrape";
const FIRECRAWL_SEARCH = "https://api.firecrawl.dev/v1/search";

// ── Owner name parsing ────────────────────────────────────────────────────────

const OWNER_SUFFIXES = new Set([
  "JR",
  "SR",
  "II",
  "III",
  "IV",
  "V",
  "TRUST",
  "TR",
  "ESTATE",
  "ET",
  "AL",
  "LLC",
  "INC",
  "LP",
]);

const ADDRESS_STOP_WORDS = new Set([
  "N",
  "S",
  "E",
  "W",
  "NE",
  "NW",
  "SE",
  "SW",
  "ST",
  "STREET",
  "AVE",
  "AVENUE",
  "RD",
  "ROAD",
  "LN",
  "LANE",
  "DR",
  "DRIVE",
  "CT",
  "COURT",
  "PL",
  "PLACE",
  "BLVD",
  "BOULEVARD",
  "WAY",
  "HWY",
  "HIGHWAY",
  "PKWY",
  "PARKWAY",
  "CIR",
  "CIRCLE",
  "TER",
  "TERRACE",
  "APT",
  "UNIT",
]);

interface ParsedOwnerName {
  last: string;
  first: string;
  middle: string;
  surnameCandidates: string[];
  givenCandidates: string[];
  fullNameVariants: string[];
  coreTokens: string[];
}

export interface LegalMatchAssessment {
  accepted: boolean;
  score: number;
  ownerStrong: boolean;
  addressStrong: boolean;
  apnMatch: boolean;
  matchedSignals: string[];
}

function normalizeMatchText(value: string | null | undefined): string {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = normalizeMatchText(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export function parseOwnerName(fullName: string): ParsedOwnerName {
  const cleaned = fullName.replace(/\s+/g, " ").trim();
  const normalized = normalizeMatchText(cleaned);
  const parts = normalized.split(" ").filter(Boolean);

  if (parts.length === 0) {
    return {
      last: "",
      first: "",
      middle: "",
      surnameCandidates: [],
      givenCandidates: [],
      fullNameVariants: [],
      coreTokens: [],
    };
  }

  if (parts.length === 1) {
    return {
      last: parts[0],
      first: "",
      middle: "",
      surnameCandidates: [parts[0]],
      givenCandidates: [],
      fullNameVariants: [parts[0]],
      coreTokens: [parts[0]],
    };
  }

  let first = "";
  let last = "";
  let middle = "";

  if (cleaned.includes(",")) {
    const [lastPart, restPart] = cleaned.split(",", 2);
    const restTokens = normalizeMatchText(restPart).split(" ").filter(Boolean);
    last = normalizeMatchText(lastPart);
    first = restTokens[0] ?? "";
    middle = restTokens.slice(1).join(" ");
  } else if (parts.length >= 3 && parts[parts.length - 1].length === 1) {
    // County CSV imports often surface as "LAST FIRST M".
    last = parts[0];
    first = parts[1] ?? "";
    middle = parts.slice(2).join(" ");
  } else {
    // User-entered names are usually "First Middle Last".
    first = parts[0];
    last = parts[parts.length - 1];
    middle = parts.slice(1, -1).join(" ");
  }

  const swappedVariant = [last, first, middle].filter(Boolean).join(" ");
  const naturalVariant = [first, middle, last].filter(Boolean).join(" ");
  const coreTokens = parts.filter((token) => token.length > 1 && !OWNER_SUFFIXES.has(token));

  return {
    last,
    first,
    middle,
    surnameCandidates: uniqueNonEmpty([last, parts[0], parts[parts.length - 1]])
      .filter((token) => token.length > 1 && !OWNER_SUFFIXES.has(token)),
    givenCandidates: uniqueNonEmpty([first, parts[0], parts[1]])
      .filter((token) => token.length > 1 && !OWNER_SUFFIXES.has(token)),
    fullNameVariants: uniqueNonEmpty([cleaned, normalized, naturalVariant, swappedVariant]),
    coreTokens: uniqueNonEmpty(coreTokens),
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface LegalSearchInput {
  ownerName: string;
  address: string;
  apn: string;
  county: string;
  city: string;
}

export interface NormalizedDocument {
  documentType: string;
  instrumentNumber: string | null;
  recordingDate: string | null;
  documentDate: string | null;
  grantor: string | null;
  grantee: string | null;
  amount: number | null;
  lenderName: string | null;
  status: string;
  caseNumber: string | null;
  courtName: string | null;
  caseType: string | null;
  attorneyName: string | null;
  contactPerson: string | null;
  nextHearingDate: string | null;
  eventDescription: string | null;
  source: string;
  sourceUrl: string | null;
  rawExcerpt: string | null;
}

interface LegalMatchContext {
  owner: ParsedOwnerName;
  addressTokens: string[];
  addressNumber: string | null;
  apnNormalized: string | null;
}

function tokenSetFromText(value: string, opts?: { minLength?: number; omit?: Set<string> }): string[] {
  const minLength = opts?.minLength ?? 2;
  const omit = opts?.omit ?? new Set<string>();
  return uniqueNonEmpty(value.split(/\s+/))
    .flatMap((item) => item.split(" "))
    .filter((token) => token.length >= minLength && !omit.has(token));
}

function buildLegalMatchContext(input: LegalSearchInput): LegalMatchContext {
  const primaryAddress = input.address.split(",")[0] ?? input.address;
  const normalizedAddress = normalizeMatchText(primaryAddress);
  const addressTokens = tokenSetFromText(normalizedAddress, { minLength: 2, omit: ADDRESS_STOP_WORDS });
  const addressNumber = normalizedAddress.match(/\b\d+\b/)?.[0] ?? null;
  const apnNormalized = normalizeMatchText(input.apn).replace(/\s+/g, "") || null;

  return {
    owner: parseOwnerName(input.ownerName),
    addressTokens,
    addressNumber,
    apnNormalized,
  };
}

function buildDocumentHaystack(doc: NormalizedDocument): string {
  return normalizeMatchText([
    doc.grantor,
    doc.grantee,
    doc.eventDescription,
    doc.rawExcerpt,
    doc.caseType,
    doc.caseNumber,
    doc.sourceUrl,
    doc.instrumentNumber,
  ].filter(Boolean).join(" "));
}

function hasWholeToken(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  return ` ${haystack} `.includes(` ${token} `);
}

export function assessLegalDocumentMatch(
  doc: NormalizedDocument,
  input: LegalSearchInput,
): LegalMatchAssessment {
  const ctx = buildLegalMatchContext(input);
  const haystack = buildDocumentHaystack(doc);
  const matchedSignals: string[] = [];
  let score = 0;
  let ownerStrong = false;
  let addressStrong = false;
  let apnMatch = false;

  const exactOwnerVariant = ctx.owner.fullNameVariants.find((variant) => hasWholeToken(haystack, variant));
  if (exactOwnerVariant) {
    score += 9;
    ownerStrong = true;
    matchedSignals.push("owner-full");
  } else {
    const surnameHits = ctx.owner.surnameCandidates.filter((token) => hasWholeToken(haystack, token));
    const givenHits = ctx.owner.givenCandidates.filter((token) => hasWholeToken(haystack, token));
    const coreHits = ctx.owner.coreTokens.filter((token) => hasWholeToken(haystack, token));

    if (surnameHits.length > 0) {
      score += 3;
      matchedSignals.push("owner-surname");
    }
    if (givenHits.length > 0) {
      score += 2;
      matchedSignals.push("owner-given");
    }
    if (coreHits.length >= 2) {
      score += 4;
      ownerStrong = true;
      matchedSignals.push("owner-multi-token");
    } else if (surnameHits.length > 0 && givenHits.length > 0) {
      score += 2;
      ownerStrong = true;
      matchedSignals.push("owner-first-last");
    }
  }

  let addressTokenHits = 0;
  if (ctx.addressNumber && hasWholeToken(haystack, ctx.addressNumber)) {
    score += 2;
    matchedSignals.push("address-number");
  }
  for (const token of ctx.addressTokens) {
    if (hasWholeToken(haystack, token)) {
      addressTokenHits += 1;
    }
  }
  if (addressTokenHits > 0) {
    score += Math.min(addressTokenHits, 4);
    matchedSignals.push(`address-token:${addressTokenHits}`);
  }
  addressStrong = addressTokenHits >= 2 || (Boolean(ctx.addressNumber) && addressTokenHits >= 1);

  if (ctx.apnNormalized) {
    const compactHaystack = haystack.replace(/\s+/g, "");
    if (compactHaystack.includes(ctx.apnNormalized)) {
      score += 7;
      apnMatch = true;
      matchedSignals.push("apn");
    }
  }

  const accepted = apnMatch
    || (doc.source === "wa_courts" ? ownerStrong : ownerStrong || addressStrong);

  return {
    accepted,
    score,
    ownerStrong,
    addressStrong,
    apnMatch,
    matchedSignals,
  };
}

function filterDocumentsForInput(
  docs: NormalizedDocument[],
  input: LegalSearchInput,
  sourceLabel: string,
): NormalizedDocument[] {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);

  let rejected = 0;
  let dateRejected = 0;
  const filtered = docs.filter((doc) => {
    // Date filter: exclude documents older than 24 months (only when date is known)
    if (doc.recordingDate) {
      const recDate = new Date(doc.recordingDate);
      if (!isNaN(recDate.getTime()) && recDate < cutoff) {
        dateRejected += 1;
        return false;
      }
    }

    const assessment = assessLegalDocumentMatch(doc, input);
    if (!assessment.accepted) {
      rejected += 1;
      return false;
    }
    return true;
  });

  if (dateRejected > 0) {
    console.log(`[LegalSearch:${sourceLabel}] Filtered ${dateRejected} documents older than 24 months`);
  }
  if (rejected > 0) {
    console.log(`[LegalSearch:${sourceLabel}] Filtered ${rejected} low-confidence documents; kept ${filtered.length}`);
  }

  return filtered;
}

// ── Document type classifier ─────────────────────────────────────────────────

const TYPE_PATTERNS: [RegExp, string][] = [
  [/\b(?:deed of trust|dot|trust deed)\b/i, "deed_of_trust"],
  [/\b(?:assignment(?:\s+of)?)\b/i, "assignment"],
  [/\b(?:substitution(?:\s+of)?\s*trustee)\b/i, "substitution"],
  [/\b(?:full reconveyance|reconveyance)\b/i, "reconveyance"],
  [/\b(?:release|satisfaction)\b/i, "release"],
  [/\b(?:lis\s*pendens)\b/i, "lis_pendens"],
  [/\b(?:mechanic|materialman)\b.*\b(?:lien)\b/i, "mechanic_lien"],
  [/\b(?:tax)\b.*\b(?:lien|certificate)\b/i, "tax_lien"],
  [/\b(?:judgment)\b/i, "judgment"],
  [/\b(?:probate|estate|personal representative)\b/i, "probate_petition"],
  [/\b(?:foreclosure|notice of default|nod)\b/i, "foreclosure_notice"],
  [/\b(?:trustee.s?\s*(?:sale|deed))\b/i, "trustee_sale_notice"],
  [/\b(?:bankruptcy|chapter\s*(?:7|11|13))\b/i, "bankruptcy_filing"],
  [/\b(?:divorce|dissolution|domestic)\b/i, "divorce_filing"],
  [/\b(?:warranty deed|quit\s*claim|bargain and sale)\b/i, "deed"],
  [/\b(?:lien)\b/i, "lien"],
];

export function classifyDocumentType(
  rawType: string,
  grantor?: string | null,
  grantee?: string | null,
): string {
  const text = rawType.toLowerCase();

  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(text)) {
      if (
        type === "lien" &&
        grantee &&
        /\b(?:hud|department of housing|state housing)\b/i.test(grantee)
      ) {
        return "hud_partial_claim";
      }
      return type;
    }
  }

  if (
    grantee &&
    /\b(?:hud|department of housing|fha)\b/i.test(grantee)
  ) {
    return "hud_partial_claim";
  }

  return "unknown";
}

function inferStatus(docType: string): string {
  if (["reconveyance", "release"].includes(docType)) return "released";
  if (docType === "trustee_sale_notice") return "scheduled";
  if (["probate_petition", "foreclosure_notice", "bankruptcy_filing", "divorce_filing"].includes(docType)) return "pending";
  return "active";
}

// ── Firecrawl helpers ────────────────────────────────────────────────────────

async function firecrawlScrape(
  url: string,
  schema: Record<string, unknown>,
  apiKey: string,
  actions?: Array<Record<string, unknown>>,
): Promise<{ extract: Record<string, unknown> | null; markdown: string }> {
  try {
    const body: Record<string, unknown> = {
      url,
      formats: ["extract", "markdown"],
      extract: { schema },
      timeout: 30000,
    };
    if (actions && actions.length > 0) {
      body.actions = actions;
    }
    const res = await fetch(FIRECRAWL_SCRAPE, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[LegalSearch] Firecrawl scrape failed: ${res.status} ${res.statusText}`);
      return { extract: null, markdown: "" };
    }
    const json = await res.json();
    return {
      extract: json.data?.extract ?? null,
      markdown: (json.data?.markdown ?? "").slice(0, 8000),
    };
  } catch (err) {
    console.warn("[LegalSearch] Firecrawl scrape error:", err);
    return { extract: null, markdown: "" };
  }
}

async function firecrawlSearch(
  query: string,
  apiKey: string,
  limit = 5,
): Promise<Array<{ url: string; title: string; markdown: string }>> {
  try {
    const res = await fetch(FIRECRAWL_SEARCH, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"] } }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []).map((r: Record<string, unknown>) => ({
      url: (r.url as string) ?? "",
      title: (r.title as string) ?? "",
      markdown: ((r.markdown as string) ?? "").slice(0, 3000),
    }));
  } catch {
    return [];
  }
}

// ── Extraction schemas ───────────────────────────────────────────────────────

const RECORDER_SCHEMA = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      description: "List of all recorded documents found on this page",
      items: {
        type: "object",
        properties: {
          instrument_number: { type: "string", description: "Recording/instrument/document number" },
          recording_date: { type: "string", description: "Date the document was recorded (YYYY-MM-DD)" },
          document_type: { type: "string", description: "Type of document (e.g. Deed of Trust, Assignment, Release, Lis Pendens, Lien, Judgment)" },
          grantor: { type: "string", description: "Grantor / seller / borrower name" },
          grantee: { type: "string", description: "Grantee / buyer / lender name" },
          consideration: { type: "string", description: "Dollar amount or consideration listed" },
        },
      },
    },
  },
};

const COURT_CASE_SCHEMA = {
  type: "object",
  properties: {
    cases: {
      type: "array",
      description: "List of all court cases found on this page",
      items: {
        type: "object",
        properties: {
          case_number: { type: "string", description: "Court case number" },
          case_type: { type: "string", description: "Type of case (e.g. Probate, Foreclosure, Bankruptcy, Divorce, Civil)" },
          filing_date: { type: "string", description: "Date the case was filed (YYYY-MM-DD)" },
          status: { type: "string", description: "Current case status (e.g. Active, Closed, Dismissed)" },
          parties: { type: "string", description: "Names of parties involved" },
          attorney: { type: "string", description: "Attorney of record" },
          next_hearing: { type: "string", description: "Next scheduled hearing date (YYYY-MM-DD)" },
          court_name: { type: "string", description: "Name of the court" },
          description: { type: "string", description: "Brief description or latest filing/event" },
        },
      },
    },
  },
};

const LIEN_SCHEMA = {
  type: "object",
  properties: {
    liens: {
      type: "array",
      description: "List of all liens found",
      items: {
        type: "object",
        properties: {
          lien_type: { type: "string", description: "Type of lien (tax, mechanic, judgment, utility, etc.)" },
          amount: { type: "string", description: "Lien amount in dollars" },
          date_filed: { type: "string", description: "Date the lien was filed (YYYY-MM-DD)" },
          holder: { type: "string", description: "Lien holder name" },
          property_owner: { type: "string", description: "Property owner name" },
          status: { type: "string", description: "Lien status (active, released, etc.)" },
          description: { type: "string", description: "Additional details about the lien" },
        },
      },
    },
  },
};

// ── Crawler 1: Spokane County Recorder ───────────────────────────────────────

async function searchRecorder(
  input: LegalSearchInput,
  apiKey?: string,
): Promise<NormalizedDocument[]> {
  const docs: NormalizedDocument[] = [];
  const owner = parseOwnerName(input.ownerName);
  const { last, first } = owner;
  const ownerPhrase = owner.fullNameVariants[0] ?? input.ownerName;
  const nameQuery = owner.surnameCandidates[0] ?? last;

  // Plain-fetch fallback: use APN direct search when no Firecrawl key
  if (!apiKey) {
    if (!input.apn || input.apn.startsWith("MANUAL-")) {
      return [];
    }

    try {
      const today = new Date();
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(today.getFullYear() - 2);
      const fmt = (d: Date) =>
        `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

      const recorderApnUrl =
        `https://recording.spokanecounty.org/recorder/web/doclist.jsp` +
        `?searchType=APN` +
        `&parcelNumber=${encodeURIComponent(input.apn)}` +
        `&dateFrom=${encodeURIComponent(fmt(twoYearsAgo))}` +
        `&dateTo=${encodeURIComponent(fmt(today))}` +
        `&submit=Search`;

      console.log(`[LegalSearch:Recorder] Plain-fetch APN search for "${input.apn}"`);
      const res = await fetch(recorderApnUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        console.warn(`[LegalSearch:Recorder] APN fetch failed: ${res.status}`);
        return [];
      }
      const html = await res.text();

      // Extract instrument numbers (Spokane uses 7-9 digit instrument numbers)
      const instrumentRe = /\b(\d{7,9})\b/g;
      const dateRe = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
      const docTypeKeywords = ["deed", "trust", "lien", "judgment", "probate", "foreclosure", "release", "reconveyance", "assignment"];

      const instrumentMatches: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = instrumentRe.exec(html)) !== null) {
        if (!instrumentMatches.includes(m[1])) {
          instrumentMatches.push(m[1]);
        }
      }

      const dateMatches: string[] = [];
      while ((m = dateRe.exec(html)) !== null) {
        if (!dateMatches.includes(m[1])) {
          dateMatches.push(m[1]);
        }
      }

      // Extract table rows to pair instrument/date/type/names
      // Look for <tr> blocks and pull out cell content
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      const rows: string[][] = [];
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(html)) !== null) {
        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null;
        const rowHtml = rowMatch[1];
        const cellPattern = new RegExp(cellRe.source, "gi");
        while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
          cells.push(stripTags(cellMatch[1]));
        }
        if (cells.length >= 2) rows.push(cells);
      }

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 24);

      for (const cells of rows) {
        const rowText = cells.join(" ").toLowerCase();
        const hasDocKeyword = docTypeKeywords.some((kw) => rowText.includes(kw));
        const instrMatch = cells.join(" ").match(/\b(\d{7,9})\b/);
        const dateStr = cells.join(" ").match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] ?? null;
        const recDate = dateStr ? new Date(dateStr) : null;

        if (!instrMatch && !hasDocKeyword) continue;
        if (recDate && !isNaN(recDate.getTime()) && recDate < cutoff) continue;

        const rawType = docTypeKeywords.find((kw) => rowText.includes(kw)) ?? "";
        const docType = classifyDocumentType(rawType);
        const grantor = cells[2] ?? null;
        const grantee = cells[3] ?? null;

        docs.push({
          documentType: docType === "unknown" ? "recorded_document" : docType,
          instrumentNumber: instrMatch ? instrMatch[1] : null,
          recordingDate: dateStr ? normalizeDate(dateStr) : null,
          documentDate: null,
          grantor: grantor && grantor.length > 1 ? grantor : null,
          grantee: grantee && grantee.length > 1 ? grantee : null,
          amount: null,
          lenderName: grantee && grantee.length > 1 ? grantee : null,
          status: inferStatus(docType),
          caseNumber: null,
          courtName: null,
          caseType: null,
          attorneyName: null,
          contactPerson: null,
          nextHearingDate: null,
          eventDescription: rawType || null,
          source: "spokane_recorder",
          sourceUrl: recorderApnUrl,
          rawExcerpt: cells.join(" ").slice(0, 500) || null,
        });
      }

      console.log(`[LegalSearch:Recorder] Plain-fetch extracted ${docs.length} candidate docs`);
    } catch (err) {
      console.warn("[LegalSearch:Recorder] Plain-fetch error:", err);
      return [];
    }

    return filterDocumentsForInput(docs, input, "Recorder");
  }

  // Strategy 1: Use Firecrawl actions to interact with the recorder search form.
  // The guest login at loginPOST.jsp?guest=true auto-redirects to the search page.
  // We fill the name field and submit to get actual search results.
  const recorderUrl = `https://recording.spokanecounty.org/recorder/web/loginPOST.jsp?guest=true`;
  const recorderSearchTerms = owner.surnameCandidates.length > 0 ? owner.surnameCandidates.slice(0, 2) : [last].filter(Boolean);
  let recorderExtract: Record<string, unknown> | null = null;
  let recorderMd = "";

  for (const surnameCandidate of recorderSearchTerms) {
    const formActions = [
      { type: "wait", milliseconds: 3000 },
      { type: "write", text: surnameCandidate, selector: "input[type='text']" },
      { type: "press", key: "Enter" },
      { type: "wait", milliseconds: 5000 },
    ];
    const response = await firecrawlScrape(
      recorderUrl,
      RECORDER_SCHEMA,
      apiKey,
      formActions,
    );
    recorderExtract = response.extract;
    recorderMd = response.markdown;

    const extractedCount = (response.extract?.documents as unknown[])?.length ?? 0;
    console.log(`[LegalSearch:Recorder] Form search for "${surnameCandidate}" â†’ ${extractedCount} docs extracted`);
    if (extractedCount > 0) break;
  }

  console.log(`[LegalSearch:Recorder] Form search for "${nameQuery}" → ${(recorderExtract?.documents as unknown[])?.length ?? 0} docs extracted`);

  // Strategy 2: Targeted web searches for this person's recorded documents.
  // County recorder databases aren't Google-indexed, but foreclosure notices,
  // trustee sales, and court filings often appear on legal notice sites.
  const searchQueries = [
    `"${ownerPhrase}" "Spokane County" "notice of default" OR "lis pendens" OR "trustee sale" OR foreclosure`,
    `"${ownerPhrase}" "${input.address}" "Spokane County" deed OR lien OR "deed of trust" OR assignment`,
    `"${input.address}" Spokane County recorder "recorded documents" OR "instrument"`,
    input.apn ? `"${input.apn}" "Spokane County" recorder OR assessor OR parcel` : "",
  ];

  const searchResults = await Promise.all(
    searchQueries.filter(Boolean).map((q) => firecrawlSearch(q, apiKey, 4)),
  );

  const resultUrls = searchResults
    .flat()
    .map((r) => r.url)
    .filter((u) => u && !u.includes("google.") && !u.includes("bing."));

  const scrapePromises = resultUrls.slice(0, 6).map((url) =>
    firecrawlScrape(url, RECORDER_SCHEMA, apiKey),
  );

  const scrapeResults = await Promise.allSettled(scrapePromises);

  const allExtracts: Array<{ extract: Record<string, unknown> | null; markdown: string; url: string }> = [
    { extract: recorderExtract, markdown: recorderMd, url: recorderUrl },
  ];

  scrapeResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      allExtracts.push({ ...r.value, url: resultUrls[i] });
    }
  });

  for (const { extract, markdown, url } of allExtracts) {
    const rawDocs = (extract?.documents as Array<Record<string, unknown>>) ?? [];

    for (const raw of rawDocs) {
      const rawType = String(raw.document_type ?? "");
      const grantor = raw.grantor ? String(raw.grantor) : null;
      const grantee = raw.grantee ? String(raw.grantee) : null;
      const docType = classifyDocumentType(rawType, grantor, grantee);
      const amountStr = String(raw.consideration ?? "").replace(/[$,\s]/g, "");
      const amount = amountStr ? parseInt(amountStr, 10) : null;

      docs.push({
        documentType: docType,
        instrumentNumber: raw.instrument_number ? String(raw.instrument_number) : null,
        recordingDate: raw.recording_date ? String(raw.recording_date) : null,
        documentDate: null,
        grantor,
        grantee,
        amount: amount && !isNaN(amount) ? amount : null,
        lenderName: grantee,
        status: inferStatus(docType),
        caseNumber: null,
        courtName: null,
        caseType: null,
        attorneyName: null,
        contactPerson: null,
        nextHearingDate: null,
        eventDescription: rawType || null,
        source: "spokane_recorder",
        sourceUrl: url,
        rawExcerpt: markdown.slice(0, 500) || null,
      });
    }
  }

  return filterDocumentsForInput(docs, input, "Recorder");
}

// ── Crawler 2: WA Courts case search (per-lead) ─────────────────────────────

async function searchCourts(
  input: LegalSearchInput,
  apiKey?: string,
): Promise<NormalizedDocument[]> {
  const docs: NormalizedDocument[] = [];
  const owner = parseOwnerName(input.ownerName);
  const { last, first } = owner;
  const ownerPhrase = owner.fullNameVariants[0] ?? input.ownerName;

  // Construct the direct WA Courts name search URL (used by both paths)
  const courtSearchUrl = `https://dw.courts.wa.gov/index.cfm?fa=home.namesearchresult&terms=accept&county=32&last=${encodeURIComponent(last)}&first=${encodeURIComponent(first)}&middle=&SearchType=&SearchMode=&SoundexType=&partyType=&courtClassCode=&caseYear=&casePinNumber=&DisableSessionCheck=0&CaseSearchType=`;

  // Plain-fetch fallback: GET the WA Courts URL directly and run regex extraction
  if (!apiKey) {
    try {
      console.log(`[LegalSearch:Courts] Plain-fetch for "${last}, ${first}"`);
      const res = await fetch(courtSearchUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        console.warn(`[LegalSearch:Courts] Plain-fetch failed: ${res.status}`);
        return [];
      }
      const html = await res.text();
      const extracted = extractCasesFromText(html, courtSearchUrl);
      console.log(`[LegalSearch:Courts] Plain-fetch extracted ${extracted.length} cases`);
      docs.push(...extracted);
    } catch (err) {
      console.warn("[LegalSearch:Courts] Plain-fetch error:", err);
      return [];
    }
    return filterDocumentsForInput(docs, input, "Courts");
  }

  // Strategy 1: Construct a direct WA Courts name search URL.
  // This submits the search server-side — no form interaction needed.
  const { extract: courtExtract, markdown: courtMd } = await firecrawlScrape(
    courtSearchUrl,
    COURT_CASE_SCHEMA,
    apiKey,
  );

  console.log(`[LegalSearch:Courts] Direct search for "${last}, ${first}" → ${(courtExtract?.cases as unknown[])?.length ?? 0} cases extracted, ${courtMd.length} chars markdown`);

  // Strategy 2: Web search fallback for broader results
  const searchQueries = [
    `"${ownerPhrase}" "Spokane County" probate OR estate OR foreclosure OR bankruptcy`,
    `"${ownerPhrase}" "Spokane" court case OR judgment OR "trustee sale"`,
  ];

  const searchResults = await Promise.all(
    searchQueries.map((q) => firecrawlSearch(q, apiKey, 4)),
  );

  const resultUrls = searchResults
    .flat()
    .map((r) => r.url)
    .filter((u) =>
      u &&
      !u.includes("google.") &&
      !u.includes("bing.") &&
      (u.includes("courts.") || u.includes("court") || u.includes("docket") || u.includes("case") || u.includes("legal")),
    );

  const scrapePromises = resultUrls.slice(0, 4).map((url) =>
    firecrawlScrape(url, COURT_CASE_SCHEMA, apiKey),
  );

  const scrapeResults = await Promise.allSettled(scrapePromises);

  const allExtracts: Array<{ extract: Record<string, unknown> | null; markdown: string; url: string }> = [
    { extract: courtExtract, markdown: courtMd, url: courtSearchUrl },
  ];

  scrapeResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      allExtracts.push({ ...r.value, url: resultUrls[i] });
    }
  });

  // Extract cases from search snippet markdown (case numbers in text)
  for (const resultSet of searchResults) {
    for (const result of resultSet) {
      if (result.markdown) {
        const inlineCases = extractCasesFromText(result.markdown, result.url);
        docs.push(...inlineCases);
      }
    }
  }

  // Also try extracting cases from the direct court search markdown
  if (courtMd) {
    const inlineCases = extractCasesFromText(courtMd, courtSearchUrl);
    docs.push(...inlineCases);
  }

  for (const { extract, markdown, url } of allExtracts) {
    const rawCases = (extract?.cases as Array<Record<string, unknown>>) ?? [];

    for (const raw of rawCases) {
      const rawCaseType = String(raw.case_type ?? "");
      const docType = classifyDocumentType(rawCaseType);
      const statusStr = raw.status ? String(raw.status).toLowerCase() : "active";
      const status = statusStr.includes("dismiss")
        ? "dismissed"
        : statusStr.includes("close")
          ? "released"
          : "pending";

      docs.push({
        documentType: docType === "unknown" ? "court_filing" : docType,
        instrumentNumber: null,
        recordingDate: raw.filing_date ? String(raw.filing_date) : null,
        documentDate: null,
        grantor: null,
        grantee: null,
        amount: null,
        lenderName: null,
        status,
        caseNumber: raw.case_number ? String(raw.case_number) : null,
        courtName: raw.court_name ? String(raw.court_name) : "Spokane County Superior Court",
        caseType: rawCaseType || null,
        attorneyName: raw.attorney ? String(raw.attorney) : null,
        contactPerson: null,
        nextHearingDate: raw.next_hearing ? String(raw.next_hearing) : null,
        eventDescription: raw.description ? String(raw.description) : (raw.parties ? String(raw.parties) : null),
        source: "wa_courts",
        sourceUrl: url,
        rawExcerpt: markdown.slice(0, 500) || null,
      });
    }
  }

  return filterDocumentsForInput(docs, input, "Courts");
}

/**
 * Best-effort regex extraction from search result markdown. Catches case numbers
 * and associated info when the court index page is in the search snippet.
 */
function extractCasesFromText(text: string, sourceUrl: string): NormalizedDocument[] {
  const docs: NormalizedDocument[] = [];
  const caseRe = /\b(\d{2}-\d-\d{5}-\d{1,2})\b/g;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((match = caseRe.exec(text)) !== null) {
    const caseNum = match[1];
    if (seen.has(caseNum)) continue;
    seen.add(caseNum);

    const surrounding = text.slice(Math.max(0, match.index - 200), match.index + 200);
    const caseTypeMatch = surrounding.match(/\b(probate|foreclosure|bankruptcy|divorce|dissolution|civil|estate|judgment)\b/i);
    const rawType = caseTypeMatch?.[1] ?? "";
    const docType = classifyDocumentType(rawType);

    const dateMatch = surrounding.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    const recordingDate = dateMatch?.[1] ? normalizeDate(dateMatch[1]) : null;

    docs.push({
      documentType: docType === "unknown" ? "court_filing" : docType,
      instrumentNumber: null,
      recordingDate,
      documentDate: null,
      grantor: null,
      grantee: null,
      amount: null,
      lenderName: null,
      status: "pending",
      caseNumber: caseNum,
      courtName: "Spokane County Superior Court",
      caseType: rawType || null,
      attorneyName: null,
      contactPerson: null,
      nextHearingDate: null,
      eventDescription: surrounding.slice(0, 200).replace(/\s+/g, " ").trim() || null,
      source: "wa_courts",
      sourceUrl,
      rawExcerpt: surrounding.slice(0, 500) || null,
    });
  }

  return docs;
}

function normalizeDate(dateStr: string): string | null {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// ── Crawler 3: County liens + foreclosure notices ────────────────────────────

async function searchLiens(
  input: LegalSearchInput,
  apiKey?: string,
): Promise<NormalizedDocument[]> {
  // Without Firecrawl web search, lien data adds no value — tax delinquency
  // is already covered by SCOUT data stored in owner_flags.
  if (!apiKey) {
    return [];
  }

  const docs: NormalizedDocument[] = [];
  const owner = parseOwnerName(input.ownerName);
  const { last, first } = owner;
  const ownerPhrase = owner.fullNameVariants[0] ?? input.ownerName;

  // Search for this person's liens, foreclosure notices, and trustee sales
  // across public notice sites, county records, and legal databases
  const searchQueries = [
    `"${ownerPhrase}" Spokane County lien OR "tax lien" OR "mechanic lien" OR judgment`,
    `"${ownerPhrase}" "${input.address}" "notice of trustee" OR "foreclosure" OR "notice of default" Spokane`,
    `"${input.address}" Spokane County "deed of trust" OR lien OR encumbrance`,
    input.apn ? `"${input.apn}" Spokane County lien OR parcel OR assessor` : "",
  ];

  const searchResults = await Promise.all(
    searchQueries.filter(Boolean).map((q) => firecrawlSearch(q, apiKey, 4)),
  );

  const resultUrls = searchResults
    .flat()
    .map((r) => r.url)
    .filter((u) => u && !u.includes("google.") && !u.includes("bing."));

  const scrapeResults = await Promise.allSettled(
    resultUrls.slice(0, 5).map((url) => firecrawlScrape(url, LIEN_SCHEMA, apiKey)),
  );

  const allExtracts: Array<{ extract: Record<string, unknown> | null; markdown: string; url: string }> = [];

  scrapeResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      allExtracts.push({ ...r.value, url: resultUrls[i] });
    }
  });

  for (const { extract, markdown, url } of allExtracts) {
    const rawLiens = (extract?.liens as Array<Record<string, unknown>>) ?? [];

    for (const raw of rawLiens) {
      const rawType = String(raw.lien_type ?? "lien");
      const docType = classifyDocumentType(rawType);
      const amountStr = String(raw.amount ?? "").replace(/[$,\s]/g, "");
      const amount = amountStr ? parseInt(amountStr, 10) : null;
      const statusStr = raw.status ? String(raw.status).toLowerCase() : "active";
      const status = statusStr.includes("release") ? "released" : "active";

      docs.push({
        documentType: docType === "unknown" ? "lien" : docType,
        instrumentNumber: null,
        recordingDate: raw.date_filed ? String(raw.date_filed) : null,
        documentDate: null,
        grantor: raw.property_owner ? String(raw.property_owner) : null,
        grantee: raw.holder ? String(raw.holder) : null,
        amount: amount && !isNaN(amount) ? amount : null,
        lenderName: raw.holder ? String(raw.holder) : null,
        status,
        caseNumber: null,
        courtName: null,
        caseType: null,
        attorneyName: null,
        contactPerson: null,
        nextHearingDate: null,
        eventDescription: raw.description ? String(raw.description) : rawType,
        source: "spokane_liens",
        sourceUrl: url,
        rawExcerpt: markdown.slice(0, 500) || null,
      });
    }
  }

  return filterDocumentsForInput(docs, input, "Liens");
}

// ── Deduplication ────────────────────────────────────────────────────────────

function deduplicateDocuments(docs: NormalizedDocument[]): NormalizedDocument[] {
  const seen = new Map<string, NormalizedDocument>();

  for (const doc of docs) {
    // Prefer instrument number for recorder docs, case number for court docs
    const key = doc.instrumentNumber
      ? `inst:${doc.instrumentNumber}`
      : doc.caseNumber
        ? `case:${doc.caseNumber}`
        : `${doc.documentType}:${doc.recordingDate ?? ""}:${doc.grantor ?? ""}:${doc.grantee ?? ""}:${doc.amount ?? ""}`;

    if (!seen.has(key)) {
      seen.set(key, doc);
    }
  }

  return Array.from(seen.values());
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runLegalSearch(
  input: LegalSearchInput,
  apiKey?: string,
): Promise<{ documents: NormalizedDocument[]; errors: string[] }> {
  const errors: string[] = [];

  const [recorderResult, courtResult, lienResult] = await Promise.allSettled([
    searchRecorder(input, apiKey),
    searchCourts(input, apiKey),
    searchLiens(input, apiKey),
  ]);

  const all: NormalizedDocument[] = [];

  if (recorderResult.status === "fulfilled") {
    all.push(...recorderResult.value);
  } else {
    errors.push(`Recorder search failed: ${recorderResult.reason}`);
  }

  if (courtResult.status === "fulfilled") {
    all.push(...courtResult.value);
  } else {
    errors.push(`Court search failed: ${courtResult.reason}`);
  }

  if (lienResult.status === "fulfilled") {
    all.push(...lienResult.value);
  } else {
    errors.push(`Lien search failed: ${lienResult.reason}`);
  }

  const documents = deduplicateDocuments(all);

  console.log(
    `[LegalSearch] ${documents.length} unique docs (${all.length} raw) from ${3 - errors.length}/3 sources`,
  );

  return { documents, errors };
}
