/**
 * GET  /api/dialer/v1/sessions/[id]/post-call-structure
 * PATCH /api/dialer/v1/sessions/[id]/post-call-structure
 *
 * GET:  Returns the structured post-call output for a session.
 *       Used by seller-memory and review surfaces.
 *
 * PATCH: Applies operator corrections to individual fields.
 *        Sets correction_status = "corrected" and records who/when.
 *        Does NOT require a full re-submission — partial updates accepted.
 *
 * BOUNDARY:
 *   - Reads/writes post_call_structures (dialer-domain table)
 *   - Never touches leads, calls_log, or CRM-owned tables
 *   - Auth via getDialerUser
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import {
  buildCorrectionPatch,
  type PostCallCorrectionInput,
} from "@/lib/dialer/post-call-structure";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const sb = createDialerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("post_call_structures") as any)
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ structure: null });

  return NextResponse.json({ structure: data });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;

  let body: PostCallCorrectionInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = buildCorrectionPatch(body);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No correctable fields provided" }, { status: 400 });
  }

  const sb = createDialerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("post_call_structures") as any)
    .update({
      ...patch,
      correction_status: "corrected",
      corrected_at:      new Date().toISOString(),
      corrected_by:      user.id,
      updated_at:        new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "No post-call structure found for this session" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ structure: data });
}
