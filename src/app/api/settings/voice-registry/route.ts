/**
 * GET  /api/settings/voice-registry  — list all voice registry entries
 * POST /api/settings/voice-registry  — register a new script or handoff-rule version
 * PATCH /api/settings/voice-registry — update status/description/changelog/rule_config
 *
 * Adam-only config surface. No automatic deployment or live-routing changes.
 *
 * ── GET ───────────────────────────────────────────────────────────────────────
 * Returns all rows grouped by workflow.
 *
 * ── POST ──────────────────────────────────────────────────────────────────────
 * Body: { workflow, registry_type, version, status?, description?, changelog?, rule_config? }
 * Returns 409 if the (workflow, version, registry_type) triple already exists.
 *
 * ── PATCH ─────────────────────────────────────────────────────────────────────
 * Body: { workflow, version, registry_type, status?, description?, changelog?, rule_config? }
 * workflow + version + registry_type identify the row.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getAllVoiceEntries, type VoiceRegistryStatus, type VoiceRegistryType } from "@/lib/voice-registry";

const VALID_STATUSES: VoiceRegistryStatus[]  = ["testing", "active", "deprecated"];
const VALID_TYPES:    VoiceRegistryType[]    = ["script", "handoff_rule"];

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sb   = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await getAllVoiceEntries();

    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!grouped[row.workflow]) grouped[row.workflow] = [];
      grouped[row.workflow].push(row);
    }

    return NextResponse.json({ versions: rows, grouped });
  } catch (err) {
    console.error("[API/settings/voice-registry] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const sb   = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const workflow      = (body.workflow      ?? "").trim();
    const registryType  = (body.registry_type ?? "script") as VoiceRegistryType;
    const version       = (body.version       ?? "").trim();
    const status        = (body.status        ?? "testing") as VoiceRegistryStatus;
    const description   = (body.description   ?? "").trim() || null;
    const changelog     = (body.changelog     ?? "").trim() || null;
    const ruleConfig    = body.rule_config ?? null;

    if (!workflow)  return NextResponse.json({ error: "workflow is required" },      { status: 400 });
    if (!version)   return NextResponse.json({ error: "version is required" },       { status: 400 });
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }
    if (!VALID_TYPES.includes(registryType)) {
      return NextResponse.json({ error: `registry_type must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
    }
    if (registryType === "handoff_rule" && ruleConfig !== null && typeof ruleConfig !== "object") {
      return NextResponse.json({ error: "rule_config must be a JSON object for handoff_rule entries" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("voice_registry") as any)
      .insert({
        workflow,
        registry_type:  registryType,
        version,
        status,
        description,
        changelog,
        rule_config:    ruleConfig,
        registered_by:  user.id,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Voice entry ${workflow}@${version} (${registryType}) already exists. Use PATCH to update it.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ version: data }, { status: 201 });
  } catch (err) {
    console.error("[API/settings/voice-registry] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const sb   = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const workflow     = (body.workflow      ?? "").trim();
    const version      = (body.version       ?? "").trim();
    const registryType = (body.registry_type ?? "").trim() as VoiceRegistryType;

    if (!workflow)      return NextResponse.json({ error: "workflow is required" },      { status: 400 });
    if (!version)       return NextResponse.json({ error: "version is required" },       { status: 400 });
    if (!registryType)  return NextResponse.json({ error: "registry_type is required" }, { status: 400 });

    const patch: Record<string, unknown> = {
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.description !== undefined) {
      patch.description = (body.description ?? "").trim() || null;
    }
    if (body.changelog !== undefined) {
      patch.changelog = (body.changelog ?? "").trim() || null;
    }
    if (body.rule_config !== undefined) {
      patch.rule_config = body.rule_config ?? null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("voice_registry") as any)
      .update(patch)
      .eq("workflow",      workflow)
      .eq("version",       version)
      .eq("registry_type", registryType)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)  return NextResponse.json(
      { error: `Voice entry ${workflow}@${version} (${registryType}) not found. Use POST to register it first.` },
      { status: 404 }
    );

    return NextResponse.json({ version: data });
  } catch (err) {
    console.error("[API/settings/voice-registry] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
