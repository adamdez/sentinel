import { NextRequest, NextResponse } from "next/server";
import { createDialerClient } from "@/lib/dialer/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/sms/status
 *
 * Twilio status callback for outbound SMS delivery tracking.
 * Updates sms_messages.twilio_status based on MessageStatus.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const messageSid = formData.get("MessageSid")?.toString() ?? "";
  const status = formData.get("MessageStatus")?.toString() ?? "";

  if (!messageSid || !status) {
    return new NextResponse("OK", { status: 200 });
  }

  const sb = createDialerClient();

  const { error } = await sb
    .from("sms_messages")
    .update({ twilio_status: status })
    .eq("twilio_sid", messageSid);

  if (error) {
    console.error("[SMS Status] Update failed:", error);
  }

  return new NextResponse("OK", { status: 200 });
}
