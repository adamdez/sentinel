import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getOrCreateProfile } from "@/lib/supabase";
import {
  refreshAccessToken,
  sendEmail,
  type EmailAttachment,
} from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SendBody {
  user_id: string;
  to: string;
  subject: string;
  html_body: string;
  attachments?: EmailAttachment[];
  lead_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<SendBody>;
    const { to, subject, html_body, attachments, lead_id } = body;
    const user_id = user.id;

    if (!to || !subject || !html_body) {
      return NextResponse.json(
        { error: "to, subject, and html_body are required" },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data: profile, error: profileErr } = await (
      sb.from("user_profiles") as any
    )
      .select("preferences")
      .eq("id", user_id)
      .single();

    if (profileErr || !profile) {
      const created = await getOrCreateProfile(user_id, { email: user.email });
      if (!created) {
        return NextResponse.json(
          { error: "User profile not found" },
          { status: 404 },
        );
      }
      profile = created;
    }

    const prefs = profile.preferences as Record<string, unknown> | null;
    const gmail = prefs?.gmail as
      | { connected?: boolean; email?: string; encrypted_refresh_token?: string }
      | undefined;

    if (!gmail?.connected || !gmail.encrypted_refresh_token) {
      return NextResponse.json(
        {
          error: "Gmail not connected",
          detail: "Connect Gmail from the Gmail page first",
        },
        { status: 403 },
      );
    }

    const accessToken = await refreshAccessToken(
      gmail.encrypted_refresh_token,
    );

    const result = await sendEmail(accessToken, {
      from: gmail.email || "me",
      to,
      subject,
      htmlBody: html_body,
      attachments,
    });

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
        if (auditErr) {
          console.error("[gmail/send] Audit log failed:", auditErr);
        }
      });

    console.log(`[gmail/send] Email sent to ${to} (msg: ${result.id})`);

    return NextResponse.json({
      success: true,
      message_id: result.id,
      thread_id: result.threadId,
    });
  } catch (err: unknown) {
    console.error("[gmail/send] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
