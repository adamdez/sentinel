import { NextRequest, NextResponse } from "next/server";
import { POST as runProspectDeepCrawl } from "@/app/api/prospects/deep-crawl/route";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/leads/[id]/deep-crawl
 *
 * Keeps the lead-scoped endpoint stable for the dossier tab, but executes the
 * richer prospect deep-crawl pipeline under the hood.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select("id, property_id")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead?.property_id) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  let existingBody: Record<string, unknown> = {};
  try {
    existingBody = await req.json();
  } catch {
    existingBody = {};
  }

  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");

  const proxyReq = new NextRequest(new URL("/api/prospects/deep-crawl", req.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...existingBody,
      property_id: lead.property_id,
      lead_id: leadId,
    }),
  });

  return runProspectDeepCrawl(proxyReq);
}
