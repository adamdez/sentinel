/**
 * POST /api/dialer/v1/sessions  — create a new call session
 * GET  /api/dialer/v1/sessions  — list recent sessions for the authed user
 *
 * BOUNDARY RULES:
 *   - Auth via getDialerUser() from ./lib/dialer/db (not @/lib/supabase)
 *   - DB via createDialerClient() — never imports createServerClient
 *   - Session writes via session-manager only (no direct table access here)
 *   - CRM context built lazily via crm-bridge
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import {
  createSession,
  listRecentSessions,
  type ListSessionsOptions,
} from "@/lib/dialer/session-manager";
import { getCRMLeadContext } from "@/lib/dialer/crm-bridge";
import type { CreateSessionInput, CallSessionStatus } from "@/lib/dialer/types";

// ─────────────────────────────────────────────────────────────
// POST /api/dialer/v1/sessions
// Body: { lead_id: string, phone_dialed: string, context_snapshot?: CRMLeadContext }
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    lead_id: string;
    phone_dialed: string;
    context_snapshot?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.lead_id || typeof body.lead_id !== "string") {
    return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
  }
  if (!body.phone_dialed || typeof body.phone_dialed !== "string") {
    return NextResponse.json({ error: "phone_dialed is required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // If the caller didn't supply a context snapshot, fetch it from the CRM.
  // This is the only code path that crosses the dialer/CRM boundary.
  let contextSnapshot = body.context_snapshot ?? null;
  if (!contextSnapshot) {
    contextSnapshot = await getCRMLeadContext(body.lead_id) ?? null;
  }

  const input: CreateSessionInput = {
    lead_id: body.lead_id,
    phone_dialed: body.phone_dialed,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context_snapshot: contextSnapshot as any,
  };

  const result = await createSession(sb, input, user.id);

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "Failed to create session", code: result.code },
      { status: result.code === "DB_ERROR" ? 500 : 400 },
    );
  }

  return NextResponse.json({ session: result.data }, { status: 201 });
}

// ─────────────────────────────────────────────────────────────
// GET /api/dialer/v1/sessions
// Query params: limit?, status?, lead_id?
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const options: ListSessionsOptions = {};

  const limitParam = searchParams.get("limit");
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      options.limit = parsed;
    }
  }

  const statusParam = searchParams.get("status");
  if (statusParam) {
    const VALID_STATUSES: CallSessionStatus[] = [
      "initiating",
      "ringing",
      "connected",
      "ended",
      "failed",
    ];
    if (VALID_STATUSES.includes(statusParam as CallSessionStatus)) {
      options.status = statusParam as CallSessionStatus;
    } else {
      return NextResponse.json(
        { error: `Invalid status filter: "${statusParam}"` },
        { status: 400 },
      );
    }
  }

  const leadIdParam = searchParams.get("lead_id");
  if (leadIdParam) {
    options.lead_id = leadIdParam;
  }

  const sb = createDialerClient();
  const result = await listRecentSessions(sb, user.id, options);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ sessions: result.data });
}
