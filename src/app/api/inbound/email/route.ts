import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getOrCreateProfile } from "@/lib/supabase";
import { fetchInboxDetails, fetchMessageDetail, refreshAccessToken } from "@/lib/gmail";
import { normalizeInboundCandidate } from "@/lib/inbound-intake";
import { processInboundCandidate } from "@/lib/inbound-intake-server";

async function getEmailAccessToken(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return { sb, user: null, accessToken: null as string | null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data: profile, error } = await (sb.from("user_profiles") as any)
    .select("preferences")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    profile = await getOrCreateProfile(user.id, { email: user.email });
  }

  const prefs = profile?.preferences as Record<string, unknown> | null;
  const gmail = prefs?.gmail as { connected?: boolean; encrypted_refresh_token?: string } | undefined;
  if (!gmail?.connected || !gmail.encrypted_refresh_token) {
    return { sb, user, accessToken: null as string | null };
  }

  const accessToken = await refreshAccessToken(gmail.encrypted_refresh_token);
  return { sb, user, accessToken };
}

export async function GET(req: NextRequest) {
  try {
    const { user, accessToken } = await getEmailAccessToken(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!accessToken) return NextResponse.json({ error: "Gmail not connected" }, { status: 403 });

    const messages = await fetchInboxDetails(accessToken, 12);
    const candidates = messages.map((message) => ({
      messageId: message.id,
      threadId: message.threadId,
      from: message.from,
      subject: message.subject,
      snippet: message.snippet,
      date: message.date,
      candidate: normalizeInboundCandidate({
        sourceChannel: "email_intake",
        sourceVendor: "gmail",
        sourceCampaign: message.subject,
        intakeMethod: "gmail_inbox",
        rawSourceRef: message.threadId || message.id,
        notes: message.snippet,
        rawText: `${message.subject}\n${message.from}\n${message.bodyText}`,
        rawPayload: {
          message_id: message.id,
          thread_id: message.threadId,
          from: message.from,
          to: message.to,
          subject: message.subject,
          snippet: message.snippet,
          body_text: message.bodyText,
        },
        receivedAt: message.date ? new Date(message.date).toISOString() : null,
      }),
    }));

    return NextResponse.json({ success: true, candidates });
  } catch (error) {
    console.error("[Inbound Email] Preview failed:", error);
    return NextResponse.json({ error: "Failed to load intake inbox" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sb, user, accessToken } = await getEmailAccessToken(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!accessToken) return NextResponse.json({ error: "Gmail not connected" }, { status: 403 });

    const body = await req.json();
    if (!body?.message_id) {
      return NextResponse.json({ error: "message_id is required" }, { status: 400 });
    }

    const message = await fetchMessageDetail(accessToken, String(body.message_id));
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const candidate = normalizeInboundCandidate({
      sourceChannel: "email_intake",
      sourceVendor: "gmail",
      sourceCampaign: message.subject,
      intakeMethod: "gmail_inbox",
      rawSourceRef: message.threadId || message.id,
      notes: message.snippet,
      rawText: `${message.subject}\n${message.from}\n${message.bodyText}`,
      rawPayload: {
        message_id: message.id,
        thread_id: message.threadId,
        from: message.from,
        to: message.to,
        subject: message.subject,
        snippet: message.snippet,
        body_text: message.bodyText,
        body_html: message.bodyHtml,
      },
      receivedAt: message.date ? new Date(message.date).toISOString() : null,
    });

    const result = await processInboundCandidate({
      req,
      sb,
      authHeader: req.headers.get("authorization"),
      actorId: user.id,
      candidate,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Inbound Email] Commit failed:", error);
    return NextResponse.json(
      { error: "Unable to convert this email into Sentinel intake right now." },
      { status: 500 },
    );
  }
}
