import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import {
  runLegalSearch,
  assessLegalDocumentMatch,
  type LegalSearchInput,
  type NormalizedDocument,
} from "@/lib/county-legal-search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DistressType =
  | "probate"
  | "pre_foreclosure"
  | "tax_lien"
  | "code_violation"
  | "vacant"
  | "divorce"
  | "bankruptcy"
  | "fsbo"
  | "absentee"
  | "inherited"
  | "water_shutoff"
  | "condemned";

const DISTRESS_TYPE_MAP: Record<string, DistressType> = {
  probate_petition: "probate",
  foreclosure_notice: "pre_foreclosure",
  lis_pendens: "pre_foreclosure",
  trustee_sale_notice: "pre_foreclosure",
  tax_lien: "tax_lien",
  bankruptcy_filing: "bankruptcy",
  judgment: "tax_lien",
  divorce_filing: "divorce",
};

function buildFingerprint(leadId: string, doc: NormalizedDocument): string {
  const key =
    doc.instrumentNumber ||
    doc.caseNumber ||
    `${doc.documentType}:${doc.recordingDate ?? ""}:${doc.grantor ?? ""}:${doc.grantee ?? ""}:${doc.source}`;

  return createHash("sha256")
    .update(`${leadId}:${key}`)
    .digest("hex");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadGetError } = await (sb.from("leads") as any)
      .select("id")
      .eq("id", leadId)
      .single();

    if (leadGetError && leadGetError.code !== "PGRST116") {
      console.error("[API/leads/id/legal-search] GET lead query error:", leadGetError);
      return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
    }
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: documents, error } = await (sb.from("recorded_documents") as any)
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[API/leads/id/legal-search] GET query error:", error);
      return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
    }

    const docs = documents ?? [];
    const lastSearchedAt =
      docs.length > 0
        ? (docs as Array<{ created_at: string }>).reduce(
            (latest, doc) => (doc.created_at > latest ? doc.created_at : latest),
            docs[0].created_at,
          )
        : null;

    return NextResponse.json({ documents: docs, lastSearchedAt });
  } catch (err) {
    console.error("[API/leads/id/legal-search] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadError } = await (sb.from("leads") as any)
      .select("id, property_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!lead.property_id) {
      return NextResponse.json({ error: "Lead has no associated property" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propError } = await (sb.from("properties") as any)
      .select("id, apn, county, address, city, state, owner_name, owner_flags")
      .eq("id", lead.property_id)
      .single();

    if (propError || !property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;
    const scoutData = (ownerFlags.scout_data ?? {}) as Record<string, unknown>;
    const ownerName: string =
      typeof scoutData.taxpayer_name === "string" && scoutData.taxpayer_name.trim()
        ? scoutData.taxpayer_name.trim()
        : (property.owner_name as string);

    const rawApn = property.apn as string;
    const apn: string =
      rawApn.startsWith("MANUAL-") &&
      typeof ownerFlags.gis_parcel_number === "string" &&
      ownerFlags.gis_parcel_number.trim()
        ? ownerFlags.gis_parcel_number.trim()
        : rawApn;

    const searchInput: LegalSearchInput = {
      ownerName,
      address: property.address as string,
      apn,
      county: property.county as string,
      city: (property.city as string) || "",
    };

    const lastRunAt =
      typeof ownerFlags.legal_search_last_run_at === "string"
        ? new Date(ownerFlags.legal_search_last_run_at)
        : null;
    const cacheAgeMs = lastRunAt ? Date.now() - lastRunAt.getTime() : Infinity;
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

    if (cacheAgeMs < SIX_HOURS_MS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cachedDocs } = await (sb.from("recorded_documents") as any)
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });

      const docs = (cachedDocs ?? []) as Array<{ created_at: string; case_number?: string | null }>;
      return NextResponse.json({
        cached: true,
        documents: docs,
        documentsFound: docs.length,
        courtCasesFound: docs.filter((doc) => doc.case_number).length,
        lastSearchedAt: lastRunAt?.toISOString() ?? null,
        errors: [],
      });
    }

    const apiKey = process.env.FIRECRAWL_API_KEY;
    const { documents: rawDocuments, errors } = await runLegalSearch(searchInput, apiKey);

    const acceptedDocs = rawDocuments.filter((doc) => {
      const assessment = assessLegalDocumentMatch(doc, searchInput);
      return assessment.accepted;
    });

    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = acceptedDocs.map((doc) => ({
      property_id: lead.property_id,
      lead_id: leadId,
      document_type: doc.documentType,
      instrument_number: doc.instrumentNumber ?? null,
      recording_date: doc.recordingDate ?? null,
      document_date: doc.documentDate ?? null,
      grantor: doc.grantor ?? null,
      grantee: doc.grantee ?? null,
      amount: doc.amount ?? null,
      lender_name: doc.lenderName ?? null,
      status: doc.status,
      case_number: doc.caseNumber ?? null,
      court_name: doc.courtName ?? null,
      case_type: doc.caseType ?? null,
      attorney_name: doc.attorneyName ?? null,
      contact_person: doc.contactPerson ?? null,
      next_hearing_date: doc.nextHearingDate ?? null,
      event_description: doc.eventDescription ?? null,
      source: doc.source,
      source_url: doc.sourceUrl ?? null,
      raw_excerpt: doc.rawExcerpt ?? null,
      fingerprint: buildFingerprint(leadId, doc),
    }));

    let persistenceWarning = false;
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upsertError } = await (sb.from("recorded_documents") as any)
        .upsert(rows, { onConflict: "fingerprint" });

      if (upsertError) {
        console.error("[API/leads/id/legal-search] Upsert error:", upsertError);
        persistenceWarning = true;
      }
    }

    const distressTypesSeen = new Set<DistressType>();
    const distressRows: Array<Record<string, unknown>> = [];

    for (const doc of acceptedDocs) {
      const distressType = DISTRESS_TYPE_MAP[doc.documentType];
      if (!distressType || distressTypesSeen.has(distressType)) continue;
      distressTypesSeen.add(distressType);

      const distressFingerprint = createHash("sha256")
        .update(`${lead.property_id}:${distressType}:county_legal_search`)
        .digest("hex");

      distressRows.push({
        property_id: lead.property_id,
        event_type: distressType,
        source: "county_legal_search",
        status: "active",
        severity: 7,
        fingerprint: distressFingerprint,
        event_date: doc.recordingDate ?? null,
        raw_data: {
          document_type: doc.documentType,
          case_number: doc.caseNumber ?? null,
          instrument_number: doc.instrumentNumber ?? null,
          amount: doc.amount ?? null,
          source_url: doc.sourceUrl ?? null,
          grantor: doc.grantor ?? null,
          grantee: doc.grantee ?? null,
        },
      });
    }

    if (distressRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: distressError } = await (sb.from("distress_events") as any).insert(distressRows);

      if (distressError && distressError.code !== "23505") {
        console.error("[API/leads/id/legal-search] distress_events insert error:", distressError);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: freshProp } = await (sb.from("properties") as any)
      .select("owner_flags")
      .eq("id", lead.property_id)
      .single();
    const freshFlags = (freshProp?.owner_flags ?? {}) as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any)
      .update({ owner_flags: { ...freshFlags, legal_search_last_run_at: now } })
      .eq("id", lead.property_id);

    return NextResponse.json({
      documents: acceptedDocs,
      documentsFound: acceptedDocs.length,
      courtCasesFound: acceptedDocs.filter((doc) => doc.caseNumber).length,
      lastSearchedAt: now,
      errors,
      ...(persistenceWarning ? { persistenceWarning: true } : {}),
    });
  } catch (err) {
    console.error("[API/leads/id/legal-search] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
