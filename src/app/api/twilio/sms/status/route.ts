import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

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
  const messageSid = formData.get("MessageSid")?.toString()
    ?? formData.get("SmsSid")?.toString()
    ?? "";
  const status = formData.get("MessageStatus")?.toString()
    ?? formData.get("SmsStatus")?.toString()
    ?? "";

  if (!messageSid || !status) {
    return new NextResponse("OK", { status: 200 });
  }

  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("sms_messages") as any)
    .update({ twilio_status: status.toLowerCase() })
    .eq("twilio_sid", messageSid);

  if (error) {
    console.error("[SMS Status] Update failed:", error);
  }

  return new NextResponse("OK", { status: 200 });
}
