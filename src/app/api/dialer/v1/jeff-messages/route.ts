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
import { listJeffInteractions } from "@/lib/jeff-interactions";

async function getAuthedUser(req: NextRequest) {
  const sb = createServerClient();
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  return user;
}

const ADAM_KEYWORDS = /\b(adam|manager|management|owner|boss)\b/i;

function buildRouteTarget(text: string, assignedTo: string | null): "logan" | "adam" {
  if (ADAM_KEYWORDS.test(text)) return "adam";
  if (assignedTo && assignedTo !== "0737e969-2908-4bd6-90bd-7a4380456811") return "adam";
  return "logan";
}

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerClient();

  const includeAll = req.nextUrl.searchParams.get("include") === "all";
  const interactions = await listJeffInteractions({ unresolvedOnly: false, limit: 50 });
  const inboundInteractions = interactions.filter((interaction) => interaction.direction === "inbound");
  const voiceSessionIds = inboundInteractions
    .map((interaction) => interaction.voice_session_id)
    .filter((value) => !value.startsWith("call-") && !value.startsWith("task-"));

  const voiceSessionMap = new Map<string, {
    transcript: string | null;
    extracted_facts: Record<string, unknown>[] | Record<string, unknown> | null;
    duration_seconds: number | null;
  }>();

  if (voiceSessionIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessions, error } = await (sb.from("voice_sessions") as any)
      .select("id, transcript, extracted_facts, duration_seconds")
      .in("id", voiceSessionIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const session of (sessions ?? []) as Array<{
      id: string;
      transcript: string | null;
      extracted_facts: Record<string, unknown>[] | Record<string, unknown> | null;
      duration_seconds: number | null;
    }>) {
      voiceSessionMap.set(session.id, {
        transcript: session.transcript ?? null,
        extracted_facts: session.extracted_facts ?? null,
        duration_seconds: session.duration_seconds ?? null,
      });
    }
  }

  const messages = inboundInteractions
    .map((interaction) => {
      const voice = voiceSessionMap.get(interaction.voice_session_id) ?? null;
      const factsArr = Array.isArray(voice?.extracted_facts) ? voice.extracted_facts : [];
      const motivation = (factsArr as Record<string, unknown>[]).find((f) => f.field === "seller_motivation");
      const urgency = (factsArr as Record<string, unknown>[]).find((f) => f.field === "urgency");
      const callerNameFact = (factsArr as Record<string, unknown>[]).find((f) => f.field === "caller_name");
      const text = [interaction.summary, voice?.transcript].filter(Boolean).join(" ");
      const acknowledged = interaction.status === "reviewed" || interaction.status === "resolved";

      return {
        id: interaction.id,
        callerPhone: interaction.caller_phone,
        summary: interaction.summary,
        durationSeconds: voice?.duration_seconds ?? null,
        callerType: interaction.metadata?.caller_type as string | null ?? null,
        createdAt: interaction.created_at,
        routeTo: buildRouteTarget(text, interaction.assigned_to),
        acknowledged,
        extracted: {
          motivation: motivation ? (motivation as Record<string, unknown>).value as string | null : null,
          urgency: urgency ? (urgency as Record<string, unknown>).value as string | null : null,
          callerName: interaction.caller_name ?? (callerNameFact ? (callerNameFact as Record<string, unknown>).value as string | null : null),
        },
      };
    })
    .filter((message) => includeAll || !message.acknowledged);

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
