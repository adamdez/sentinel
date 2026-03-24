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
): Promise<{ extract: Record<string, unknown> | null; markdown: string }> {
  try {
    const res = await fetch(FIRECRAWL_SCRAPE, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["extract", "markdown"],
        extract: { schema },
      }),
    });
    if (!res.ok) return { extract: null, markdown: "" };
    const json = await res.json();
    return {
      extract: json.data?.extract ?? null,
      markdown: (json.data?.markdown ?? "").slice(0, 5000),
    };
  } catch {
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
  apiKey: string,
): Promise<NormalizedDocument[]> {
  const docs: NormalizedDocument[] = [];

  // Direct scrape of the recorder guest portal
  const recorderUrl = `https://recording.spokanecounty.org/recorder/web/loginPOST.jsp?guest=true`;
  const { extract: recorderExtract, markdown: recorderMd } = await firecrawlScrape(
    recorderUrl,
    RECORDER_SCHEMA,
    apiKey,
  );

  // Also do a targeted Firecrawl search for recorded documents
  const searchQueries = [
    `"${input.ownerName}" "Spokane County" recorder deed OR lien OR assignment site:spokanecounty.org`,
    `"${input.ownerName}" "Spokane County" "deed of trust" OR "lis pendens" OR "foreclosure"`,
  ];

  const searchResults = await Promise.all(
    searchQueries.map((q) => firecrawlSearch(q, apiKey, 3)),
  );

  // Scrape each search result page with the recorder extraction schema
  const resultUrls = searchResults
    .flat()
    .map((r) => r.url)
    .filter((u) => u && !u.includes("google.") && !u.includes("bing."));

  const scrapePromises = resultUrls.slice(0, 5).map((url) =>
    firecrawlScrape(url, RECORDER_SCHEMA, apiKey),
  );

  const scrapeResults = await Promise.allSettled(scrapePromises);

  // Combine direct recorder data + search-scraped data
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

  return docs;
}

// ── Crawler 2: WA Courts case search (per-lead) ─────────────────────────────

async function searchCourts(
  input: LegalSearchInput,
  apiKey: string,
): Promise<NormalizedDocument[]> {
  const docs: NormalizedDocument[] = [];

  // Search WA Courts directly
  const courtUrl = `https://dw.courts.wa.gov/index.cfm?fa=home.casesearch&terms=accept&county=32`;
  const { extract: courtExtract, markdown: courtMd } = await firecrawlScrape(
    courtUrl,
    COURT_CASE_SCHEMA,
    apiKey,
  );

  // Also use Firecrawl search to find court records for this person
  const searchQueries = [
    `"${input.ownerName}" "Spokane County" probate OR estate OR "personal representative"`,
    `"${input.ownerName}" "Spokane County" foreclosure OR "trustee sale" OR bankruptcy`,
    `"${input.ownerName}" "Spokane" court case OR judgment OR divorce`,
  ];

  const searchResults = await Promise.all(
    searchQueries.map((q) => firecrawlSearch(q, apiKey, 3)),
  );

  // Scrape promising court result pages
  const resultUrls = searchResults
    .flat()
    .map((r) => r.url)
    .filter((u) =>
      u &&
      !u.includes("google.") &&
      !u.includes("bing.") &&
      (u.includes("courts.") || u.includes("court") || u.includes("docket") || u.includes("case")),
    );

  const scrapePromises = resultUrls.slice(0, 4).map((url) =>
    firecrawlScrape(url, COURT_CASE_SCHEMA, apiKey),
  );

  const scrapeResults = await Promise.allSettled(scrapePromises);

  const allExtracts: Array<{ extract: Record<string, unknown> | null; markdown: string; url: string }> = [
    { extract: courtExtract, markdown: courtMd, url: courtUrl },
  ];

  scrapeResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      allExtracts.push({ ...r.value, url: resultUrls[i] });
    }
  });

  // Also extract from search result markdown directly (sometimes cases are listed
  // in the search snippet without needing a follow-up scrape)
  for (const resultSet of searchResults) {
    for (const result of resultSet) {
      if (result.markdown) {
        const inlineCases = extractCasesFromText(result.markdown, result.url);
        docs.push(...inlineCases);
      }
    }
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

  return docs;
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

// ── Crawler 3: County liens page ─────────────────────────────────────────────

async function searchLiens(
  input: LegalSearchInput,
  apiKey: string,
): Promise<NormalizedDocument[]> {
  const docs: NormalizedDocument[] = [];

  // Direct scrape of Spokane County liens page
  const liensUrl = `https://www.spokanecounty.org/681/Liens`;
  const { extract: lienExtract, markdown: lienMd } = await firecrawlScrape(
    liensUrl,
    LIEN_SCHEMA,
    apiKey,
  );

  // Search for liens specific to owner/address
  const searchResults = await firecrawlSearch(
    `"${input.ownerName}" OR "${input.address}" "Spokane County" lien OR "tax lien" OR "mechanic lien" OR "utility lien"`,
    apiKey,
    3,
  );

  const resultUrls = searchResults
    .flat()
    .map((r) => r.url)
    .filter((u) => u && !u.includes("google.") && !u.includes("bing."));

  const scrapeResults = await Promise.allSettled(
    resultUrls.slice(0, 3).map((url) => firecrawlScrape(url, LIEN_SCHEMA, apiKey)),
  );

  const allExtracts: Array<{ extract: Record<string, unknown> | null; markdown: string; url: string }> = [
    { extract: lienExtract, markdown: lienMd, url: liensUrl },
  ];

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

  return docs;
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
  apiKey: string,
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
