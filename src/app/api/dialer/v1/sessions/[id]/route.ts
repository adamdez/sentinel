/**
 * GET   /api/dialer/v1/sessions/[id]  — fetch a single session
 * PATCH /api/dialer/v1/sessions/[id]  — update status, twilio_sid, disposition, etc.
 *
 * BOUNDARY RULES:
 *   - Auth via getDialerUser() — not @/lib/supabase
 *   - All writes via session-manager (enforces state machine + ownership)
 *   - Returns 404 / 403 / 409 per session-manager error codes
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getSession, updateSession } from "@/lib/dialer/session-manager";
import type { UpdateSessionInput, CallSessionStatus } from "@/lib/dialer/types";

type RouteContext = { params: { id: string } };

const STATUS_CODE_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_TRANSITION: 409,
  DB_ERROR: 500,
  VALIDATION_ERROR: 400,
};

function errorStatus(code?: string): number {
  return STATUS_CODE_MAP[code ?? ""] ?? 500;
}

// ─────────────────────────────────────────────────────────────
// GET /api/dialer/v1/sessions/[id]
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  const sb = createDialerClient();
  const result = await getSession(sb, id, user.id);

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: errorStatus(result.code) },
    );
  }

  return NextResponse.json({ session: result.data });
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/dialer/v1/sessions/[id]
// Body (all optional): { status, twilio_sid, ended_at, duration_sec, disposition, ai_summary }
// ─────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate status if provided
  const VALID_STATUSES: CallSessionStatus[] = [
    "initiating",
    "ringing",
    "connected",
    "ended",
    "failed",
  ];

  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !VALID_STATUSES.includes(body.status as CallSessionStatus)
    ) {
      return NextResponse.json(
        { error: `Invalid status value: "${body.status}"` },
        { status: 400 },
      );
    }
  }

  // Validate duration_sec if provided
  if (body.duration_sec !== undefined) {
    if (typeof body.duration_sec !== "number" || body.duration_sec < 0) {
      return NextResponse.json(
        { error: "duration_sec must be a non-negative number" },
        { status: 400 },
      );
    }
  }

  // Build typed update input — only forward recognized fields
  const update: UpdateSessionInput = {};
  if (body.status      !== undefined) update.status       = body.status      as CallSessionStatus;
  if (body.twilio_sid  !== undefined) update.twilio_sid   = body.twilio_sid  as string;
  if (body.ended_at    !== undefined) update.ended_at     = body.ended_at    as string;
  if (body.duration_sec !== undefined) update.duration_sec = body.duration_sec as number;
  if (body.disposition  !== undefined) update.disposition  = body.disposition  as string;
  if (body.ai_summary   !== undefined) update.ai_summary   = body.ai_summary   as string;

  const sb = createDialerClient();
  const result = await updateSession(sb, id, user.id, update);

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: errorStatus(result.code) },
    );
  }

  return NextResponse.json({ session: result.data });
}
