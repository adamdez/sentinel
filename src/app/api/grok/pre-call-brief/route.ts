import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { completeGrokChat } from "@/lib/grok-client";
import { buildCallCoPilotPrompt, type LeadContext } from "@/lib/agent/grok-agents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Grok API key not configured" }, { status: 503 });
  }

  let body: { leadId: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.leadId) {
    return Response.json({ error: "leadId required" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = (name: string) => sb.from(name) as any;

    const { data: lead } = await tbl("leads")
      .select("*, properties(owner_name, address, estimated_value, equity_percent, ownership_years, property_type, county, owner_flags)")
      .eq("id", body.leadId)
      .single();

    if (!lead) {
      return Response.json({ error: "Lead not found" }, { status: 404 });
    }

    const { data: distressEvents } = await tbl("distress_events")
      .select("event_type")
      .eq("property_id", lead.property_id)
      .limit(10);

    const { data: callLogs } = await tbl("calls_log")
      .select("started_at, disposition, ai_note_summary")
      .eq("lead_id", body.leadId)
      .order("started_at", { ascending: false })
      .limit(5);

    const prop = lead.properties || {};
    const ownerFlags = prop.owner_flags ?? {};
    const prRaw = ownerFlags.pr_raw ?? {};
    const leadCtx: LeadContext = {
      ownerName: prop.owner_name ?? "Unknown Owner",
      address: prop.address ?? "",
      score: lead.priority ?? 0,
      distressSignals: (distressEvents ?? []).map((e: { event_type: string }) => e.event_type),
      callHistory: (callLogs ?? []).map((c: { started_at: string; disposition: string; ai_note_summary: string | null }) => ({
        date: new Date(c.started_at).toLocaleDateString(),
        disposition: c.disposition ?? "unknown",
        notes: c.ai_note_summary ?? "",
      })),
      aiNotes: (callLogs ?? [])
        .filter((c: { ai_note_summary: string | null }) => c.ai_note_summary)
        .map((c: { ai_note_summary: string }) => c.ai_note_summary),
      equityPercent: prop.equity_percent ?? undefined,
      ownershipYears: prop.ownership_years ?? undefined,
      estimatedValue: prop.estimated_value ?? undefined,
      tags: lead.tags ?? [],
      ownerAge: prRaw.OwnerAge ? Number(prRaw.OwnerAge) : null,
      isAbsentee: !!lead.is_absentee,
      isFreeClear: !!lead.is_free_clear,
      isVacant: !!lead.is_vacant,
      propertyType: prop.property_type ?? undefined,
      county: prop.county ?? undefined,
      lastTransferType: prRaw.LastTransferType ?? undefined,
      delinquentAmount: lead.delinquent_amount ?? undefined,
      foreclosureStage: lead.foreclosure_stage ?? undefined,
    };

    const agentPrompt = buildCallCoPilotPrompt(leadCtx);

    const systemPrompt = [
      "You are the Dominion Sentinel Call Co-Pilot. Generate a comprehensive pre-call playbook.",
      agentPrompt,
      "",
      "## OUTPUT FORMAT",
      "Return ONLY a JSON object (no markdown, no explanation):",
      '{',
      '  "bullets":["bullet 1","bullet 2","bullet 3"],',
      '  "suggestedOpener":"Opening line here",',
      '  "talkingPoints":["point 1","point 2"],',
      '  "objections":[{"objection":"They say X","rebuttal":"You respond Y"}],',
      '  "negotiationAnchor":"Offer range: $X - $Y based on ...",',
      '  "watchOuts":["compliance note","emotional trigger to avoid"]',
      '}',
      "Keep bullets under 80 chars. Opening line should be natural and empathetic.",
      "talkingPoints: 2-3 conversation starters tied to their distress signals.",
      "objections: 2-3 likely pushbacks with one-line rebuttals.",
      "negotiationAnchor: a single sentence with the MAO range if data exists.",
      "watchOuts: 1-2 compliance/emotional things to avoid.",
    ].join("\n");

    const raw = await completeGrokChat({
      apiKey,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate a pre-call brief for ${leadCtx.ownerName} at ${leadCtx.address}` },
      ],
    });

    let brief;
    try {
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      brief = {
        bullets: parsed.bullets ?? [],
        suggestedOpener: parsed.suggestedOpener ?? "",
        talkingPoints: parsed.talkingPoints ?? [],
        objections: (parsed.objections ?? []).map((o: { objection?: string; rebuttal?: string }) => ({
          objection: o.objection ?? "",
          rebuttal: o.rebuttal ?? "",
        })),
        negotiationAnchor: parsed.negotiationAnchor ?? null,
        watchOuts: parsed.watchOuts ?? [],
      };
    } catch {
      brief = {
        bullets: [raw.slice(0, 80)],
        suggestedOpener: "Hi, this is calling from Dominion Homes — do you have a moment to chat?",
        talkingPoints: [],
        objections: [],
        negotiationAnchor: null,
        watchOuts: [],
      };
    }

    return Response.json(brief);
  } catch (err) {
    console.error("[Grok Pre-Call Brief Error]", err);
    return Response.json(
      { error: "Failed to generate brief" },
      { status: 502 },
    );
  }
}
