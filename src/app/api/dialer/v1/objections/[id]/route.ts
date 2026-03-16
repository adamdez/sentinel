/**
 * PATCH /api/dialer/v1/objections/[id]
 *
 * Updates an objection tag row — primarily for resolving objections
 * or correcting the tag/note.
 *
 * Body (all optional):
 *   {
 *     status?: "open" | "resolved"
 *     tag?:    ObjectionTag
 *     note?:   string | null
 *   }
 *
 * On resolve: sets resolved_by = user.id and resolved_at = now().
 * On re-open: clears resolved_by and resolved_at.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { OBJECTION_TAGS } from "@/lib/dialer/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sb = createDialerClient();

  // Verify the row exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchErr } = await (sb.from("lead_objection_tags") as any)
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  // status change
  const newStatus = body.status;
  if (newStatus === "resolved" || newStatus === "open") {
    patch.status = newStatus;
    if (newStatus === "resolved") {
      patch.resolved_by = user.id;
      patch.resolved_at = new Date().toISOString();
    } else {
      patch.resolved_by = null;
      patch.resolved_at = null;
    }
  }

  // tag correction
  const newTag = body.tag;
  if (typeof newTag === "string" && (OBJECTION_TAGS as readonly string[]).includes(newTag)) {
    patch.tag = newTag;
  }

  // note correction
  if ("note" in body) {
    patch.note = body.note === null ? null : (typeof body.note === "string" ? body.note.trim().slice(0, 120) : null);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateErr } = await (sb.from("lead_objection_tags") as any)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) {
    console.error("[objections/patch] update failed:", updateErr.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, objection: updated });
}
