import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { completeGrokChat, type GrokMessage } from "@/lib/grok-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CALL_SUMMARY_SYSTEM_PROMPT = `You are a real estate wholesaling assistant for Dominion Homes. Summarize this cold call in 3-5 concise bullet points covering:
- Key objections raised by the homeowner
- Motivation level (high/medium/low/none) and reasons
- Property details or conditions mentioned
- Next steps agreed upon (callback, appointment, send offer, etc.)
- Overall deal temperature (hot/warm/cold/dead)

Be direct and action-oriented. Use short phrases, not full sentences. If the call was a voicemail or no answer, state that briefly.`;

/**
 * POST /api/dialer/summarize
 *
 * Takes call notes (agent-written or transcription) and generates
 * a concise AI summary via Grok. Saves to calls_log and lead notes.
 *
 * Body: { callLogId, notes?, transcription?, leadId? }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROK_API_KEY not configured" }, { status: 503 });
  }

  let body: {
    callLogId: string;
    notes?: string;
    transcription?: string;
    leadId?: string;
    disposition?: string;
    duration?: number;
    ownerName?: string;
    address?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.callLogId) {
    return NextResponse.json({ error: "callLogId required" }, { status: 400 });
  }

  const textToSummarize = body.transcription || body.notes;
  if (!textToSummarize || textToSummarize.trim().length < 5) {
    return NextResponse.json({ error: "No content to summarize" }, { status: 400 });
  }

  const context = [
    body.ownerName && `Owner: ${body.ownerName}`,
    body.address && `Property: ${body.address}`,
    body.disposition && `Disposition: ${body.disposition}`,
    body.duration != null && `Call duration: ${body.duration}s`,
  ].filter(Boolean).join(" | ");

  const messages: GrokMessage[] = [
    { role: "system", content: CALL_SUMMARY_SYSTEM_PROMPT },
    { role: "user", content: `${context ? `[${context}]\n\n` : ""}${textToSummarize}` },
  ];

  let summary: string;
  try {
    summary = await completeGrokChat({ messages, temperature: 0, apiKey });
  } catch (err) {
    console.error("[Summarize] Grok error:", err);
    return NextResponse.json({ error: "AI summarization failed" }, { status: 502 });
  }

  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("calls_log") as any)
    .update({
      ai_summary: summary,
      summary_timestamp: now,
      ...(body.transcription ? { transcription: body.transcription } : {}),
    })
    .eq("id", body.callLogId);

  if (body.leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("notes")
      .eq("id", body.leadId)
      .single();

    const existingNotes = (lead?.notes as string) ?? "";
    const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const summaryBlock = `\n\n--- AI Summary (${dateLabel}) ---\n${summary}`;
    const updatedNotes = existingNotes + summaryBlock;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("leads") as any)
      .update({ notes: updatedNotes, updated_at: now })
      .eq("id", body.leadId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "dialer.ai_summary_generated",
    entity_type: "call",
    entity_id: body.callLogId,
    details: { lead_id: body.leadId, summary_length: summary.length },
  });

  return NextResponse.json({ success: true, summary });
}
