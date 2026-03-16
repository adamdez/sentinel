import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import {
  getAllPromptVersions,
  type PromptStatus,
} from "@/lib/prompt-registry";

/**
 * GET  /api/settings/prompt-registry  — list all prompt versions
 * POST /api/settings/prompt-registry  — register a new version
 * PATCH /api/settings/prompt-registry — update status/description/changelog
 *
 * Adam-only config surface. No automatic deployment or rollback.
 *
 * ── GET ──────────────────────────────────────────────────────────────────────
 * Returns all rows grouped by workflow, with status labels.
 *
 * ── POST ─────────────────────────────────────────────────────────────────────
 * Body: { workflow, version, status?, description?, changelog? }
 * Registers a new (workflow, version) pair.
 * Returns 409 if the (workflow, version) pair already exists.
 *
 * ── PATCH ────────────────────────────────────────────────────────────────────
 * Body: { workflow, version, status?, description?, changelog? }
 * Updates an existing row's mutable fields.
 * workflow + version identify the row (not ID) for ease of use.
 */

const VALID_STATUSES: PromptStatus[] = ["testing", "active", "deprecated"];

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await getAllPromptVersions();

    // Group by workflow for UI consumption
    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!grouped[row.workflow]) grouped[row.workflow] = [];
      grouped[row.workflow].push(row);
    }

    return NextResponse.json({ versions: rows, grouped });
  } catch (err) {
    console.error("[API/settings/prompt-registry] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const workflow    = (body.workflow    ?? "").trim();
    const version     = (body.version     ?? "").trim();
    const status      = (body.status      ?? "testing") as PromptStatus;
    const description = (body.description ?? "").trim() || null;
    const changelog   = (body.changelog   ?? "").trim() || null;

    if (!workflow) return NextResponse.json({ error: "workflow is required" }, { status: 400 });
    if (!version)  return NextResponse.json({ error: "version is required" }, { status: 400 });
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("prompt_registry") as any)
      .insert({
        workflow,
        version,
        status,
        description,
        changelog,
        registered_by: user.id,
      })
      .select("*")
      .single();

    if (error) {
      // Unique constraint violation → already exists
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Prompt version ${workflow}@${version} already exists. Use PATCH to update it.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ version: data }, { status: 201 });
  } catch (err) {
    console.error("[API/settings/prompt-registry] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const workflow = (body.workflow ?? "").trim();
    const version  = (body.version  ?? "").trim();

    if (!workflow) return NextResponse.json({ error: "workflow is required" }, { status: 400 });
    if (!version)  return NextResponse.json({ error: "version is required" }, { status: 400 });

    const patch: Record<string, unknown> = {
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      patch.status = body.status;
    }
    if (body.description !== undefined) {
      patch.description = (body.description ?? "").trim() || null;
    }
    if (body.changelog !== undefined) {
      patch.changelog = (body.changelog ?? "").trim() || null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("prompt_registry") as any)
      .update(patch)
      .eq("workflow", workflow)
      .eq("version", version)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)  return NextResponse.json(
      { error: `Prompt ${workflow}@${version} not found. Use POST to register it first.` },
      { status: 404 }
    );

    return NextResponse.json({ version: data });
  } catch (err) {
    console.error("[API/settings/prompt-registry] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
