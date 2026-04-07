import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isSchemaDriftError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /does not exist|could not find the/i.test(error.message ?? "");
}

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const nowIso = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeQ = (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("intro_sop_active", true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completedQ = (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .not("intro_completed_at", "is", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const needsCategoryQ = (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .not("intro_completed_at", "is", null)
      .is("intro_exit_category", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stuckQ = (sb.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("intro_sop_active", true)
      .lt("next_call_scheduled_at", nowIso);

    const [active, completed, needsCategory, stuck] = await Promise.all([activeQ, completedQ, needsCategoryQ, stuckQ]);
    if (active.error || completed.error || needsCategory.error || stuck.error) {
      const firstError = active.error ?? completed.error ?? needsCategory.error ?? stuck.error;
      if (isSchemaDriftError(firstError)) {
        return NextResponse.json({
          ok: true,
          supported: false,
          totals: null,
        });
      }
      return NextResponse.json({ error: firstError?.message ?? "Failed to load intro report" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: exits, error: exitsError } = await (sb.from("leads") as any)
      .select("intro_exit_category")
      .not("intro_exit_category", "is", null)
      .limit(5000);

    if (exitsError && !isSchemaDriftError(exitsError)) {
      return NextResponse.json({ error: exitsError.message ?? "Failed to load exits" }, { status: 500 });
    }

    const exitBuckets: Record<string, number> = {};
    for (const row of (exits ?? []) as Array<{ intro_exit_category?: string | null }>) {
      const key = row.intro_exit_category ?? "unknown";
      exitBuckets[key] = (exitBuckets[key] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      supported: true,
      totals: {
        active_intro: active.count ?? 0,
        completed_intro: completed.count ?? 0,
        needs_category: needsCategory.count ?? 0,
        overdue_active: stuck.count ?? 0,
      },
      exits: exitBuckets,
    });
  } catch (error) {
    console.error("[API/admin/intro-sop] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
