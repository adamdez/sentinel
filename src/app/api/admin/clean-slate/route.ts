import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/admin/clean-slate
 *
 * Deletes all leads in "staging" and "prospect" status to provide a clean
 * slate before deploying the pipeline overhaul.
 *
 * Auth: Bearer CRON_SECRET
 * Body: { confirm: true }  (safety gate)
 *
 * Only touches staging + prospect leads. Properties are left intact so they
 * can be re-enriched if imported again.
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { confirm?: boolean; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Safety gate: body must include { confirm: true }" },
      { status: 400 },
    );
  }

  const sourceFilter = body.source; // optional: only delete leads from this source

  const sb = createServerClient();

  try {
    // ── 1. Count leads per status before deletion ──────────────────────
    console.log("[CleanSlate] Counting staging + prospect leads...");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stagingQ = (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "staging");
    if (sourceFilter) stagingQ = stagingQ.eq("source", sourceFilter);
    const { count: stagingCount, error: stagingCountErr } = await stagingQ;

    if (stagingCountErr) {
      console.error("[CleanSlate] Staging count error:", stagingCountErr.message);
      return NextResponse.json({ error: stagingCountErr.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prospectQ = (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "prospect");
    if (sourceFilter) prospectQ = prospectQ.eq("source", sourceFilter);
    const { count: prospectCount, error: prospectCountErr } = await prospectQ;

    if (prospectCountErr) {
      console.error("[CleanSlate] Prospect count error:", prospectCountErr.message);
      return NextResponse.json({ error: prospectCountErr.message }, { status: 500 });
    }

    const totalStaging = stagingCount ?? 0;
    const totalProspect = prospectCount ?? 0;
    const totalToDelete = totalStaging + totalProspect;

    console.log(
      `[CleanSlate] Found ${totalStaging} staging + ${totalProspect} prospect = ${totalToDelete} leads to delete`,
    );

    if (totalToDelete === 0) {
      return NextResponse.json({
        success: true,
        message: "No staging or prospect leads found — nothing to delete",
        deleted_staging: 0,
        deleted_prospect: 0,
      });
    }

    // ── 2. Delete staging leads ────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let delStagingQ = (sb.from("leads") as any).delete().eq("status", "staging");
    if (sourceFilter) delStagingQ = delStagingQ.eq("source", sourceFilter);
    const { error: delStagingErr } = await delStagingQ;

    if (delStagingErr) {
      console.error("[CleanSlate] Delete staging error:", delStagingErr.message);
      return NextResponse.json(
        { error: `Failed to delete staging leads: ${delStagingErr.message}` },
        { status: 500 },
      );
    }

    // ── 3. Delete prospect leads ───────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let delProspectQ = (sb.from("leads") as any).delete().eq("status", "prospect");
    if (sourceFilter) delProspectQ = delProspectQ.eq("source", sourceFilter);
    const { error: delProspectErr } = await delProspectQ;

    if (delProspectErr) {
      console.error("[CleanSlate] Delete prospect error:", delProspectErr.message);
      return NextResponse.json(
        { error: `Failed to delete prospect leads: ${delProspectErr.message}` },
        { status: 500 },
      );
    }

    console.log(
      `[CleanSlate] Deleted ${totalStaging} staging + ${totalProspect} prospect leads`,
    );

    // ── 4. Audit log ───────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: SYSTEM_USER_ID,
      action: "admin.clean_slate",
      entity_type: "system",
      entity_id: "clean_slate",
      details: {
        deleted_staging: totalStaging,
        deleted_prospect: totalProspect,
        total_deleted: totalToDelete,
        source_filter: sourceFilter ?? "all",
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      deleted_staging: totalStaging,
      deleted_prospect: totalProspect,
      total_deleted: totalToDelete,
    });
  } catch (err) {
    console.error("[CleanSlate] Error:", err);
    return NextResponse.json(
      { error: "Clean slate failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
