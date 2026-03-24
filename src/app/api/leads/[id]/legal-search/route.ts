import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { assessLegalDocumentMatch, runLegalSearch, type NormalizedDocument } from "@/lib/county-legal-search";

/**
 * POST /api/leads/[id]/legal-search
 *
 * Runs county recorder + court + lien crawlers for a specific lead,
 * normalizes the results, and persists to recorded_documents.
 *
 * Returns: { documentsFound, courtCasesFound, nextUpcomingEvent, errors }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return NextResponse.json({ error: "FIRECRAWL_API_KEY not configured" }, { status: 500 });
  }

  // Resolve lead → property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select("id, property_id")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prop: Record<string, any> | null = null;
  if (lead.property_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propRow } = await (sb.from("properties") as any)
      .select("id, owner_name, address, city, county, apn")
      .eq("id", lead.property_id)
      .single();
    prop = propRow;
  }

  const ownerName = prop?.owner_name ?? "";
  const address = prop?.address ?? "";
  const city = prop?.city ?? "";
  const county = prop?.county ?? "";
  const apn = prop?.apn ?? "";

  if (!ownerName && !address) {
    return NextResponse.json({ error: "Need owner name or address to search" }, { status: 400 });
  }

  // Run crawlers
  const { documents, errors } = await runLegalSearch(
    { ownerName, address, apn, county, city },
    firecrawlKey,
  );

  // Persist to recorded_documents (upsert by instrument_number or case_number)
  let inserted = 0;
  for (const doc of documents) {
    const row = {
      property_id: lead.property_id,
      lead_id: leadId,
      document_type: doc.documentType,
      instrument_number: doc.instrumentNumber,
      recording_date: doc.recordingDate ? new Date(doc.recordingDate).toISOString() : null,
      document_date: doc.documentDate ? new Date(doc.documentDate).toISOString() : null,
      grantor: doc.grantor,
      grantee: doc.grantee,
      amount: doc.amount,
      lender_name: doc.lenderName,
      status: doc.status,
      case_number: doc.caseNumber,
      court_name: doc.courtName,
      case_type: doc.caseType,
      attorney_name: doc.attorneyName,
      contact_person: doc.contactPerson,
      next_hearing_date: doc.nextHearingDate ? new Date(doc.nextHearingDate).toISOString() : null,
      event_description: doc.eventDescription,
      source: doc.source,
      source_url: doc.sourceUrl,
      raw_excerpt: doc.rawExcerpt,
    };

    // Check for existing record to avoid duplicates
    let exists = false;
    if (doc.instrumentNumber) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (sb.from("recorded_documents") as any)
        .select("id")
        .eq("property_id", lead.property_id)
        .eq("instrument_number", doc.instrumentNumber)
        .limit(1);
      exists = (existing?.length ?? 0) > 0;
    } else if (doc.caseNumber) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (sb.from("recorded_documents") as any)
        .select("id")
        .eq("property_id", lead.property_id)
        .eq("case_number", doc.caseNumber)
        .limit(1);
      exists = (existing?.length ?? 0) > 0;
    }

    if (!exists) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (sb.from("recorded_documents") as any).insert(row);
      if (!insertErr) inserted++;
      else console.error("[legal-search] Insert failed:", insertErr.message);
    }
  }

  // Save search timestamp to owner_flags
  if (lead.property_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propFlags } = await (sb.from("properties") as any)
      .select("owner_flags")
      .eq("id", lead.property_id)
      .single();

    const merged = {
      ...((propFlags?.owner_flags as Record<string, unknown>) ?? {}),
      legal_search_at: new Date().toISOString(),
      legal_search_count: documents.length,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any)
      .update({ owner_flags: merged })
      .eq("id", lead.property_id);
  }

  // Find next upcoming event
  const upcomingEvents = documents
    .filter((d) => d.nextHearingDate)
    .map((d) => ({ ...d, _date: new Date(d.nextHearingDate!) }))
    .filter((d) => d._date.getTime() > Date.now())
    .sort((a, b) => a._date.getTime() - b._date.getTime());

  const nextUpcomingEvent = upcomingEvents[0]
    ? {
        date: upcomingEvents[0].nextHearingDate,
        type: upcomingEvents[0].documentType,
        caseNumber: upcomingEvents[0].caseNumber,
        description: upcomingEvents[0].eventDescription,
      }
    : null;

  const courtCases = documents.filter((d) => d.caseNumber);

  return NextResponse.json({
    documentsFound: documents.length,
    documentsInserted: inserted,
    courtCasesFound: courtCases.length,
    nextUpcomingEvent,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * GET /api/leads/[id]/legal-search
 *
 * Returns existing recorded_documents for this lead's property.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("property_id")
    .eq("id", leadId)
    .single();

  if (!lead?.property_id) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Fetch all recorded documents for this property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: docs, error: docsErr } = await (sb.from("recorded_documents") as any)
    .select("*")
    .eq("property_id", lead.property_id)
    .order("recording_date", { ascending: false, nullsFirst: false });

  if (docsErr) {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }

  // Get search timestamp from owner_flags
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (sb.from("properties") as any)
    .select("owner_flags, owner_name, address, city, county, apn")
    .eq("id", lead.property_id)
    .single();

  const flags = (prop?.owner_flags as Record<string, unknown>) ?? {};
  const searchInput = {
    ownerName: prop?.owner_name ?? "",
    address: prop?.address ?? "",
    city: prop?.city ?? "",
    county: prop?.county ?? "",
    apn: prop?.apn ?? "",
  };

  const filteredDocs = (docs ?? []).filter((doc: Record<string, unknown>) => {
    const normalized: NormalizedDocument = {
      documentType: String(doc.document_type ?? "unknown"),
      instrumentNumber: typeof doc.instrument_number === "string" ? doc.instrument_number : null,
      recordingDate: typeof doc.recording_date === "string" ? doc.recording_date : null,
      documentDate: typeof doc.document_date === "string" ? doc.document_date : null,
      grantor: typeof doc.grantor === "string" ? doc.grantor : null,
      grantee: typeof doc.grantee === "string" ? doc.grantee : null,
      amount: typeof doc.amount === "number" ? doc.amount : null,
      lenderName: typeof doc.lender_name === "string" ? doc.lender_name : null,
      status: typeof doc.status === "string" ? doc.status : "unknown",
      caseNumber: typeof doc.case_number === "string" ? doc.case_number : null,
      courtName: typeof doc.court_name === "string" ? doc.court_name : null,
      caseType: typeof doc.case_type === "string" ? doc.case_type : null,
      attorneyName: typeof doc.attorney_name === "string" ? doc.attorney_name : null,
      contactPerson: typeof doc.contact_person === "string" ? doc.contact_person : null,
      nextHearingDate: typeof doc.next_hearing_date === "string" ? doc.next_hearing_date : null,
      eventDescription: typeof doc.event_description === "string" ? doc.event_description : null,
      source: typeof doc.source === "string" ? doc.source : "unknown",
      sourceUrl: typeof doc.source_url === "string" ? doc.source_url : null,
      rawExcerpt: typeof doc.raw_excerpt === "string" ? doc.raw_excerpt : null,
    };

    return assessLegalDocumentMatch(normalized, searchInput).accepted;
  });

  return NextResponse.json({
    documents: filteredDocs,
    lastSearchedAt: (flags.legal_search_at as string) ?? null,
    totalCount: filteredDocs.length,
  });
}
