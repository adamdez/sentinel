/**
 * GET /api/dialer/v1/context/[leadId]
 *
 * Returns a CRMLeadContext snapshot for the given lead.
 * Used by the dialer UI to pre-populate the call screen before
 * a session is created (so context_snapshot is available immediately).
 *
 * In Stage 3 extraction, this route becomes a proxy to an HTTP call
 * rather than a direct DB read. The client API contract is unchanged.
 *
 * BOUNDARY RULES:
 *   - Auth via getDialerUser() — not @/lib/supabase
 *   - CRM reads ONLY via getCRMLeadContext() in crm-bridge
 *   - Never reads leads/properties/contacts/calls_log directly here
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDialerUser } from "@/lib/dialer/db";
import { getCRMLeadContext } from "@/lib/dialer/crm-bridge";

type RouteContext = { params: { leadId: string } };

// ─────────────────────────────────────────────────────────────
// GET /api/dialer/v1/context/[leadId]
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leadId } = params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const context = await getCRMLeadContext(leadId);

  if (!context) {
    return NextResponse.json(
      { error: "Lead not found or context unavailable" },
      { status: 404 },
    );
  }

  return NextResponse.json({ context });
}
