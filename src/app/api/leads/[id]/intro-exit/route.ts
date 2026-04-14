import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  exitIntroSop,
  INTRO_EXIT_CATEGORIES,
  scheduleIntroRetry,
  type IntroExitCategory,
  toIntroSopState,
} from "@/lib/intro-sop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: leadId } = await params;
    if (!leadId) return NextResponse.json({ error: "Missing lead ID" }, { status: 400 });

    const body = await req.json().catch(() => ({} as {
      category?: string;
      action?: string;
      nextRound?: number;
    }));

    if (body.action === "retry") {
      if (body.nextRound !== 2 && body.nextRound !== 3) {
        return NextResponse.json({ error: "nextRound must be 2 or 3 for retry" }, { status: 400 });
      }

      const result = await scheduleIntroRetry({
        sb,
        leadId,
        nextRound: body.nextRound,
        userId: user.id,
      });

      if (!result.supported) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: lead } = await (sb.from("leads") as any)
          .select("intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category, intro_exit_reason, next_action_due_at, next_follow_up_at")
          .eq("id", leadId)
          .maybeSingle();
        const state = toIntroSopState((lead ?? null) as Record<string, unknown> | null);
        return NextResponse.json({
          ok: true,
          supported: false,
          ...state,
        });
      }

      return NextResponse.json({
        ok: true,
        supported: true,
        ...result.state,
      });
    }

    const category = body.category;
    if (!category || !INTRO_EXIT_CATEGORIES.includes(category as IntroExitCategory)) {
      return NextResponse.json(
        { error: `category must be one of: ${INTRO_EXIT_CATEGORIES.join(", ")}, or action=retry with nextRound=2|3` },
        { status: 400 },
      );
    }

    const result = await exitIntroSop({
      sb,
      leadId,
      category: category as IntroExitCategory,
      userId: user.id,
    });

    if (!result.supported) {
      // If schema hasn't migrated yet, still return a deterministic response.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lead } = await (sb.from("leads") as any)
        .select("intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category, intro_exit_reason, next_action_due_at, next_follow_up_at")
        .eq("id", leadId)
        .maybeSingle();
      const state = toIntroSopState((lead ?? null) as Record<string, unknown> | null);
      return NextResponse.json({
        ok: true,
        supported: false,
        ...state,
      });
    }

    return NextResponse.json({
      ok: true,
      supported: true,
      ...result.state,
    });
  } catch (error) {
    console.error("[API/leads/[id]/intro-exit] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
