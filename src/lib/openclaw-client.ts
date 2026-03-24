/**
 * OpenClaw Client — HTTP client for the OpenClaw Research Gateway.
 *
 * Mirrors the pattern in grok-client.ts. Calls the OpenClaw Gateway's
 * OpenAI-compatible endpoint to dispatch specialized research agents
 * (court records, obituaries, social media, photos, county records).
 *
 * Each agent runs on cheap LLMs (DeepSeek V3 or Claude Haiku) and
 * returns structured AgentFinding[] that feed into Grok synthesis.
 */

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface AgentFinding {
  source: string;        // e.g. "Spokane County Clerk", "LinkedIn", "Legacy.com"
  category: string;      // "court_record" | "obituary" | "social_media" | "property_listing" | "county_record" | "photo" | "contact" | "financial" | "heir" | "employment"
  finding: string;       // human-readable finding
  confidence: number;    // 0-1
  url?: string;          // source URL
  date?: string;         // finding date (ISO or human-readable)
  rawSnippet?: string;   // raw text excerpt from source
  structuredData?: {
    phone?: string;         // For contact findings → merge into all_phones
    email?: string;         // For contact findings → merge into all_emails
    personName?: string;    // For heir/executor/LLC owner
    personRole?: "heir" | "executor" | "attorney" | "beneficial_owner" | "spouse" | "family" | "owner";
    eventType?: string;     // Maps to DistressType for auto-creation
    amount?: number;        // Dollar amounts for liens/judgments
    caseNumber?: string;    // Court case numbers
    filingDate?: string;    // ISO date for distress events
    employer?: string;      // Employment agent
    location?: string;      // Relocation agent
  };
}

export interface PropertyPhoto {
  url: string;
  source: "google_street_view" | "zillow" | "redfin" | "assessor" | "satellite";
  capturedAt: string;
  thumbnail?: string;
}

export interface AgentPayload {
  ownerName: string;
  address: string;
  city: string;
  state: string;
  county: string;
  apn?: string;
  radarId?: string;
  lat?: number;
  lng?: number;
  distressSignals?: string[];
  lastSaleDate?: string;         // date current owner purchased — filters pre-ownership records
  additionalContext?: Record<string, unknown>;
}

export interface AgentTask {
  agentId: string;       // e.g. "court_records", "obituary_probate", "social_media"
  payload: AgentPayload;
  model?: string;        // override default model (e.g. "claude-haiku", "deepseek-v3")
  timeout?: number;      // ms, default 120_000
}

export interface AgentResult {
  agentId: string;
  success: boolean;
  findings: AgentFinding[];
  photos?: PropertyPhoto[];
  rawData?: Record<string, unknown>;
  model: string;
  durationMs: number;
  error?: string;
}

export interface AgentMeta {
  agentsRun: string[];
  agentsSucceeded: string[];
  agentsFailed: string[];
  totalDurationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Deep Skip Report — people intelligence from agents
// ═══════════════════════════════════════════════════════════════════════

export interface DeepSkipPerson {
  name: string;
  role: "owner" | "heir" | "executor" | "attorney" | "beneficial_owner" | "spouse" | "family";
  phones: string[];
  emails: string[];
  address?: string;
  notes: string;           // e.g. "Listed as executor in probate case #24-1234"
  source: string;          // agent that found them
  confidence: number;
}

export interface DeepSkipResult {
  crawledAt: string;
  people: DeepSkipPerson[];
  newPhones: { number: string; source: string; personName?: string }[];
  newEmails: { email: string; source: string; personName?: string }[];
  employmentSignals: {
    signal: string;          // "Job change to Portland, OR (LinkedIn)"
    source: string;
    date?: string;
    url?: string;
  }[];
  agentMeta: AgentMeta;
  // NOTE: findings intentionally omitted — stored once in deep_crawl.agentFindings to avoid JSONB bloat
}

// ═══════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════

const OPENCLAW_ENDPOINT = process.env.OPENCLAW_API_URL ?? "https://openclaw-gateway-frosty-darkness-4048.fly.dev";
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY ?? "";

/** Check if OpenClaw is configured with a real API key. */
export function isOpenClawConfigured(): boolean {
  return !!process.env.OPENCLAW_API_KEY;
}
const AGENT_TIMEOUT_MS = 120_000;
const FANOUT_TIMEOUT_MS = 180_000;

// Agent-to-model mapping (cheap models for simple tasks, Haiku for nuanced ones)
const AGENT_MODELS: Record<string, string> = {
  court_records: "deepseek-chat",
  obituary_probate: "deepseek-chat",
  social_media: "claude-haiku",
  property_photos: "deepseek-chat",
  county_records: "deepseek-chat",
  contact_finder: "claude-haiku",
  financial_distress: "deepseek-chat",
  heir_estate: "deepseek-chat",
  heir_skip_trace: "claude-haiku",
  employment_relocation: "deepseek-chat",
  propertyradar_navigator: "claude-haiku",
  attom_navigator: "claude-haiku",
  // ── New specialized agents ──────────────────────────────────
  tax_auction_search: "deepseek-chat",
  title_lien_search: "deepseek-chat",
  rehab_condition_estimator: "deepseek-chat",
  market_demand_analyzer: "deepseek-chat",
  business_entity_search: "claude-haiku",
};

// ═══════════════════════════════════════════════════════════════════════
// Agent system prompts
// ═══════════════════════════════════════════════════════════════════════

function buildAgentPrompt(agentId: string, payload: AgentPayload): string {
  const ctx = [
    `Owner: ${payload.ownerName}`,
    `Address: ${payload.address}`,
    `City: ${payload.city}, ${payload.state}`,
    `County: ${payload.county}`,
    payload.apn ? `APN: ${payload.apn}` : null,
    payload.lastSaleDate ? `Current owner purchased: ${payload.lastSaleDate}` : null,
    payload.distressSignals?.length ? `Known distress signals: ${payload.distressSignals.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const ownershipWarning = payload.lastSaleDate
    ? `\n\nIMPORTANT — OWNERSHIP DATE FILTER: The current owner purchased this property on ${payload.lastSaleDate}. IGNORE all records, filings, liens, and events dated BEFORE this date — those belong to a previous owner, not "${payload.ownerName}". Only include findings from AFTER the purchase date.`
    : "";

  const prompts: Record<string, string> = {
    court_records: `You are a court records research agent. Search for any court filings involving the property owner.

## Property Context
${ctx}${ownershipWarning}

## Instructions
1. Search for "${payload.ownerName}" in ${payload.county} County court records
2. Search for related filings: probate, divorce, bankruptcy, foreclosure, civil suits, liens
3. Check PACER for federal bankruptcy filings if relevant
4. For each filing found, extract: case type, filing date, case number, parties, amounts, status
5. VERIFY each record actually belongs to the current owner — check names and dates carefully

## Output Format
Return a JSON array of findings:
\`\`\`json
[{
  "source": "County or court name",
  "category": "court_record",
  "finding": "Human-readable description of the filing",
  "confidence": 0.0-1.0,
  "url": "URL to the record if available",
  "date": "Filing date",
  "rawSnippet": "Relevant text excerpt"
}]
\`\`\`

Return ONLY the JSON array, no other text.`,

    obituary_probate: `You are an obituary and probate research agent. Search for recent deaths in the owner's family.

## Property Context
${ctx}${ownershipWarning}

## Instructions
1. Search for "${payload.ownerName}" obituary in ${payload.city}, ${payload.state}
2. Search Legacy.com, local funeral homes, newspaper archives
3. Search for family members with the same last name at the same address
4. For each result, extract: deceased name, relationship to property owner if determinable, date of death, funeral home

## Output Format
Return a JSON array of findings:
\`\`\`json
[{
  "source": "Legacy.com, funeral home name, etc.",
  "category": "obituary",
  "finding": "Human-readable description",
  "confidence": 0.0-1.0,
  "url": "URL to obituary",
  "date": "Date of death or publication",
  "rawSnippet": "Relevant excerpt"
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    social_media: `You are a social media and public profile research agent. Find the property owner's online presence.

## Property Context
${ctx}

## Instructions
1. Search for "${payload.ownerName}" in ${payload.city}, ${payload.state} on LinkedIn, Facebook (public), local news
2. Look for: employment status, job changes, relocations, life events, business ownership
3. Search local newspaper archives for mentions
4. Check business registrations (Secretary of State) for the owner's name
5. Look for any public indicators of distress or motivation to sell

## Output Format
Return a JSON array of findings:
\`\`\`json
[{
  "source": "LinkedIn, Facebook, news outlet, etc.",
  "category": "social_media",
  "finding": "Human-readable description of what you found",
  "confidence": 0.0-1.0,
  "url": "Profile or article URL",
  "date": "Date of finding if applicable",
  "rawSnippet": "Relevant excerpt"
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    county_records: `You are a county records research agent. Search county assessor and recorder websites for property intelligence.

## Property Context
${ctx}${ownershipWarning}

## Instructions
1. Search the ${payload.county} County assessor website for this property
2. Look for: deed transfers, mechanic's liens, lis pendens, code violations, building permits
3. Check for any tax sale or auction notices
4. Extract property details the county shows that might not be in commercial databases
5. Look for recent ownership changes or encumbrances

## Output Format
Return a JSON array of findings:
\`\`\`json
[{
  "source": "${payload.county} County Assessor/Recorder",
  "category": "county_record",
  "finding": "Human-readable description",
  "confidence": 0.0-1.0,
  "url": "URL to county record",
  "date": "Date of record",
  "rawSnippet": "Relevant excerpt"
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    property_photos: `You are a property photo research agent. Find actual property photos from multiple sources.

## Property Context
${ctx}
${payload.lat && payload.lng ? `Coordinates: ${payload.lat}, ${payload.lng}` : ""}

## Instructions
1. Search Zillow for this address and find any listing photos
2. Search Redfin for this address and find any listing photos
3. Search the ${payload.county} County assessor site for assessor photos
4. Note any Google Street View availability for the coordinates

## Output Format
Return a JSON array of findings:
\`\`\`json
[{
  "source": "zillow/redfin/assessor",
  "category": "photo",
  "finding": "Description of what the photo shows",
  "confidence": 0.0-1.0,
  "url": "Direct URL to the photo or listing page",
  "date": "Photo date if available"
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    contact_finder: `You are a contact intelligence agent. Find phone numbers, email addresses, and decision-maker contacts that standard skip trace providers miss.

## Property Context
${ctx}
${payload.additionalContext ? `\n## Known Contacts (DO NOT duplicate these)\nKnown phones: ${(payload.additionalContext.knownPhones as string[])?.join(", ") || "none"}\nKnown emails: ${(payload.additionalContext.knownEmails as string[])?.join(", ") || "none"}` : ""}

## Instructions
1. Search Secretary of State LLC/DBA filings for "${payload.ownerName}" → extract beneficial owner name + registered agent phone/email
2. Search LinkedIn for "${payload.ownerName}" in ${payload.city}, ${payload.state} → extract any visible contact info, email patterns from employer
3. Search Facebook public profiles for "${payload.ownerName}" → look for phone numbers in bio, "About" section
4. Search Whitepages/TruePeopleSearch for family members at ${payload.address} → get their names and phone numbers
5. If this is an LLC or trust, find the actual human behind it
6. DO NOT return contacts already listed in "Known Contacts" above

## Output Format
Return a JSON array. Each finding MUST include structuredData with phone/email/person info:
\`\`\`json
[{
  "source": "Secretary of State / LinkedIn / Facebook / Whitepages",
  "category": "contact",
  "finding": "Human-readable description of who this person is and how they relate to the property",
  "confidence": 0.0-1.0,
  "url": "Source URL",
  "structuredData": {
    "phone": "5551234567",
    "email": "person@example.com",
    "personName": "John Smith",
    "personRole": "beneficial_owner"
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    financial_distress: `You are a financial distress research agent. Find liens, judgments, bankruptcies, code violations, and other financial stress indicators that commercial databases miss or lag behind on.

## Property Context
${ctx}${ownershipWarning}

## Instructions
1. Search PACER (Public Access to Court Electronic Records) for "${payload.ownerName}" bankruptcy filings → extract case number, chapter, filing date, status
2. Search ${payload.county} County recorder for mechanic's liens against ${payload.address} → unpaid contractors signal both deferred maintenance and cash flow problems
3. Search ${payload.county} County code enforcement for violations at ${payload.address} → code violations = deferred maintenance
4. Search for abandoned/expired building permits at ${payload.address} → started reno but ran out of money
5. Search for HOA lien filings against this property → unpaid HOA = owner stress
6. Search for small claims judgments or civil judgments against "${payload.ownerName}" in ${payload.county} County
7. Search for eviction filings by "${payload.ownerName}" (as landlord) → landlord fatigue signal
8. Search for IRS/state tax liens against "${payload.ownerName}"

## Output Format
Return a JSON array. Each finding MUST include structuredData with event details:
\`\`\`json
[{
  "source": "PACER / County Recorder / Code Enforcement",
  "category": "financial",
  "finding": "Human-readable description of the financial distress indicator",
  "confidence": 0.0-1.0,
  "url": "Source URL if available",
  "date": "Filing/event date",
  "structuredData": {
    "eventType": "bankruptcy|mechanics_lien|code_violation|expired_permit|hoa_lien|judgment|eviction|tax_lien",
    "amount": 15000,
    "caseNumber": "24-12345",
    "filingDate": "2024-01-15"
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    heir_estate: `You are an heir and estate research agent. Find family members, executors, attorneys, and estate contacts for deceased or elderly property owners.

## Property Context
${ctx}

## Instructions
1. Search for "${payload.ownerName}" obituary on Legacy.com, Dignity Memorial, local newspaper obituaries, funeral home websites
2. From any obituary found, extract EVERY family member mentioned: spouse, children, siblings, grandchildren — with their full names
3. Search ${payload.county} County probate court for active probate cases involving "${payload.ownerName}" or ${payload.address}
4. If probate found, extract: case number, executor/personal representative name, attorney of record, filing date
5. Cross-reference heir names with Whitepages/TruePeopleSearch to find their current phone numbers and addresses
6. Check for transfer-on-death (TOD) deed or beneficiary deed recorded on this property
7. Look for estate sale listings or signs the property is being liquidated

## Output Format
Return a JSON array. Each finding MUST include structuredData with person/role info:
\`\`\`json
[{
  "source": "Legacy.com / Probate Court / Whitepages",
  "category": "heir",
  "finding": "Human-readable description of the person and their relationship",
  "confidence": 0.0-1.0,
  "url": "Source URL",
  "date": "Date of death or probate filing",
  "structuredData": {
    "personName": "Jane Smith",
    "personRole": "heir",
    "phone": "5559876543",
    "email": "jane@example.com",
    "caseNumber": "PROB-2024-1234"
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    heir_skip_trace: `You are an heir/executor skip-trace agent. Your ONLY job is to find phone numbers and email addresses for specific people connected to a property.

## Property Context
${ctx}

## People to Skip-Trace
${(payload.additionalContext?.heirNames as string[])?.map((n, i) => `${i + 1}. ${n}`).join("\n") || "No names provided"}

## Instructions
For EACH person listed above:
1. Search Whitepages for their name + "${payload.city}, ${payload.state}" → extract phone numbers and current address
2. Search TruePeopleSearch for their name → extract phone, email, current address
3. Search BeenVerified or Spokeo for their name + "${payload.city}, ${payload.state}"
4. Search LinkedIn for their name + "${payload.city}, ${payload.state}" → extract employer email patterns (e.g., firstname.lastname@company.com)
5. Search Facebook public profile → look for phone/email in bio or "About" section
6. Check if they are listed at ${payload.address} or nearby addresses

IMPORTANT: You MUST return structuredData with phone and/or email for each person. Finding a name without contact info is NOT useful — dig deeper.

## Output Format
Return a JSON array. Each finding MUST include structuredData with phone/email/person info:
\`\`\`json
[{
  "source": "Whitepages / TruePeopleSearch / LinkedIn / Facebook",
  "category": "contact",
  "finding": "Human-readable description of who this person is and their contact info",
  "confidence": 0.0-1.0,
  "url": "Source URL",
  "structuredData": {
    "phone": "5551234567",
    "email": "person@example.com",
    "personName": "Full Name",
    "personRole": "heir"
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    employment_relocation: `You are an employment and relocation research agent. Find job changes, business closures, and relocation signals for absentee property owners.

## Property Context
${ctx}

## Instructions
1. Search LinkedIn for "${payload.ownerName}" → look for recent job changes, especially moves to a different city/state
2. Search Secretary of State business filings for "${payload.ownerName}" → look for business dissolutions, inactive registrations
3. Search professional licensing boards in ${payload.state} and neighboring states → active license in another state = relocated
4. Search voter registration records → registered at a different address = relocated
5. Search for "${payload.ownerName}" in news articles about company layoffs, business closures, or relocations
6. Check USPS change-of-address indicators if available

## Output Format
Return a JSON array. Each finding MUST include structuredData with employment/location info:
\`\`\`json
[{
  "source": "LinkedIn / Secretary of State / Professional Board",
  "category": "employment",
  "finding": "Human-readable description of the employment or relocation signal",
  "confidence": 0.0-1.0,
  "url": "Source URL",
  "date": "Date of the change",
  "structuredData": {
    "employer": "Company name if applicable",
    "location": "New city, state if relocated",
    "personName": "${payload.ownerName}"
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    // ══════════════════════════════════════════════════════════════
    // New specialized agents
    // ══════════════════════════════════════════════════════════════

    tax_auction_search: `You are a tax auction research agent. Search for upcoming tax sales, treasurer auctions, and tax deed sales involving this property or owner.

## Property Context
${ctx}${ownershipWarning}

## Instructions
1. Search ${payload.county} County tax sale / treasurer auction listings
2. Check the county treasurer website for properties scheduled for tax deed sale
3. Search for "${payload.apn ?? payload.address}" in county tax auction databases
4. Look for redemption deadlines and minimum bid amounts
5. Check Washington state DOR tax lien certificate lists if applicable

## Key Sources
- Spokane County: https://www.spokanecounty.gov/845/Tax-Title-for-Auction-Property-Listings
- County treasurer websites for auction calendars
- State department of revenue tax lien lists

Return a JSON array of findings:
\`\`\`json
[{
  "source": "County Treasurer / Tax Sale Listing",
  "category": "financial",
  "finding": "Human-readable description of the tax auction finding",
  "confidence": 0.0-1.0,
  "url": "Source URL",
  "date": "Auction date or listing date",
  "structuredData": {
    "eventType": "tax_lien",
    "amount": 0,
    "filingDate": "YYYY-MM-DD"
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    title_lien_search: `You are a title and lien research agent. Search for open liens, judgments, and recorded encumbrances against this property or owner.

## Property Context
${ctx}${ownershipWarning}

## Instructions
1. Search ${payload.county} County recorder for liens recorded against "${payload.ownerName}" or APN ${payload.apn ?? "N/A"}
2. Look for: mechanic's liens, IRS tax liens, state tax liens, HOA liens, judgment liens, UCC filings
3. Check WA Secretary of State UCC filings: https://ccfs.sos.wa.gov/
4. Search for lis pendens (lawsuit notices) attached to the property
5. Note the lienholder, amount, recording date, and instrument number for each

## Key Sources
- County recorder guest access: https://recording.spokanecounty.org/recorder/web/loginPOST.jsp?guest=true
- WA Secretary of State UCC filings: https://ccfs.sos.wa.gov/
- Federal tax lien databases

Return a JSON array of findings:
\`\`\`json
[{
  "source": "County Recorder / Secretary of State",
  "category": "financial",
  "finding": "Human-readable description of the lien",
  "confidence": 0.0-1.0,
  "url": "Source URL",
  "date": "Recording date",
  "structuredData": {
    "eventType": "open_liens",
    "amount": 0,
    "caseNumber": "Instrument number or case number",
    "filingDate": "YYYY-MM-DD"
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    rehab_condition_estimator: `You are a property condition research agent. Assess the physical condition of this property using publicly available data.

## Property Context
${ctx}
${payload.lat && payload.lng ? `Coordinates: ${payload.lat}, ${payload.lng}` : ""}

## Instructions
1. Search for recent building permits on the property (city/county building department)
2. Look for code violations, complaints, or enforcement actions
3. Check if the property appears on any vacant/blighted property lists
4. Search for any contractor or renovation work associated with the address
5. Note the property age, last known renovation date, and any visible condition issues
6. Estimate condition on 1-10 scale (1=teardown, 5=average, 10=excellent)
7. Estimate rough rehab cost range if condition issues are apparent

## Key Sources
- City building department permit searches
- County code enforcement databases
- Property inspection records

Return a JSON array of findings:
\`\`\`json
[{
  "source": "Building Department / Code Enforcement / Visual Assessment",
  "category": "property_listing",
  "finding": "Human-readable assessment of property condition",
  "confidence": 0.0-1.0,
  "url": "Source URL if applicable",
  "structuredData": {
    "eventType": "property_condition",
    "amount": 0
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    market_demand_analyzer: `You are a real estate market analysis agent. Assess the local market demand for this property type and location.

## Property Context
${ctx}

## Instructions
1. Search for recent comparable sales near ${payload.address}, ${payload.city}, ${payload.state}
2. Look up median days-on-market for the area on Redfin, Zillow, or Realtor.com
3. Check if the area is trending up or down in price
4. Look for new development, rezoning, or infrastructure projects nearby
5. Estimate buyer demand level (hot market vs cold market)
6. Find 2-3 comparable sales with prices and sale dates

## Key Data Points to Extract
- Median days on market in the area
- Price trend (appreciating/flat/declining)
- Number of active listings vs recent sales (absorption rate)
- Comparable sale prices and dates
- Any notable development or infrastructure nearby

Return a JSON array of findings:
\`\`\`json
[{
  "source": "Redfin / Zillow / Market Data",
  "category": "property_listing",
  "finding": "Human-readable market analysis",
  "confidence": 0.0-1.0,
  "url": "Source URL",
  "structuredData": {
    "amount": 0
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,

    business_entity_search: `You are a business entity research agent. Research the corporate/LLC owner of this property to find the beneficial (human) owners.

## Property Context
${ctx}${ownershipWarning}

## Instructions
1. Search WA Secretary of State (https://ccfs.sos.wa.gov/) for "${payload.ownerName}"
2. Search Idaho Secretary of State if the entity might be Idaho-registered
3. For each entity found, extract: status (active/inactive), registered agent, principal office address, governors/members
4. If the entity has a registered agent, search for that person as potential contact
5. Check for related entities (parent companies, subsidiaries, DBAs)
6. Check OpenCorporates for additional filing history

## Key Data Points
- Entity type (LLC, Corporation, Trust, Partnership)
- Formation date
- Status (active, inactive, dissolved, delinquent)
- Registered agent name and address
- Principal office address
- Governors / members / officers (the actual humans)
- Annual report filing status

Return a JSON array of findings:
\`\`\`json
[{
  "source": "WA Secretary of State / ID Secretary of State / OpenCorporates",
  "category": "contact",
  "finding": "Human-readable description of entity details and beneficial owners",
  "confidence": 0.0-1.0,
  "url": "Source URL",
  "structuredData": {
    "personName": "Name of beneficial owner / registered agent",
    "personRole": "beneficial_owner",
    "location": "Address of principal office"
  }
}]
\`\`\`

Return ONLY the JSON array, no other text. Return empty array [] if nothing found.`,
  };

  return prompts[agentId] ?? `Research "${payload.ownerName}" at ${payload.address}, ${payload.city}, ${payload.state}. Return findings as a JSON array.`;
}

// ═══════════════════════════════════════════════════════════════════════
// Single agent call
// ═══════════════════════════════════════════════════════════════════════

export async function callAgent(task: AgentTask): Promise<AgentResult> {
  const { agentId, payload, timeout = AGENT_TIMEOUT_MS } = task;
  const model = task.model ?? AGENT_MODELS[agentId] ?? "deepseek-chat";
  const start = Date.now();

  if (!OPENCLAW_API_KEY) {
    return {
      agentId,
      success: false,
      findings: [],
      model,
      durationMs: Date.now() - start,
      error: "OPENCLAW_API_KEY not configured",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const systemPrompt = buildAgentPrompt(agentId, payload);

    const res = await fetch(`${OPENCLAW_ENDPOINT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Research this property and return your findings as JSON.` },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        agentId,
        success: false,
        findings: [],
        model,
        durationMs: Date.now() - start,
        error: `OpenClaw API ${res.status}: ${body.slice(0, 300)}`,
      };
    }

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "[]";

    // Parse the JSON findings from the agent response
    const findings = parseAgentFindings(content, agentId);

    // Separate photos from regular findings
    const photos: PropertyPhoto[] = findings
      .filter((f) => f.category === "photo" && f.url)
      .map((f) => ({
        url: f.url!,
        source: (f.source as PropertyPhoto["source"]) ?? "satellite",
        capturedAt: f.date ?? new Date().toISOString(),
      }));

    return {
      agentId,
      success: true,
      findings: findings.filter((f) => f.category !== "photo"),
      photos: photos.length > 0 ? photos : undefined,
      model,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    return {
      agentId,
      success: false,
      findings: [],
      model,
      durationMs: Date.now() - start,
      error: isTimeout
        ? `Agent ${agentId} timed out after ${timeout}ms`
        : `Agent ${agentId} failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Parallel fan-out
// ═══════════════════════════════════════════════════════════════════════

export async function fanOutAgents(tasks: AgentTask[]): Promise<{ results: AgentResult[]; meta: AgentMeta }> {
  const start = Date.now();

  // Race all agents against a global timeout
  const raceTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Fan-out global timeout")), FANOUT_TIMEOUT_MS),
  );

  let results: AgentResult[];
  try {
    const settled = await Promise.race([
      Promise.allSettled(tasks.map((t) => callAgent(t))),
      raceTimeout,
    ]) as PromiseSettledResult<AgentResult>[];

    results = settled.map((s, i) =>
      s.status === "fulfilled"
        ? s.value
        : {
            agentId: tasks[i].agentId,
            success: false,
            findings: [],
            model: tasks[i].model ?? AGENT_MODELS[tasks[i].agentId] ?? "unknown",
            durationMs: Date.now() - start,
            error: s.reason instanceof Error ? s.reason.message : String(s.reason),
          },
    );
  } catch {
    // Global timeout — return whatever we have
    results = tasks.map((t) => ({
      agentId: t.agentId,
      success: false,
      findings: [],
      model: t.model ?? AGENT_MODELS[t.agentId] ?? "unknown",
      durationMs: Date.now() - start,
      error: "Global fan-out timeout",
    }));
  }

  const meta: AgentMeta = {
    agentsRun: results.map((r) => r.agentId),
    agentsSucceeded: results.filter((r) => r.success).map((r) => r.agentId),
    agentsFailed: results.filter((r) => !r.success).map((r) => r.agentId),
    totalDurationMs: Date.now() - start,
  };

  console.log(
    `[OpenClaw] Fan-out complete: ${meta.agentsSucceeded.length}/${meta.agentsRun.length} succeeded in ${meta.totalDurationMs}ms`,
  );

  return { results, meta };
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function parseAgentFindings(content: string, agentId: string): AgentFinding[] {
  try {
    // Try to extract JSON from the response (might be wrapped in markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((f: unknown): f is Record<string, unknown> => typeof f === "object" && f !== null)
      .map((f) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sd = f.structuredData as Record<string, any> | undefined;
        return {
          source: String(f.source ?? agentId),
          category: String(f.category ?? "unknown"),
          finding: String(f.finding ?? ""),
          confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
          url: f.url ? String(f.url) : undefined,
          date: f.date ? String(f.date) : undefined,
          rawSnippet: f.rawSnippet ? String(f.rawSnippet) : undefined,
          structuredData: sd && typeof sd === "object" ? {
            phone: sd.phone ? String(sd.phone) : undefined,
            email: sd.email ? String(sd.email) : undefined,
            personName: sd.personName ? String(sd.personName) : undefined,
            personRole: sd.personRole ? String(sd.personRole) as DeepSkipPerson["role"] : undefined,
            eventType: sd.eventType ? String(sd.eventType) : undefined,
            amount: typeof sd.amount === "number" ? sd.amount : undefined,
            caseNumber: sd.caseNumber ? String(sd.caseNumber) : undefined,
            filingDate: sd.filingDate ? String(sd.filingDate) : undefined,
            employer: sd.employer ? String(sd.employer) : undefined,
            location: sd.location ? String(sd.location) : undefined,
          } : undefined,
        };
      })
      .filter((f) => f.finding.length > 0);
  } catch (err) {
    console.error(`[OpenClaw] Failed to parse ${agentId} response:`, err);
    // If JSON parsing fails, try to create a single finding from the raw text
    if (content.trim().length > 20) {
      return [{
        source: agentId,
        category: "unknown",
        finding: content.trim().slice(0, 500),
        confidence: 0.3,
      }];
    }
    return [];
  }
}

/**
 * Build a Deep Skip Report from agent findings.
 * Extracts people, contacts, and employment signals into a structured report.
 */
export function buildDeepSkipResult(
  results: AgentResult[],
  existingPhones: string[],
  existingEmails: string[],
  meta: AgentMeta,
): DeepSkipResult {
  const people: DeepSkipPerson[] = [];
  const newPhones: DeepSkipResult["newPhones"] = [];
  const newEmails: DeepSkipResult["newEmails"] = [];
  const employmentSignals: DeepSkipResult["employmentSignals"] = [];

  // Normalize existing contacts for dedup
  const knownPhoneSet = new Set(existingPhones.map((p) => p.replace(/\D/g, "").slice(-10)));
  const knownEmailSet = new Set(existingEmails.map((e) => e.toLowerCase()));
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const result of results) {
    if (!result.success) continue;
    for (const f of result.findings) {
      const sd = f.structuredData;
      if (!sd) continue;

      // Extract person
      if (sd.personName && sd.personRole) {
        const existing = people.find(
          (p) => p.name.toLowerCase() === sd.personName!.toLowerCase(),
        );
        if (existing) {
          // Merge into existing person
          if (sd.phone && !existing.phones.includes(sd.phone)) existing.phones.push(sd.phone);
          if (sd.email && !existing.emails.includes(sd.email)) existing.emails.push(sd.email);
          if (f.finding && !existing.notes.includes(f.finding)) existing.notes += `; ${f.finding}`;
          existing.confidence = Math.max(existing.confidence, f.confidence);
        } else {
          people.push({
            name: sd.personName,
            role: sd.personRole,
            phones: sd.phone ? [sd.phone] : [],
            emails: sd.email ? [sd.email] : [],
            notes: f.finding,
            source: result.agentId,
            confidence: f.confidence,
          });
        }
      }

      // Extract new phones
      if (sd.phone) {
        const normalized = sd.phone.replace(/\D/g, "").slice(-10);
        if (normalized.length === 10 && !knownPhoneSet.has(normalized) && !seenPhones.has(normalized)) {
          seenPhones.add(normalized);
          newPhones.push({
            number: normalized,
            source: result.agentId,
            personName: sd.personName,
          });
        }
      }

      // Extract new emails
      if (sd.email) {
        const normalized = sd.email.toLowerCase();
        if (!knownEmailSet.has(normalized) && !seenEmails.has(normalized)) {
          seenEmails.add(normalized);
          newEmails.push({
            email: normalized,
            source: result.agentId,
            personName: sd.personName,
          });
        }
      }

      // Extract employment signals
      if ((sd.employer || sd.location) && f.category === "employment") {
        employmentSignals.push({
          signal: f.finding,
          source: f.source,
          date: f.date,
          url: f.url,
        });
      }
    }
  }

  return {
    crawledAt: new Date().toISOString(),
    people,
    newPhones,
    newEmails,
    employmentSignals,
    agentMeta: meta,
    // findings intentionally omitted — stored once in deep_crawl.agentFindings
  };
}

/**
 * Merge findings from multiple agent results into a formatted text block
 * suitable for injection into the Grok synthesis prompt.
 */
export function formatFindingsForGrok(results: AgentResult[]): string {
  const sections: string[] = [];

  for (const result of results) {
    if (!result.success || result.findings.length === 0) continue;

    const agentLabel = result.agentId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const lines = result.findings.map((f) => {
      const parts = [`- ${f.finding}`];
      if (f.source) parts.push(`  Source: ${f.source}`);
      if (f.url) parts.push(`  URL: ${f.url}`);
      if (f.date) parts.push(`  Date: ${f.date}`);
      if (f.confidence < 0.5) parts.push(`  (low confidence)`);
      return parts.join("\n");
    });

    sections.push(`### ${agentLabel}\n${lines.join("\n\n")}`);
  }

  if (sections.length === 0) return "";

  return `## Research Agent Findings\n\nThe following intelligence was gathered by specialized research agents. Synthesize these findings with the structured data above. Cite relevant findings in your analysis.\n\n${sections.join("\n\n")}`;
}
