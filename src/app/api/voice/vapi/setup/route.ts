import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { isVapiConfigured, createOrUpdateAssistant, getVapiAssistantId } from "@/providers/voice/vapi-adapter";
import { getFeatureFlag } from "@/lib/control-plane";

export const runtime = "nodejs";

/**
 * GET /api/voice/vapi/setup
 *
 * Returns the current Vapi integration status:
 * - Is VAPI_API_KEY configured?
 * - Is the assistant created?
 * - Is the feature flag enabled?
 * - What's the webhook URL?
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flag = await getFeatureFlag("voice.ai.inbound");

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return NextResponse.json({
    ok: true,
    status: {
      vapiConfigured: isVapiConfigured(),
      assistantId: getVapiAssistantId(),
      featureFlag: flag ? { enabled: flag.enabled, mode: flag.mode } : null,
      webhookUrl: `${siteUrl}/api/voice/vapi/webhook`,
      forwardNumber: process.env.TWILIO_FORWARD_TO_CELL ? "configured" : "not set",
    },
    setup: {
      steps: [
        {
          step: 1,
          name: "Sign up for Vapi",
          done: isVapiConfigured(),
          instructions: "Go to vapi.ai, create an account, get your API key.",
        },
        {
          step: 2,
          name: "Set VAPI_API_KEY",
          done: isVapiConfigured(),
          instructions: "Add VAPI_API_KEY to your environment variables.",
        },
        {
          step: 3,
          name: "Create assistant",
          done: !!getVapiAssistantId(),
          instructions: "POST to this endpoint to create the Vapi assistant.",
        },
        {
          step: 4,
          name: "Connect phone number",
          done: false,
          instructions:
            "In Vapi dashboard, import your Twilio number or connect your Twilio account. Point the number to the assistant.",
        },
        {
          step: 5,
          name: "Enable feature flag",
          done: flag?.enabled ?? false,
          instructions: "Enable the voice.ai.inbound feature flag in the database.",
        },
      ],
    },
  });
}

/**
 * POST /api/voice/vapi/setup
 *
 * Creates or updates the Vapi assistant with Sentinel's configuration.
 * Returns the assistant ID to store as VAPI_ASSISTANT_ID.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isVapiConfigured()) {
    return NextResponse.json(
      { error: "VAPI_API_KEY not configured. Set the environment variable first." },
      { status: 400 },
    );
  }

  try {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const serverUrl = `${siteUrl}/api/voice/vapi/webhook`;

    const assistantId = await createOrUpdateAssistant(serverUrl);

    return NextResponse.json({
      ok: true,
      assistantId,
      message: `Assistant ${getVapiAssistantId() ? "updated" : "created"}. Set VAPI_ASSISTANT_ID=${assistantId} in your environment.`,
      nextStep: "Connect your Twilio phone number to this assistant in the Vapi dashboard.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vapi/setup] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
