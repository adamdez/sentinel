/**
 * PATCH /api/dialer/v1/sessions/[id]/notes/[noteId]
 * Confirm or edit an AI-generated note.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { confirmNote } from "@/lib/dialer/note-manager";

type RouteContext = { params: Promise<{ id: string; noteId: string }> };

function errorStatus(code?: string): number {
  if (code === "FORBIDDEN")        return 403;
  if (code === "NOT_FOUND")        return 404;
  if (code === "VALIDATION_ERROR") return 400;
  return 500;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId, noteId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sb = createDialerClient();
  const result = await confirmNote(sb, noteId, sessionId, user.id, {
    is_confirmed: typeof body.is_confirmed === "boolean" ? body.is_confirmed : undefined,
    content:      typeof body.content === "string" ? body.content : undefined,
  });

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: errorStatus(result.code) },
    );
  }

  return NextResponse.json({ note: result.data });
}
