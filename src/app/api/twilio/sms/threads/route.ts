import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { backfillSmsLeadForPhone, resolveSmsLead } from "@/lib/sms/lead-resolution";

export const dynamic = "force-dynamic";

/**
 * GET /api/twilio/sms/threads
 *
 * Returns message threads grouped by phone number, newest first.
 * Each thread includes the last message, unread count, and matched lead info.
 */
export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createDialerClient();

  // Get latest message per phone number using a raw-ish approach:
  // Fetch recent messages ordered by created_at DESC, then deduplicate client-side.
  // This avoids DISTINCT ON which isn't available through PostgREST.
  const { data: messages, error } = await sb
    .from("sms_messages")
    .select("id, phone, direction, body, lead_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[SMS Threads] Query failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Group by phone → take the latest message per phone
  const threadMap = new Map<string, {
    phone: string;
    leadId: string | null;
    lastMessage: string;
    lastMessageAt: string;
    direction: string;
    unreadCount: number;
  }>();

  for (const msg of (messages ?? [])) {
    const phone = msg.phone as string;
    const existing = threadMap.get(phone);

    if (!existing) {
      threadMap.set(phone, {
        phone,
        leadId: msg.lead_id as string | null,
        lastMessage: (msg.body as string) ?? "",
        lastMessageAt: msg.created_at as string,
        direction: msg.direction as string,
        unreadCount: (msg.direction === "inbound" && !msg.read_at) ? 1 : 0,
      });
    } else {
      if (msg.direction === "inbound" && !msg.read_at) {
        existing.unreadCount++;
      }
      if (msg.lead_id && !existing.leadId) {
        existing.leadId = msg.lead_id as string;
      }
    }
  }

  const threads = Array.from(threadMap.values());
  const phoneLevelNames: Record<string, string> = {};

  // Enrich with lead names
  const leadIds = [...new Set(threads.map((t) => t.leadId).filter(Boolean))] as string[];
  let leadNames: Record<string, string> = {};

  if (leadIds.length > 0) {
    const { data: leads } = await sb
      .from("leads")
      .select("id, property_id")
      .in("id", leadIds);

    if (leads?.length) {
      const propIds = [...new Set(leads.map((l: { property_id: string }) => l.property_id).filter(Boolean))];
      if (propIds.length > 0) {
        const { data: props } = await sb
          .from("properties")
          .select("id, owner_name")
          .in("id", propIds);

        const propMap = new Map((props ?? []).map((p: { id: string; owner_name: string }) => [p.id, p.owner_name]));
        for (const lead of leads) {
          const name = propMap.get(lead.property_id as string);
          if (name) leadNames[lead.id as string] = name as string;
        }
      }
    }
  }

  const unresolvedThreads = threads.filter((t) => !t.leadId || !leadNames[t.leadId]);
  if (unresolvedThreads.length > 0) {
    await Promise.all(
      unresolvedThreads.map(async (thread) => {
        const resolution = await resolveSmsLead(sb, thread.phone);
        if (resolution.leadId) {
          thread.leadId = resolution.leadId;
          if (resolution.ownerName) {
            leadNames[resolution.leadId] = resolution.ownerName;
          }
          await backfillSmsLeadForPhone(sb, thread.phone, resolution.leadId, resolution.assignedTo);
          return;
        }

        if (resolution.ownerName) {
          phoneLevelNames[thread.phone] = resolution.ownerName;
        }
      }),
    );
  }

  const enrichedThreads = threads.map((t) => ({
    ...t,
    leadName: (t.leadId ? leadNames[t.leadId] : null) ?? phoneLevelNames[t.phone] ?? null,
  }));

  // Sort: unread first, then by lastMessageAt DESC
  enrichedThreads.sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
    if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });

  const totalUnread = enrichedThreads.reduce((sum, t) => sum + t.unreadCount, 0);

  return NextResponse.json({ threads: enrichedThreads, totalUnread });
}
