/**
 * Gmail Integration Utilities
 *
 * Dominion Sentinel Charter v3.0 §4 — Sacred Architectural Invariants:
 *   All writes go through API routes using createServerClient() (service role).
 *   Compliance is sacred — token storage must be encrypted at rest.
 *
 * Handles OAuth URL generation, token exchange, token encryption/decryption,
 * access token refresh, and MIME message construction for Gmail API calls.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
];

// ── Token Encryption (AES-256-GCM) ──────────────────────────────────────

function getEncryptionKey(): Buffer {
  const secret = process.env.GOOGLE_CLIENT_SECRET || "sentinel-gmail-fallback-key";
  return scryptSync(secret, "sentinel-gmail-v1", 32);
}

export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[0], "hex"));
  decipher.setAuthTag(Buffer.from(parts[1], "hex"));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], "hex")), decipher.final()]).toString("utf8");
}

// ── OAuth Helpers ────────────────────────────────────────────────────────

export function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/api/gmail/callback`;
}

export function buildAuthUrl(userId: string): string {
  const state = Buffer.from(JSON.stringify({ uid: userId })).toString("base64url");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${err}`);
  }

  const data = await res.json();

  let email: string | undefined;
  if (data.access_token) {
    try {
      const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const userInfo = await info.json();
      email = userInfo.email;
    } catch {
      /* non-fatal — email is cosmetic */
    }
  }

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    email,
  };
}

export async function refreshAccessToken(encryptedRefreshToken: string): Promise<string> {
  const refreshToken = decryptToken(encryptedRefreshToken);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

// ── Gmail API Helpers ────────────────────────────────────────────────────

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

export async function fetchInbox(accessToken: string, maxResults = 10): Promise<GmailMessage[]> {
  const listRes = await fetch(
    `${GMAIL_API_BASE}/messages?maxResults=${maxResults}&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
  const listData = await listRes.json();
  if (!listData.messages?.length) return [];

  const messages = await Promise.all(
    listData.messages.map(async (m: { id: string }) => {
      const msgRes = await fetch(
        `${GMAIL_API_BASE}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) return null;
      const msg = await msgRes.json();

      const headers = msg.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        snippet: msg.snippet ?? "",
        date: getHeader("Date"),
        unread: (msg.labelIds ?? []).includes("UNREAD"),
      } satisfies GmailMessage;
    })
  );

  return messages.filter(Boolean) as GmailMessage[];
}

// ── MIME Message Builder ─────────────────────────────────────────────────

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  data: string; // base64
}

export function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  attachments?: EmailAttachment[];
}): string {
  const boundary = `sentinel_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = params.attachments && params.attachments.length > 0;

  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
  ];

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`);
    lines.push("Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "");
    lines.push(Buffer.from(params.htmlBody).toString("base64"));

    for (const att of params.attachments!) {
      lines.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${att.filename}"`,
        "",
        att.data
      );
    }
    lines.push(`--${boundary}--`);
  } else {
    lines.push("Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "");
    lines.push(Buffer.from(params.htmlBody).toString("base64"));
  }

  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function sendEmail(
  accessToken: string,
  params: { from: string; to: string; subject: string; htmlBody: string; attachments?: EmailAttachment[] }
): Promise<{ id: string; threadId: string }> {
  const raw = buildRawEmail(params);

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${err}`);
  }

  return res.json();
}
