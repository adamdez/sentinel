/**
 * GET /api/dialer/v1/jeff-messages
 *
 * Returns unacknowledged Jeff (Vapi AI receptionist) messages for the dialer.
 * Jeff's messages are inbound voice_sessions where the AI handled the call
 * and the operator hasn't acted on them yet.
 *
 * Query params:
 *   ?operator=email (optional, filters by routing — defaults to all)
 *
 * Identification: direction='inbound', status='completed', summary IS NOT NULL,
 * and NOT acknowledged (via extracted_facts JSONB).
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

async function getAuthedUser(req: NextRequest) {
  const sb = createServerClient();
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  return user;
}

const ADAM_KEYWORDS = /\b(adam|manager|management|owner|boss)\b/i;

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerClient();

  // Fetch completed inbound voice sessions with a summary (Jeff took a message)
  // that haven't been acknowledged yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions, error } = await (sb.from("voice_sessions") as any)
    .select("id, from_number, to_number, summary, extracted_facts, transcript, duration_seconds, caller_type, created_at, ended_at")
    .eq("direction", "inbound")
    .eq("status", "completed")
    .not("summary", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  interface VoiceSession {
    id: string;
    from_number: string | null;
    to_number: string | null;
    summary: string | null;
    extracted_facts: Record<string, unknown>[] | Record<string, unknown> | null;
    transcript: string | null;
    duration_seconds: number | null;
    caller_type: string | null;
    created_at: string;
    ended_at: string | null;
  }

  const includeAll = req.nextUrl.searchParams.get("include") === "all";

  const isAcknowledged = (s: VoiceSession): boolean => {
    const facts = s.extracted_facts;
    if (Array.isArray(facts)) {
      return facts.some((f) => (f as Record<string, unknown>).type === "acknowledged");
    }
    if (facts && typeof facts === "object" && (facts as Record<string, unknown>).acknowledged) {
      return true;
    }
    return false;
  };

  const filtered = includeAll
    ? (sessions as VoiceSession[] ?? [])
    : (sessions as VoiceSession[] ?? []).filter((s) => !isAcknowledged(s));

  // Determine routing for each message
  const messages = filtered.map((s) => {
    const text = [s.summary, s.transcript].filter(Boolean).join(" ");
    const routeToAdam = ADAM_KEYWORDS.test(text);

    // Extract structured data from extracted_facts
    const factsArr = Array.isArray(s.extracted_facts) ? s.extracted_facts : [];
    const motivation = (factsArr as Record<string, unknown>[]).find((f) => f.field === "seller_motivation");
    const urgency = (factsArr as Record<string, unknown>[]).find((f) => f.field === "urgency");
    const callerName = (factsArr as Record<string, unknown>[]).find((f) => f.field === "caller_name");

    return {
      id: s.id,
      callerPhone: s.from_number,
      summary: s.summary,
      durationSeconds: s.duration_seconds,
      callerType: s.caller_type,
      createdAt: s.created_at,
      routeTo: routeToAdam ? "adam" : "logan",
      acknowledged: isAcknowledged(s),
      extracted: {
        motivation: motivation ? (motivation as Record<string, unknown>).value : null,
        urgency: urgency ? (urgency as Record<string, unknown>).value : null,
        callerName: callerName ? (callerName as Record<string, unknown>).value : null,
      },
    };
  });

  // Optionally filter by operator
  const operatorParam = req.nextUrl.searchParams.get("operator");
  const final = operatorParam
    ? messages.filter((m) => {
        if (operatorParam.includes("adam")) return m.routeTo === "adam";
        return m.routeTo === "logan";
      })
    : messages;

  return NextResponse.json({ messages: final, total: final.length });
}
