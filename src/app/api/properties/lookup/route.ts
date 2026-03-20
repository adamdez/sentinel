import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { lookupProperty, getConfiguredProviders } from "@/providers/lookup-service";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/properties/lookup
 *
 * Universal property lookup. Searches configured providers (ATTOM, Bricked, Regrid)
 * and returns normalized canonical facts without writing to CRM.
 *
 * Body: { address?: string, apn?: string, county?: string, state?: string, zip?: string, providers?: string[] }
 *
 * Returns raw provider results + canonical facts. Does NOT create artifacts
 * or write to the intelligence pipeline — that happens when the operator
 * triggers research or promotes the property to a lead.
 *
 * Blueprint: "Provider payload → raw artifacts → normalized fact assertions"
 * This endpoint returns the raw + normalized data for UI display.
 * Write-path persistence happens through /api/agents/research or manual artifact capture.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { address, apn, county, state, zip, providers } = body;

    if (!address && !apn) {
      return NextResponse.json(
        { error: "Either address or apn is required" },
        { status: 400 },
      );
    }

    // Also check local DB for existing property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existingProperty = null;
    if (address) {
      const { data } = await (sb.from("properties") as any)
        .select("*")
        .ilike("address", `%${address}%`)
        .limit(1)
        .maybeSingle();
      existingProperty = data;
    } else if (apn && county) {
      const { data } = await (sb.from("properties") as any)
        .select("*")
        .eq("apn", apn)
        .ilike("county", `%${county}%`)
        .limit(1)
        .maybeSingle();
      existingProperty = data;
    }

    // Check for existing lead if property found
    let existingLead = null;
    if (existingProperty) {
      const { data } = await (sb.from("leads") as any)
        .select("id, status, assigned_to, next_action, created_at")
        .eq("property_id", existingProperty.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingLead = data;
    }

    // Look up from external providers
    const providerResults = await lookupProperty(
      { address, apn, county, state, zip },
      providers,
    );

    return NextResponse.json({
      ok: true,
      existingProperty,
      existingLead,
      configuredProviders: getConfiguredProviders(),
      providerResults: providerResults.results,
      providerErrors: providerResults.errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[properties/lookup] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
