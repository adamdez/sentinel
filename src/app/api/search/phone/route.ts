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
import { unifiedPhoneLookup } from "@/lib/dialer/phone-lookup";
import type { PhoneMatchSource } from "@/lib/dialer/phone-lookup";

export interface PhoneSearchResult {
  phone: string;
  leadId: string | null;
  ownerName: string | null;
  propertyAddress: string | null;
  matchSource: PhoneMatchSource;
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
  const result = await unifiedPhoneLookup(q, sb);

  // If we got a lead_id, fetch the lead status for the response
  let leadStatus: string | null = null;
  if (result.leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("status")
      .eq("id", result.leadId)
      .maybeSingle();
    leadStatus = lead?.status ?? null;
  }

  // Build deeplink
  let href: string | null = null;
  if (result.leadId) {
    href = `/leads/${result.leadId}`;
  } else if (result.intakeLeadId) {
    href = `/intake/${result.intakeLeadId}`;
  }

  const searchResult: PhoneSearchResult = {
    phone: q,
    leadId: result.leadId,
    ownerName: result.ownerName,
    propertyAddress: result.propertyAddress,
    matchSource: result.matchSource,
    contactId: result.contactId,
    propertyId: result.propertyId,
    intakeLeadId: result.intakeLeadId,
    recentCallCount: result.recentCallCount,
    lastCallDate: result.lastCallDate,
    status: leadStatus,
    href,
  };

  return NextResponse.json({
    results: result.matchSource ? [searchResult] : [],
    query: q,
  });
}
