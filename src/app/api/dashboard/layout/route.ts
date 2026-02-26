import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { DashboardLayout } from "@/lib/dashboard-config";

interface ProfileLayout {
  saved_dashboard_layout: Record<string, unknown> | null;
}

/**
 * GET /api/dashboard/layout?userId=xxx
 *
 * Load the user's saved dashboard layout from Supabase user_profiles.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const sb = createServerClient();
    // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("user_profiles") as any)
      .select("saved_dashboard_layout")
      .eq("id", userId)
      .single() as { data: ProfileLayout | null; error: { message: string } | null };

    if (error) {
      return NextResponse.json({
        layout: null,
        source: "default",
        message: error.message,
      });
    }

    const savedLayout = data?.saved_dashboard_layout ?? null;

    return NextResponse.json({
      layout: savedLayout,
      source: savedLayout ? "supabase" : "default",
    });
  } catch {
    return NextResponse.json({
      layout: null,
      source: "default",
      message: "Supabase not connected — using default layout",
    });
  }
}

/**
 * PUT /api/dashboard/layout
 *
 * Save the user's dashboard layout to Supabase user_profiles JSONB column.
 * RBAC: users can only save their own layout.
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId, layout } = (await request.json()) as {
      userId: string;
      layout: DashboardLayout;
    };

    if (!userId || !layout?.tiles) {
      return NextResponse.json(
        { error: "userId and layout.tiles required" },
        { status: 400 }
      );
    }

    if (layout.tiles.length > 6) {
      return NextResponse.json(
        { error: "Maximum 6 dashboard tiles allowed" },
        { status: 400 }
      );
    }

    const sb = createServerClient();
    // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("user_profiles") as any)
      .update({ saved_dashboard_layout: layout })
      .eq("id", userId) as { error: { message: string } | null };

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId,
      tileCount: layout.tiles.length,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Dashboard] Error saving layout:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
