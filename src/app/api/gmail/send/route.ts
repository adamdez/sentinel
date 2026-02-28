/**
 * POST /api/gmail/send
 *
 * Sends an email via Gmail API with optional PDF attachments.
 * Used for contracts, offers, follow-ups from any lead context.
 *
 * Charter v3.0 §4: Service role client. Compliance sacred.
 * Charter v3.0 §10: Audit trail for outbound communications.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { refreshAccessToken, sendEmail, type EmailAttachment } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, to, subject, html_body, attachments, lead_id } = body as {
      user_id: string;
      to: string;
      subject: string;
      html_body: string;
      attachments?: EmailAttachment[];
      lead_id?: string;
    };

    if (!user_id || !to || !subject || !html_body) {
      return NextResponse.json(
        { error: "user_id, to, subject, and html_body are required" },
        { status: 400 }
      );
    }

    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileErr } = await (sb.from("user_profiles") as any)
      .select("preferences")
      .eq("id", user_id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const prefs = profile.preferences as Record<string, unknown>;
    const gmail = prefs?.gmail as { connected?: boolean; email?: string; encrypted_refresh_token?: string } | undefined;

    if (!gmail?.connected || !gmail.encrypted_refresh_token) {
      return NextResponse.json(
        { error: "Gmail not connected", detail: "Connect Gmail from the Gmail page first" },
        { status: 403 }
      );
    }

    const accessToken = await refreshAccessToken(gmail.encrypted_refresh_token);

    const result = await sendEmail(accessToken, {
      from: gmail.email || "me",
      to,
      subject,
      htmlBody: html_body,
      attachments,
    });

    // Append-only audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any)
      .insert({
        user_id,
        action: "EMAIL_SENT",
        entity_type: lead_id ? "lead" : "email",
        entity_id: lead_id || result.id,
        details: {
          to,
          subject,
          gmail_message_id: result.id,
          gmail_thread_id: result.threadId,
          has_attachments: (attachments?.length ?? 0) > 0,
        },
      })
      .then(({ error: auditErr }: { error: unknown }) => {
        if (auditErr) console.error("[API/gmail/send] Audit log failed (non-fatal):", auditErr);
      });

    console.log(`[API/gmail/send] Email sent to ${to} (message: ${result.id})`);
    return NextResponse.json({ success: true, message_id: result.id, thread_id: result.threadId });
  } catch (err) {
    console.error("[API/gmail/send] Error:", err);
    return NextResponse.json(
      { error: "Send failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
