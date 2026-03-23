import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

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

  // Try to find matching lead
  const digits = decoded.replace(/\D/g, "").slice(-10);
  let leadInfo: { id: string; name: string; score: number | null; tags: string[]; status: string } | null = null;

  if (digits.length >= 7) {
    const { data: prop } = await sb
      .from("properties")
      .select("id, owner_name, owner_phone")
      .ilike("owner_phone", `%${digits}`)
      .limit(1)
      .maybeSingle();

    if (prop) {
      const { data: lead } = await sb
        .from("leads")
        .select("id, priority, tags, status")
        .eq("property_id", prop.id as string)
        .limit(1)
        .maybeSingle();

      if (lead) {
        leadInfo = {
          id: lead.id as string,
          name: prop.owner_name as string,
          score: lead.priority as number | null,
          tags: (lead.tags as string[]) ?? [],
          status: lead.status as string,
        };
      }
    }
  }

  return NextResponse.json({
    messages: messages ?? [],
    leadInfo,
    markedRead: unreadIds.length,
  });
}
