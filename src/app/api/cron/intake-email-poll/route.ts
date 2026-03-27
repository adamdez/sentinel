import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { refreshAccessToken, fetchUnreadInbox, fetchMessageDetail, markAsRead } from "@/lib/gmail";
import { normalizeInboundCandidate } from "@/lib/inbound-intake";
import { processInboundCandidateToIntakeQueue } from "@/lib/inbound-intake-server";

/**
 * GET /api/cron/intake-email-poll
 *
 * Polls the PPL intake Gmail account (leads@dominionhomedeals.com) for unread emails.
 * Only processes emails from approved senders (configured per intake_provider).
 * Approved emails → intake_leads table (pending_review).
 * Non-matching emails → left unread in inbox.
 *
 * Cron schedule: every 2 minutes
 * Auth: CRON_SECRET header
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const intakeUserId = process.env.INTAKE_GMAIL_USER_ID;
  if (!intakeUserId) {
    return NextResponse.json({
      error: "INTAKE_GMAIL_USER_ID not configured",
      hint: "Set this env var to the user_id whose Gmail is connected to leads@dominionhomedeals.com",
    }, { status: 500 });
  }

  try {
    const sb = createServerClient();

    // Step 1: Get Gmail credentials for the intake account
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileError } = await (sb.from("user_profiles") as any)
      .select("preferences")
      .eq("id", intakeUserId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Intake Gmail user not found" }, { status: 500 });
    }

    const prefs = profile.preferences as Record<string, unknown> | null;
    // Look for intake_gmail first (dedicated PPL inbox), fall back to personal gmail
    const intakeGmail = prefs?.intake_gmail as { connected?: boolean; encrypted_refresh_token?: string } | undefined;
    const personalGmail = prefs?.gmail as { connected?: boolean; encrypted_refresh_token?: string } | undefined;
    const gmail = (intakeGmail?.connected && intakeGmail.encrypted_refresh_token) ? intakeGmail : personalGmail;

    if (!gmail?.connected || !gmail.encrypted_refresh_token) {
      return NextResponse.json({
        error: "Gmail not connected for intake account",
        hint: "Go to /gmail and click 'Connect PPL Inbox' to connect leads@dominionhomedeals.com",
      }, { status: 500 });
    }

    const accessToken = await refreshAccessToken(gmail.encrypted_refresh_token);

    // Step 2: Load approved sender patterns from active intake providers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: providers } = await (sb.from("intake_providers") as any)
      .select("id, name, approved_email_patterns")
      .eq("is_active", true);

    if (!providers || providers.length === 0) {
      return NextResponse.json({ skipped: true, reason: "No active intake providers" });
    }

    // Build a flat list of { pattern, providerName } for matching
    const approvedPatterns: Array<{ pattern: string; providerName: string; providerId: string }> = [];
    for (const provider of providers) {
      const patterns = provider.approved_email_patterns as string[] | null;
      if (patterns && patterns.length > 0) {
        for (const pattern of patterns) {
          approvedPatterns.push({
            pattern: pattern.toLowerCase().trim(),
            providerName: provider.name,
            providerId: provider.id,
          });
        }
      }
    }

    if (approvedPatterns.length === 0) {
      return NextResponse.json({ skipped: true, reason: "No approved sender patterns configured" });
    }

    // Step 3: Fetch unread emails
    const unreadMessages = await fetchUnreadInbox(accessToken, 20);
    if (unreadMessages.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: "No unread emails" });
    }

    // Step 4: Match senders against approved patterns
    let processed = 0;
    let skipped = 0;
    const results: Array<{ messageId: string; from: string; subject: string; status: string; provider?: string }> = [];

    for (const message of unreadMessages) {
      const senderEmail = extractEmail(message.from).toLowerCase();
      const match = matchSender(senderEmail, approvedPatterns);

      if (!match) {
        skipped++;
        results.push({
          messageId: message.id,
          from: message.from,
          subject: message.subject,
          status: "skipped_not_approved",
        });
        continue;
      }

      // Step 5: Fetch full message and process to intake queue
      try {
        const detail = await fetchMessageDetail(accessToken, message);
        if (!detail) {
          results.push({
            messageId: message.id,
            from: message.from,
            subject: message.subject,
            status: "failed_fetch",
          });
          continue;
        }

        const candidate = normalizeInboundCandidate({
          sourceChannel: "email_intake",
          sourceVendor: match.providerName.toLowerCase().replace(/\s+/g, "_"),
          sourceCampaign: detail.subject,
          intakeMethod: "gmail_auto_poll",
          rawSourceRef: detail.threadId || detail.id,
          notes: detail.snippet,
          rawText: `${detail.subject}\n${detail.from}\n${detail.bodyText}`,
          rawPayload: {
            message_id: detail.id,
            thread_id: detail.threadId,
            from: detail.from,
            to: detail.to,
            subject: detail.subject,
            snippet: detail.snippet,
            body_text: detail.bodyText,
            body_html: detail.bodyHtml,
            auto_polled: true,
            matched_provider: match.providerName,
          },
          receivedAt: detail.date ? new Date(detail.date).toISOString() : null,
        });

        const result = await processInboundCandidateToIntakeQueue({
          sb,
          candidate,
          actorId: null, // system-initiated
        });

        if (result.status === "failed") {
          results.push({
            messageId: message.id,
            from: message.from,
            subject: message.subject,
            status: "failed_intake",
          });
          continue;
        }

        // Step 6: Mark as read so we don't re-process
        await markAsRead(accessToken, message.id);
        processed++;

        results.push({
          messageId: message.id,
          from: message.from,
          subject: message.subject,
          status: "ingested",
          provider: match.providerName,
        });
      } catch (err) {
        console.error(`[intake-email-poll] Failed to process message ${message.id}:`, err);
        results.push({
          messageId: message.id,
          from: message.from,
          subject: message.subject,
          status: "error",
        });
      }
    }

    console.log(`[intake-email-poll] Processed ${processed}, skipped ${skipped} of ${unreadMessages.length} unread`);

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      total_unread: unreadMessages.length,
      results,
    });
  } catch (error) {
    console.error("[intake-email-poll] Failed:", error);
    return NextResponse.json({ error: "Email poll failed" }, { status: 500 });
  }
}

/**
 * Extract bare email address from a "From" header like "John Smith <john@example.com>"
 */
function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1];
  // If no angle brackets, the whole thing might be the email
  return fromHeader.trim();
}

/**
 * Check if a sender email matches any approved pattern.
 * Patterns can be:
 *   - Full email: "john@leadhouse.com"
 *   - Domain wildcard: "@leadhouse.com" (matches any user at that domain)
 */
function matchSender(
  senderEmail: string,
  patterns: Array<{ pattern: string; providerName: string; providerId: string }>
): { providerName: string; providerId: string } | null {
  for (const entry of patterns) {
    if (entry.pattern.startsWith("@")) {
      // Domain match: "@leadhouse.com" matches "anyone@leadhouse.com"
      if (senderEmail.endsWith(entry.pattern)) {
        return { providerName: entry.providerName, providerId: entry.providerId };
      }
    } else {
      // Exact email match
      if (senderEmail === entry.pattern) {
        return { providerName: entry.providerName, providerId: entry.providerId };
      }
    }
  }
  return null;
}
