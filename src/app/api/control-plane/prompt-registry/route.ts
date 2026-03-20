import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/control-plane/prompt-registry
 *
 * List prompt versions. Optional filters: ?workflow=summarize&status=active
 *
 * Blueprint 15.1: "Prompt versioning with explicit lifecycle (testing → active → deprecated)."
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflow = req.nextUrl.searchParams.get("workflow");
  const status = req.nextUrl.searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("prompt_registry") as any)
    .select("*")
    .order("workflow", { ascending: true })
    .order("version", { ascending: false })
    .limit(100);

  if (workflow) query = query.eq("workflow", workflow);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, prompts: data ?? [] });
}

/**
 * POST /api/control-plane/prompt-registry
 *
 * Register a new prompt version. Body:
 * { workflow, version, status?, description?, changelog? }
 *
 * Status defaults to "testing". Only one version per workflow can be "active" —
 * if you set a new version to "active", the previous active one is deprecated.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { workflow, version, status, description, changelog } = body as {
    workflow?: string;
    version?: string;
    status?: string;
    description?: string;
    changelog?: string;
  };

  if (!workflow?.trim() || !version?.trim()) {
    return NextResponse.json(
      { error: "workflow and version are required" },
      { status: 400 },
    );
  }

  const finalStatus = status ?? "testing";
  if (!["testing", "active", "deprecated"].includes(finalStatus)) {
    return NextResponse.json(
      { error: "status must be testing, active, or deprecated" },
      { status: 400 },
    );
  }

  // If setting to active, deprecate the current active version for this workflow
  if (finalStatus === "active") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("prompt_registry") as any)
      .update({ status: "deprecated", updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("workflow", workflow.trim())
      .eq("status", "active");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("prompt_registry") as any)
    .insert({
      workflow: workflow.trim(),
      version: version.trim(),
      status: finalStatus,
      description: description?.trim() ?? null,
      changelog: changelog?.trim() ?? null,
      registered_by: user.id,
      updated_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, prompt: data }, { status: 201 });
}

/**
 * PATCH /api/control-plane/prompt-registry
 *
 * Update a prompt version. Body:
 * { id, status?, description?, changelog? }
 *
 * Same auto-deprecation logic applies when promoting to "active".
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, status, description, changelog } = body as {
    id?: string;
    status?: string;
    description?: string;
    changelog?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (status && !["testing", "active", "deprecated"].includes(status)) {
    return NextResponse.json(
      { error: "status must be testing, active, or deprecated" },
      { status: 400 },
    );
  }

  // If promoting to active, find the workflow first
  if (status === "active") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (sb.from("prompt_registry") as any)
      .select("workflow")
      .eq("id", id)
      .single();

    if (existing?.workflow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("prompt_registry") as any)
        .update({ status: "deprecated", updated_by: user.id, updated_at: new Date().toISOString() })
        .eq("workflow", existing.workflow)
        .eq("status", "active")
        .neq("id", id);
    }
  }

  const patch: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;
  if (description !== undefined) patch.description = description?.trim() ?? null;
  if (changelog !== undefined) patch.changelog = changelog?.trim() ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("prompt_registry") as any)
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, prompt: data });
}
