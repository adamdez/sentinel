/**
 * GET /api/search/phone?q=5092173887
 *
 * Phone number search API — searches all phone-bearing tables in Sentinel
 * and returns structured results for the search UI.
 *
 * Used by the global search bar when the query looks like a phone number.
 * Cursor integrates this alongside existing property/contact search.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { searchPhoneCandidates } from "@/lib/dialer/phone-lookup";
import type { PhoneMatchConfidence, PhoneMatchSource } from "@/lib/dialer/phone-lookup";

export interface PhoneSearchResult {
  phone: string;
  matchedPhone: string | null;
  leadId: string | null;
  ownerName: string | null;
  propertyAddress: string | null;
  matchSource: PhoneMatchSource;
  matchConfidence: PhoneMatchConfidence;
  matchReason: string;
  contactId: string | null;
  propertyId: string | null;
  intakeLeadId: string | null;
  recentCallCount: number;
  lastCallDate: string | null;
  /** Lead status if available */
  status: string | null;
  /** Deeplink for the UI */
  href: string | null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.replace(/\D/g, "").length < 4) {
    return NextResponse.json({ error: "q parameter required (4+ digits)" }, { status: 400 });
  }

  const sb = createServerClient();
  const candidates = await searchPhoneCandidates(q, sb, { limit: 10 });

  const leadIds = [...new Set(candidates.map((candidate) => candidate.leadId).filter(Boolean))] as string[];
  let leadStatuses = new Map<string, string | null>();
  if (leadIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (sb.from("leads") as any)
      .select("id, status")
      .in("id", leadIds);

    leadStatuses = new Map(
      ((leads ?? []) as Array<{ id: string; status: string | null }>).map((lead) => [lead.id, lead.status ?? null]),
    );
  }

  const results: PhoneSearchResult[] = candidates.map((candidate) => {
    let href: string | null = null;
    if (candidate.leadId) {
      href = `/leads?open=${candidate.leadId}`;
    } else if (candidate.intakeLeadId) {
      href = `/intake/${candidate.intakeLeadId}`;
    }

    return {
      phone: q,
      matchedPhone: candidate.matchedPhone,
      leadId: candidate.leadId,
      ownerName: candidate.ownerName,
      propertyAddress: candidate.propertyAddress,
      matchSource: candidate.matchSource,
      matchConfidence: candidate.matchConfidence,
      matchReason: candidate.matchReason,
      contactId: candidate.contactId,
      propertyId: candidate.propertyId,
      intakeLeadId: candidate.intakeLeadId,
      recentCallCount: candidate.recentCallCount,
      lastCallDate: candidate.lastCallDate,
      status: candidate.leadId ? (leadStatuses.get(candidate.leadId) ?? null) : null,
      href,
    };
  });

  return NextResponse.json({
    results,
    query: q,
  });
}
