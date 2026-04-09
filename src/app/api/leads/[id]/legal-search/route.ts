import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { assessLegalDocumentMatch, type NormalizedDocument } from "@/lib/county-legal-search";
import { performLeadLegalSearch } from "@/lib/lead-research";

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

  if (!process.env.FIRECRAWL_API_KEY) {
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
      .select("id, owner_name, address, city, county, apn, owner_flags")
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

  const result = await performLeadLegalSearch({
    leadId,
    propertyId: lead.property_id,
    property: {
      id: prop?.id ?? lead.property_id,
      owner_name: ownerName,
      address,
      city,
      county,
      state: null,
      zip: null,
      apn,
      owner_flags: (prop?.owner_flags as Record<string, unknown> | null) ?? null,
      estimated_value: null,
      equity_percent: null,
    },
  });

  return NextResponse.json({
    documentsFound: result.documentsFound,
    documentsInserted: result.documentsInserted,
    courtCasesFound: result.courtCasesFound,
    nextUpcomingEvent: result.nextUpcomingEvent,
    errors: result.errors.length > 0 ? result.errors : undefined,
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
