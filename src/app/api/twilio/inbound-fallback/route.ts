import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/inbound-fallback
 *
 * Twilio Voice Fallback URL — defense in depth.
 * If the primary /api/twilio/inbound handler fails (504, crash, etc.),
 * Twilio invokes this endpoint instead.
 *
 * Returns hardcoded browser-ring TwiML with ZERO database calls.
 * The call ALWAYS rings in the browser — never forwards to a cell phone.
 */
export async function POST(req: NextRequest) {
  const loganIdentity = process.env.LOGAN_BROWSER_IDENTITY ?? "logan@dominionhomedeals.com";
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  // Parse caller info for callerId passthrough (best effort)
  let fromNumber = "";
  try {
    const formData = await req.formData();
    fromNumber = formData.get("From")?.toString() ?? "";
  } catch {
    // If form parsing fails, use Twilio number as callerId
  }

  console.warn("[inbound-fallback] Primary handler failed — serving fallback TwiML for", fromNumber || "unknown");

  const twiml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `  <Dial callerId="${fromNumber || twilioNumber}" timeout="20" action="${siteUrl}/api/twilio/inbound?type=chain_step&amp;step=logan${fromNumber ? `&amp;originalFrom=${encodeURIComponent(fromNumber)}` : ""}" method="POST">`,
    `    <Client>${loganIdentity}</Client>`,
    "  </Dial>",
    "</Response>",
  ].join("\n");

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
