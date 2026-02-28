import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { DashboardLayout } from "@/lib/dashboard-config";

interface ProfileLayout {
  saved_dashboard_layout: Record<string, unknown> | null;
}

/**
 * Ensure a user_profiles row exists for the given userId.
 * Uses service role to bypass RLS. Returns true if profile exists/created.
 */
async function ensureProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  userId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("user_profiles") as any)
    .select("id")
    .eq("id", userId)
    .single();

  if (data) return true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = await (sb.from("user_profiles") as any).insert({
    id: userId,
    full_name: "Sentinel User",
    email: `${userId}@sentinel.local`,
    role: "agent",
    is_active: true,
    preferences: {},
  });

  if (insertErr) {
    console.error("[Dashboard] ensureProfile insert failed:", insertErr);
    return false;
  }
  return true;
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

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { layout: null, source: "default", message: "Not authenticated" },
        { status: 401 }
      );
    }

    await ensureProfile(sb, userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("user_profiles") as any)
      .select("saved_dashboard_layout")
      .eq("id", userId)
      .single() as { data: ProfileLayout | null; error: { message: string } | null };

    if (error) {
      console.error("[dashboard/layout GET]", error);
      return NextResponse.json({
        layout: null,
        source: "default",
        message: "Failed to load layout",
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

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (user.id !== userId) {
      return NextResponse.json(
        { error: "Cannot modify another user's layout" },
        { status: 403 }
      );
    }

    await ensureProfile(sb, userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("user_profiles") as any)
      .update({ saved_dashboard_layout: layout })
      .eq("id", userId) as { error: { message: string } | null };

    if (error) {
      console.error("[dashboard/layout PUT]", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: userId,
      action: "settings.changed",
      entity_type: "dashboard_layout",
      entity_id: userId,
      details: { tileCount: layout.tiles.length },
    });

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
