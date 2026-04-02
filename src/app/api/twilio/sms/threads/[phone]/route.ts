import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { backfillSmsLeadForPhone, resolveSmsLead } from "@/lib/sms/lead-resolution";

export const dynamic = "force-dynamic";

/**
 * GET /api/twilio/sms/threads/[phone]
 *
 * Returns all messages for a phone number in chat order (oldest first).
 * Marks all inbound messages as read.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phone } = await params;
  const decoded = decodeURIComponent(phone);
  const sb = createDialerClient();

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);

  // Fetch messages for this phone
  const { data: messages, error } = await sb
    .from("sms_messages")
    .select("id, direction, body, created_at, read_at, twilio_status, twilio_sid, user_id")
    .eq("phone", decoded)
    .order("created_at", { ascending: true })
    .limit(Math.min(limit, 500));

  if (error) {
    console.error("[SMS Thread Detail] Query failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Mark unread inbound messages as read
  const unreadIds = (messages ?? [])
    .filter((m) => m.direction === "inbound" && !m.read_at)
    .map((m) => m.id as string);

  if (unreadIds.length > 0) {
    await sb
      .from("sms_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  }

  let leadInfo: { id: string; name: string; score: number | null; tags: string[]; status: string } | null = null;
  const resolution = await resolveSmsLead(sb, decoded);

  if (resolution.leadId) {
    leadInfo = {
      id: resolution.leadId,
      name: resolution.ownerName ?? decoded,
      score: resolution.priority,
      tags: resolution.tags,
      status: resolution.status ?? "unknown",
    };
    await backfillSmsLeadForPhone(sb, decoded, resolution.leadId, resolution.assignedTo);
  }

  return NextResponse.json({
    messages: messages ?? [],
    leadInfo,
    markedRead: unreadIds.length,
  });
}
