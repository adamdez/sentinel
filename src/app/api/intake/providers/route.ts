import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/intake/providers
 *
 * Returns list of active intake providers for UI dropdown.
 * Used in the "Claim Lead" modal to let operators select the provider/source.
 *
 * Returns: { success: true, providers: [{ id, name, description, approved_email_patterns }] }
 *
 * PATCH /api/intake/providers
 *
 * Updates a provider's approved email patterns.
 * Request body: { provider_id: string, approved_email_patterns: string[] }
 * Patterns can be full emails ("john@leadhouse.com") or domain wildcards ("@leadhouse.com")
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

    // Fetch active providers with approved email patterns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: providers, error } = await (sb.from("intake_providers") as any)
      .select("id, name, description, approved_email_patterns")
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

export async function PATCH(req: NextRequest) {
  try {
    const sb = createServerClient();

    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(authHeader);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Founder-only: restrict to admin users
    const founderIds = (process.env.FOUNDER_USER_IDS || "").split(",").map(id => id.trim());
    if (!founderIds.includes(user.id)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { provider_id, approved_email_patterns } = body;

    if (!provider_id || !Array.isArray(approved_email_patterns)) {
      return NextResponse.json(
        { error: "provider_id and approved_email_patterns[] required" },
        { status: 400 }
      );
    }

    // Sanitize patterns — lowercase, trim
    const cleanPatterns = approved_email_patterns
      .map((p: string) => p.toLowerCase().trim())
      .filter((p: string) => p.length > 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("intake_providers") as any)
      .update({ approved_email_patterns: cleanPatterns })
      .eq("id", provider_id);

    if (error) {
      console.error("[Intake Providers] Update failed:", error);
      return NextResponse.json({ error: "Failed to update provider" }, { status: 500 });
    }

    return NextResponse.json({ success: true, approved_email_patterns: cleanPatterns });
  } catch (error) {
    console.error("[Intake Providers] PATCH failed:", error);
    return NextResponse.json({ error: "Failed to update provider" }, { status: 500 });
  }
}
