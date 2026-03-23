/**
 * GET /api/dialer/v1/sessions/unlinked
 *
 * Returns all ended sessions without a lead_id, enriched with:
 *   - session metadata (id, phone, started_at, duration, direction)
 *   - AI summary (from ai_summary column or first seller chunks)
 *   - Discovery map state (from live_coach_state JSONB)
 *   - Seller transcript preview (first 500 chars of seller turns)
 *
 * Ordered by started_at DESC, limit 50.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

interface UnlinkedSession {
  id: string;
  phone_dialed: string | null;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  direction: string | null;
  ai_summary: string | null;
  live_coach_state: Record<string, unknown> | null;
}

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = req.nextUrl.searchParams.get("phone");
  const sb = createDialerClient();

  // Fetch unlinked ended sessions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("call_sessions") as any)
    .select("id, phone_dialed, started_at, ended_at, duration_sec, direction, ai_summary, live_coach_state")
    .is("lead_id", null)
    .eq("status", "ended")
    .order("started_at", { ascending: false })
    .limit(50);

  if (search) {
    const digits = search.replace(/\D/g, "").slice(-10);
    if (digits.length >= 7) {
      query = query.ilike("phone_dialed", `%${digits}`);
    }
  }

  const { data: sessions, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const typed = (sessions ?? []) as UnlinkedSession[];

  // For each session, fetch a seller transcript preview
  const results = await Promise.all(
    typed.map(async (s) => {
      let sellerPreview: string | null = null;

      if (!s.ai_summary) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: notes } = await (sb.from("session_notes") as any)
            .select("content")
            .eq("session_id", s.id)
            .eq("speaker", "seller")
            .order("sequence_num", { ascending: true })
            .limit(10);

          if (notes?.length) {
            sellerPreview = (notes as Array<{ content: string | null }>)
              .filter((n) => n.content)
              .map((n) => n.content!.trim())
              .join(" ")
              .slice(0, 500) || null;
          }
        } catch { /* non-fatal */ }
      }

      // Extract discovery map from live_coach_state
      let discoverySlots: Array<{ key: string; value: string | null; status: string }> = [];
      const state = s.live_coach_state as Record<string, unknown> | null;
      if (state?.discoveryMap && typeof state.discoveryMap === "object") {
        const map = state.discoveryMap as Record<string, { value?: string | null; status?: string }>;
        discoverySlots = Object.entries(map)
          .filter(([, slot]) => slot?.status === "confirmed" || slot?.status === "partial")
          .map(([key, slot]) => ({
            key,
            value: slot.value ?? null,
            status: slot.status ?? "missing",
          }));
      }

      return {
        id: s.id,
        phoneDialed: s.phone_dialed,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        durationSec: s.duration_sec,
        direction: s.direction,
        aiSummary: s.ai_summary ?? sellerPreview,
        discoverySlots,
      };
    }),
  );

  return NextResponse.json({ sessions: results, total: results.length });
}
