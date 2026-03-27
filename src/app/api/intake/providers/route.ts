import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/intake/providers
 *
 * Returns list of active intake providers for UI dropdown.
 * Used in the "Claim Lead" modal to let operators select the provider/source.
 *
 * Returns: { success: true, providers: [{ id, name, description }] }
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();

    // Verify user is authenticated
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(authHeader);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch active providers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: providers, error } = await (sb.from("intake_providers") as any)
      .select("id, name, description")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[Intake Providers] Query failed:", error);
      return NextResponse.json(
        { error: "Failed to fetch providers" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      providers: providers || [],
    });
  } catch (error) {
    console.error("[Intake Providers] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 }
    );
  }
}
