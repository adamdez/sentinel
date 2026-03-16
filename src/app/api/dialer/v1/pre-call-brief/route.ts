import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { buildCallCoPilotPrompt, styleVersionTag, type LeadContext } from "@/lib/agent/dialer-ai-prompts";
import { completeDialerAi, type DialerAiMessage } from "@/lib/dialer/openai-lane-client";

/**
 * POST /api/dialer/v1/pre-call-brief
 *
 * Canonical provider-neutral endpoint for dialer pre-call brief generation.
 */

// Version this string when the system prompt framing changes.
// Style version is embedded via styleVersionTag() so outputs are correlated
// to the exact style module version in call quality snapshot reviews.
const PRE_CALL_BRIEF_VERSION = `1.3.0${styleVersionTag()}`;

type BriefCallRow = {
  started_at: string;
  disposition: string | null;
  ai_summary: string | null;
  notes: string | null;
};

function inferIntent(text: string | null | undefined): "callback" | "offer" | "documents" | "wait" | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/(call back|callback|ring back|follow up)/.test(lower)) return "callback";
  if (/(offer|price|number|cash offer)/.test(lower)) return "offer";
  if (/(send|email|text|docs|paperwork)/.test(lower)) return "documents";
  if (/(wait|hold|later|not ready|after)/.test(lower)) return "wait";
  return null;
}

function tempFromText(text: string | null | undefined): "hot" | "warm" | "cold" | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/\bhot\b/.test(lower)) return "hot";
  if (/\bwarm\b/.test(lower)) return "warm";
  if (/\bcold\b/.test(lower) || /\bdead\b/.test(lower)) return "cold";
  return null;
}

function deriveRiskSeed(args: {
  lead: Record<string, unknown>;
  callLogs: BriefCallRow[];
  latestStructured: {
    summary_line?: string | null;
    promises_made?: string | null;
    objection?: string | null;
    next_task_suggestion?: string | null;
    deal_temperature?: string | null;
  } | null;
}): string[] {
  const out: string[] = [];
  const { lead, callLogs, latestStructured } = args;

  if (lead.decision_maker_confirmed !== true) {
    out.push("Authority still unclear — manual verification recommended before assuming decision control.");
  }

  const primaryPhone = typeof (lead.properties as Record<string, unknown> | undefined)?.owner_phone === "string"
    ? ((lead.properties as Record<string, unknown>).owner_phone as string)
    : null;
  const nextCallAt = typeof lead.next_call_scheduled_at === "string" ? lead.next_call_scheduled_at : null;
  if (!primaryPhone && !nextCallAt) {
    out.push("Callback confidence is weak — no clear phone/callback plan on record.");
  } else if (!nextCallAt) {
    out.push("No callback time is locked in — do not assume easy re-contact.");
  }

  const promiseIntent = inferIntent(latestStructured?.promises_made);
  const nextIntent = inferIntent(latestStructured?.next_task_suggestion);
  if (promiseIntent && nextIntent && promiseIntent !== nextIntent) {
    out.push("Latest promise may not match current next step — verify commitments before advancing.");
  }

  const currentTemp = latestStructured?.deal_temperature?.toLowerCase();
  const olderTemp = tempFromText(callLogs[1]?.ai_summary ?? callLogs[1]?.notes ?? null);
  if (
    olderTemp &&
    currentTemp &&
    ((olderTemp === "hot" && (currentTemp === "cold" || currentTemp === "dead")) ||
      (olderTemp === "cold" && (currentTemp === "hot" || currentTemp === "warm")))
  ) {
    out.push("Latest seller takeaway may conflict with older notes — reconfirm before assuming momentum.");
  }

  const timeline = typeof lead.seller_timeline === "string" ? lead.seller_timeline : null;
  const memoryText = `${latestStructured?.summary_line ?? ""} ${latestStructured?.next_task_suggestion ?? ""}`.toLowerCase();
  if (timeline === "immediate" && /(later|after|not ready|few weeks|next month)/.test(memoryText)) {
    out.push("Timeline inconsistency detected — do not assume urgency until reconfirmed.");
  }

  if (out.length === 0 && (!latestStructured || callLogs.length < 2)) {
    out.push("Evidence is thin — manual verification recommended before over-chasing this lead.");
  }

  return out.slice(0, 4);
}

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

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OpenAI API key not configured" }, { status: 503 });
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
      .select("started_at, disposition, ai_summary, notes")
      .eq("lead_id", body.leadId)
      .order("started_at", { ascending: false })
      .limit(5);

    const { data: latestStructured } = await tbl("post_call_structures")
      .select("summary_line, promises_made, objection, next_task_suggestion, deal_temperature")
      .eq("lead_id", body.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prop = lead.properties || {};
    const ownerFlags = prop.owner_flags ?? {};
    const prRaw = ownerFlags.pr_raw ?? {};
    const recentCalls = (callLogs ?? []) as BriefCallRow[];
    const leadCtx: LeadContext = {
      ownerName: prop.owner_name ?? "Unknown Owner",
      address: prop.address ?? "",
      score: lead.priority ?? 0,
      distressSignals: (distressEvents ?? []).map((e: { event_type: string }) => e.event_type),
      callHistory: recentCalls.map((c) => ({
        date: new Date(c.started_at).toLocaleDateString(),
        disposition: c.disposition ?? "unknown",
        notes: c.notes ?? c.ai_summary ?? "",
      })),
      aiNotes: recentCalls
        .filter((c) => c.ai_summary)
        .map((c) => c.ai_summary as string),
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
      latestStructuredMemory: latestStructured
        ? {
            summary_line: latestStructured.summary_line ?? null,
            promises_made: latestStructured.promises_made ?? null,
            objection: latestStructured.objection ?? null,
            next_task_suggestion: latestStructured.next_task_suggestion ?? null,
            deal_temperature: latestStructured.deal_temperature ?? null,
          }
        : null,
    };
    const riskSeed = deriveRiskSeed({
      lead: lead as Record<string, unknown>,
      callLogs: recentCalls,
      latestStructured: leadCtx.latestStructuredMemory ?? null,
    });

    const agentPrompt = buildCallCoPilotPrompt(leadCtx);

    const systemPrompt = [
      `You are the Dominion Sentinel Call Co-Pilot (OpenAI lane). Today is ${new Date().toISOString().split("T")[0]}. Use this date for all temporal reasoning — recency, days since filing, urgency calculations.`,
      "Generate a comprehensive pre-call playbook.",
      agentPrompt,
      "",
      "## OUTPUT FORMAT",
      "Return ONLY a JSON object (no markdown, no explanation):",
      "{",
      '  "bullets":["bullet 1","bullet 2","bullet 3"],',
      '  "suggestedOpener":"Opening line here",',
      '  "talkingPoints":["point 1","point 2"],',
      '  "objections":[{"objection":"They say X","rebuttal":"You respond Y"}],',
      '  "negotiationAnchor":"Offer range: $X - $Y based on ...",',
      '  "watchOuts":["compliance note","emotional trigger to avoid"],',
      '  "riskFlags":["risk or contradiction to verify"]',
      "}",
      "Keep bullets under 80 chars. Opening line should be natural and empathetic.",
      "talkingPoints: 2-3 conversation starters tied to their distress signals.",
      "objections: 2-3 likely pushbacks with one-line rebuttals.",
      "negotiationAnchor: a single sentence with the MAO range if data exists.",
      "watchOuts: 1-2 compliance/emotional things to avoid.",
      "riskFlags: 0-4 practical caution signals where data may not line up; keep plainspoken and non-creepy.",
      "If evidence is thin, say that plainly (e.g., 'Evidence is thin — manual verification recommended').",
      "",
      "## RISK SEED (from observed data)",
      ...(riskSeed.length > 0 ? riskSeed.map((r) => `- ${r}`) : ["- No clear contradiction seed from available data."]),
    ].join("\n");

    const messages: DialerAiMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate a pre-call brief for ${leadCtx.ownerName} at ${leadCtx.address}` },
    ];

    const ai = await completeDialerAi({
      lane: "pre_call_brief",
      temperature: 0,
      messages,
    });
    const raw = ai.text;

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
        riskFlags: Array.isArray(parsed.riskFlags)
          ? parsed.riskFlags.filter((r: unknown) => typeof r === "string").slice(0, 4)
          : [],
        _promptVersion: PRE_CALL_BRIEF_VERSION,
        _provider: ai.provider,
        _model: ai.model,
      };
    } catch {
      brief = {
        bullets: [raw.slice(0, 80)],
        suggestedOpener: "Hi, this is Logan with Dominion Home Deals in Spokane — is now still a good time for a quick chat?",
        talkingPoints: [],
        objections: [],
        negotiationAnchor: null,
        watchOuts: [],
        riskFlags: riskSeed.slice(0, 2),
        _promptVersion: PRE_CALL_BRIEF_VERSION,
        _provider: ai.provider,
        _model: ai.model,
      };
    }

    return Response.json(brief);
  } catch (err) {
    console.error("[Pre-Call Brief Error]", err);
    return Response.json(
      { error: "Failed to generate brief" },
      { status: 502 },
    );
  }
}

