# SMS Messages Inbox — Cursor Build Spec

## Context

Inbound SMS messages are already being received and logged to `calls_log` with `disposition = 'sms_inbound'`. The Twilio webhook is live at `/api/twilio/sms`. But there is NO UI anywhere in Sentinel to see these messages or reply. Operators have zero visibility into texts.

**Current data:** `calls_log` rows with `disposition = 'sms_inbound'`, `phone_dialed` = sender phone, `notes` = message body, `started_at` = timestamp.

**Goal:** iMessage-style messages panel in the dialer sidebar where operators see inbound texts grouped by phone number and can reply inline.

---

## 1. New Table: `sms_messages`

`calls_log` is wrong for SMS — it's a call log, not a message store. Create a proper table.

**Migration: `20260323_sms_messages`**

```sql
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,           -- E.164 format (+15095907091)
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL DEFAULT '',
  twilio_sid TEXT,               -- Twilio MessageSid
  twilio_status TEXT,            -- queued, sent, delivered, failed, etc.
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  user_id UUID,                  -- operator who sent (outbound) or is assigned (inbound)
  read_at TIMESTAMPTZ,           -- NULL = unread
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_messages_phone ON sms_messages(phone, created_at DESC);
CREATE INDEX idx_sms_messages_lead ON sms_messages(lead_id, created_at DESC);
CREATE INDEX idx_sms_messages_unread ON sms_messages(user_id, read_at) WHERE read_at IS NULL;
```

**Migrate existing data** from `calls_log` after table creation:
```sql
INSERT INTO sms_messages (phone, direction, body, twilio_sid, created_at)
SELECT phone_dialed, 'inbound', notes, twilio_sid, started_at
FROM calls_log
WHERE disposition = 'sms_inbound';
```

---

## 2. Update Inbound Webhook: `/api/twilio/sms`

**File:** `src/app/api/twilio/sms/route.ts`

Change the webhook to write to `sms_messages` instead of `calls_log`:

```typescript
// Insert into sms_messages
await sb.from("sms_messages").insert({
  phone: from,                    // E.164 from Twilio
  direction: "inbound",
  body: body.slice(0, 2000),
  twilio_sid: messageSid,
  lead_id: matchedLead?.id ?? null,  // auto-match by phone (see below)
  user_id: matchedLead?.assigned_to ?? null,
});
```

**Auto-match sender to lead:** Before inserting, look up the phone number in the `leads` table:
```typescript
const phone10 = from.replace(/\D/g, "").slice(-10);
const { data: matchedLead } = await sb.from("leads")
  .select("id, assigned_to")
  .or(`owner_phone.eq.${from},owner_phone.ilike.%${phone10}`)
  .limit(1)
  .maybeSingle();
```

If matched, set `lead_id` and `user_id` so the message routes to the right operator.

**Keep the compliance scrub** — still run `scrubLead()` but don't auto-reply. Just log compliance status in event_log as it does now.

**Keep the event_log insert** — audit trail stays.

**Remove the calls_log insert** — SMS no longer goes to calls_log.

---

## 3. Send SMS API: `POST /api/twilio/sms/send`

**New file:** `src/app/api/twilio/sms/send/route.ts`

Operators send texts from the UI. This endpoint:
1. Validates auth (same pattern as dialer routes — `getDialerUser`)
2. Sends via Twilio REST API
3. Logs to `sms_messages` with `direction = 'outbound'`

```typescript
// Body: { to: string, body: string, leadId?: string }
// Uses getTwilioCredentials() from src/lib/twilio.ts
// Send via Twilio REST API (same pattern as vapi-sms.ts):
//   POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json
//   Body: To={to}&From={TWILIO_PHONE_NUMBER}&Body={body}
//   Auth: Basic base64(sid:token)

// Determine which Twilio number to send FROM:
// - If the lead is assigned to Logan, send from TWILIO_PHONE_NUMBER_LOGAN
// - If assigned to Adam, send from TWILIO_PHONE_NUMBER_ADAM
// - Default: TWILIO_PHONE_NUMBER

// After send, insert into sms_messages:
// { phone: to, direction: 'outbound', body, twilio_sid: response.sid,
//   twilio_status: response.status, lead_id: leadId, user_id: currentUser.id }
```

**IMPORTANT:** Send FROM the correct operator's Twilio number so replies come back to the same number. Env vars already exist:
- `TWILIO_PHONE_NUMBER_LOGAN` = +15098225460
- `TWILIO_PHONE_NUMBER_ADAM` = +15099921136

---

## 4. Messages API: `GET /api/twilio/sms/threads`

**New file:** `src/app/api/twilio/sms/threads/route.ts`

Returns message threads grouped by phone number, newest first.

```typescript
// Returns: { threads: Array<{
//   phone: string,
//   leadId: string | null,
//   leadName: string | null,
//   lastMessage: string,
//   lastMessageAt: string,
//   unreadCount: number,
//   direction: 'inbound' | 'outbound'
// }> }

// Query:
// SELECT DISTINCT ON (phone)
//   phone, lead_id, body as last_message, created_at as last_message_at, direction,
//   (SELECT count(*) FROM sms_messages m2 WHERE m2.phone = sms_messages.phone AND m2.read_at IS NULL AND m2.direction = 'inbound') as unread_count
// FROM sms_messages
// ORDER BY phone, created_at DESC
```

## 5. Thread Detail API: `GET /api/twilio/sms/threads/[phone]`

**New file:** `src/app/api/twilio/sms/threads/[phone]/route.ts`

Returns all messages for a phone number, oldest first (chat order).

```typescript
// Query params: ?phone=+15095907091&limit=50
// Returns: { messages: Array<{ id, direction, body, created_at, read_at, twilio_status }> }
// Also marks all inbound messages for this phone as read:
// UPDATE sms_messages SET read_at = now() WHERE phone = $1 AND direction = 'inbound' AND read_at IS NULL
```

---

## 6. Dialer UI: Messages Panel

**Location:** Dialer sidebar, new section between "UNLINKED CALLS" and "DIAL QUEUE"

### Messages Section Header
```
┌─────────────────────────────────────────┐
│ 💬 MESSAGES (3 unread)            ▼     │
└─────────────────────────────────────────┘
```

- Red badge with total unread count across all threads
- Collapsible like "UNLINKED CALLS"
- Polls `GET /api/twilio/sms/threads` every 10 seconds

### Thread List (collapsed view)
```
┌─────────────────────────────────────────┐
│ 💬 MESSAGES (3 unread)                  │
│                                          │
│ ● Vick, Eric     (509) 832-7926   2m    │
│   "Yeah I'm interested in selling..."   │
│                                          │
│ ● (509) 590-7091                  15m   │
│   "Test"                                 │
│                                          │
│   Lead House 365  (404) 495-7744  1h    │
│   "Hi this is Juan with Lead House..."  │
└─────────────────────────────────────────┘
```

- Blue dot (●) = has unread messages
- If phone matches a lead, show lead name
- Shows last message preview (truncated to 1 line)
- Relative timestamp

### Thread Detail (expanded on click)
```
┌─────────────────────────────────────────┐
│ ← Back    Vick, Eric   (509) 832-7926   │
│           Pre-Foreclosure · 33 Bronze   │
│─────────────────────────────────────────│
│                                          │
│ ○ Seller  3:04 PM                       │
│ "Yeah I'm interested in selling but     │
│  I need to talk to my wife first"       │
│                                          │
│                        ● You  3:06 PM   │
│                "Totally understand.      │
│          When would be a good time       │
│                    to call you both?"    │
│                                          │
│ ○ Seller  3:08 PM                       │
│ "Maybe Thursday evening?"               │
│                                          │
│─────────────────────────────────────────│
│ [Type a message...              ] [Send]│
│                                          │
│ [📞 Call Now]  [👤 Convert to Lead]     │
└─────────────────────────────────────────┘
```

- Inbound messages left-aligned (gray bubble)
- Outbound messages right-aligned (gold/primary bubble)
- Reply input at bottom — Enter to send, Shift+Enter for newline
- "Send" button calls `POST /api/twilio/sms/send`
- If phone matches a lead: show lead info bar with name, distress tag, score
- If phone doesn't match: show "Convert to Lead" button (same as unlinked calls)
- "Call Now" button dials the number immediately

### Key behaviors:
- **Auto-scroll to bottom** when thread opens or new message arrives
- **Mark as read** when thread is opened (PATCH via threads/[phone] endpoint)
- **New message notification** — if a message arrives while the panel is collapsed, increment the badge count. If the dialer is focused, play a subtle notification sound (different from the call ring).
- **Send from correct number** — include the operator's Twilio number in the send request so replies come back to the same number

---

## 7. Lead File Integration

On the lead file **Contact** tab, add a "Text Messages" section below phone/email:

- Shows last 5 messages with this lead's phone number
- "View all" link opens the full thread in the dialer messages panel
- "Send Text" button opens the reply input inline

This uses the same `GET /api/twilio/sms/threads/[phone]` endpoint.

---

## 8. Twilio Status Webhook (Optional Enhancement)

To track delivery status (sent → delivered → failed), add a status callback:

**File:** `src/app/api/twilio/sms/status/route.ts`

When sending outbound SMS, set `StatusCallback` to this URL. Twilio will POST updates:
```typescript
// Update sms_messages.twilio_status based on MessageStatus
await sb.from("sms_messages")
  .update({ twilio_status: status })
  .eq("twilio_sid", messageSid);
```

Show delivery status in the UI: ✓ sent, ✓✓ delivered, ✗ failed (red)

---

## 9. Env Vars Already Set (Verified)

These are confirmed in `.env.local` and Vercel:
- `TWILIO_ACCOUNT_SID` — on Vercel ✓
- `TWILIO_AUTH_TOKEN` — on Vercel ✓
- `TWILIO_PHONE_NUMBER` = +15098225460 (default from)
- `TWILIO_PHONE_NUMBER_ADAM` = +15099921136
- `TWILIO_PHONE_NUMBER_LOGAN` = +15098225460

SMS webhook URLs configured in Twilio Console:
- +15099921136 → `https://sentinel.dominionhomedeals.com/api/twilio/sms` ✓
- +15098225460 → `https://sentinel.dominionhomedeals.com/api/twilio/sms` ✓

---

## 10. File Summary

| File | Action | Purpose |
|------|--------|---------|
| `migrations/20260323_sms_messages.sql` | CREATE | New table + migrate existing data |
| `src/app/api/twilio/sms/route.ts` | MODIFY | Write to sms_messages instead of calls_log |
| `src/app/api/twilio/sms/send/route.ts` | CREATE | Outbound SMS endpoint |
| `src/app/api/twilio/sms/threads/route.ts` | CREATE | Thread list endpoint |
| `src/app/api/twilio/sms/threads/[phone]/route.ts` | CREATE | Thread detail + mark read |
| `src/app/api/twilio/sms/status/route.ts` | CREATE | Delivery status webhook |
| Dialer sidebar component | MODIFY | Add Messages section with thread list + detail |
| Lead file Contact tab | MODIFY | Add text messages section |
