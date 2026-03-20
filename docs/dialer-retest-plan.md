# Sentinel Dialer — Retest Plan (Round 2)

**Purpose:** Cover only the items that were BLOCKED or FAILED in the March 16 manual test.
**Prerequisite:** Complete one full call through the session-backed disposition flow (Steps 1-3) to unblock most items.

---

## How to run this retest

The majority of BLOCKED items unlock by completing **one full call with a `follow_up` disposition through all 3 steps**. Here is the recommended test sequence:

1. Select a lead from the queue
2. Dial and let the call ring for at least 10 seconds (answer on your test phone if possible)
3. Hang up
4. In the PostCallPanel, select **Follow Up** (this triggers Step 2 + Step 3)
5. In Step 2, set a callback date, then click "Next: Confirm Outcome"
6. In Step 3, wait for the AI draft to appear, interact with every field, then publish
7. After publish, check the database

This single flow covers items from Sections 5b through 5e, 12, and 13.

---

## Section 1: KPI Card Modal (1 item)

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 1.6 | Click any KPI card | Click "My Outbound" or any other KPI stat card at the top of the dialer | StatDetailModal opens with tabs: Today / Week / Month / All Time; data matches |

---

## Section 2: Pre-Call Brief Deep Checks (3 items)

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 2.9 | Pre-call brief metadata | Open browser DevTools > Network tab. Select a lead. Find the POST to `/api/dialer/v1/pre-call-brief`. Inspect the JSON response body. | Response contains `_promptVersion`, `_provider` (should be "openai"), `_model` (should be gpt-5-mini or similar) |
| 2.10 | Pre-call brief for repeat lead | Select KUKUCKA (has 15 prior calls). Inspect the brief content. | Brief should include a "Latest Reviewed Seller Takeaway" section referencing prior call memory (promises, objections, deal temp from last call) |
| 2.11 | Pre-call brief for first-time lead | Select "729 w dalton" (shows "Not contacted"). Inspect the brief. | Brief loads without errors. Generic opener. No memory section. No crash. |

---

## Section 3: First-Call Consent Flow (4 items)

**Setup:** You need a lead that has never been called and has `call_consent = false`. The lead "729 w dalton" should qualify if it truly shows "Not contacted."

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 3.1 | Consent banner appears | Select "729 w dalton" and click Dial | Yellow consent banner appears: "Agent Consent Acknowledgment — Washington law (RCW 9.73.030)" |
| 3.2 | Cancel dismisses | Click "Cancel" on the consent banner | Banner disappears. No call initiated. No consent recorded in DB. |
| 3.3 | Confirm & Dial | Click Dial again, then "Confirm & Dial" | POST /api/dialer/consent fires. Call initiates immediately after. |
| 3.4 | Consent persists | Hang up, then click Dial again on the same lead | Consent banner does NOT appear the second time. Call dials directly. |

---

## Section 4: Network-Level Call Checks (2 items)

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 4.7 | Live notes (STT) | During an active call, check if "AI LIVE NOTES" panel shows content beyond the placeholder | If TRANSCRIPTION_WS_URL is not configured, panel shows placeholder. Mark BLOCKED if unset. If configured, bullets should appear. |
| 4.10 | Call status polling | Open DevTools > Network tab during an active call. Filter for "call-status". | GET /api/dialer/call-status fires every ~2 seconds with callLogId and callSid params |

---

## Section 5: Full Post-Call Flow (36+ items)

**This is the critical section.** Complete one full `follow_up` call to unlock all items.

### 5a. Step 1 — Disposition Selection

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 5a.5 | "Skip — next lead" | After hanging up, before selecting a disposition, look for "Skip — next lead" button at the bottom of the panel | Button is visible. Clicking it fires PATCH /api/dialer/call and advances to next lead without logging full disposition. |

### 5b. One-Tap Dispositions

**Test with a short call (let it ring, then hang up).**

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 5b.1 | No Answer one-tap | After a call that wasn't answered, select `No Answer` | Publishes immediately. No Step 2 or Step 3. Panel shows "Logged: No Answer" then advances. |
| 5b.2 | Voicemail one-tap | On next call, select `Voicemail` | Same — immediate publish, no further steps. |
| 5b.3 | Disqualified one-tap | Select `Disqualified` | Same — immediate publish. |
| 5b.4 | Verify DB after one-tap | Check Supabase: `calls_log` row updated with correct disposition. `dialer_events` has `call.published` event. `leads` counters incremented. | All 3 tables updated correctly. |

### 5c. Step 2 — Callback Date

**Test with a call where you select `Follow Up`.**

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 5c.1 | Follow Up shows Step 2 | After hanging up, select `Follow Up` | Step 2 appears with datetime-local picker and notes textarea |
| 5c.2 | Appointment shows Step 2 | (Alternate test) Select `Appointment` instead | Same Step 2 UI appears |
| 5c.3 | Date picker min constraint | Try to select a date/time in the past | Should be impossible — min is set to current datetime |
| 5c.4 | "Next: Confirm Outcome" | Set a future date, click "Next: Confirm Outcome" | Advances to Step 3. Date and notes carried forward. |
| 5c.5 | "Skip date & qual — save now" | (Alternate test) Click this button instead of setting a date | Publishes immediately. Check tasks table: task created with "(set callback date)" in title. |
| 5c.6 | Defaulted callback event | After 5c.5, check `dialer_events` | Row with event_type `follow_up.callback_date_defaulted` exists |
| 5c.7 | "Change" button | In Step 2, click "Change" | Returns to Step 1 disposition grid |

### 5d. Step 3 — Qual Confirm + AI Draft

**This fires automatically when you advance from Step 2.**

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 5d.1 | AI extract fires | Open DevTools > Network. Enter Step 3. | POST to `/api/dialer/v1/sessions/{id}/extract` fires automatically |
| 5d.2 | AI draft fires | Same network inspection | POST to `/api/dialer/v1/sessions/{id}/draft-note` fires automatically |
| 5d.3 | AI summary pre-generation | Same network inspection | POST to `/api/dialer/summarize` fires in background |
| 5d.4 | PostCallDraftPanel appears | Watch the UI | Spinner "Drafting call notes..." → then 5 editable fields appear |
| 5d.5 | AI draft fields | Inspect the draft panel | 5 fields: Summary (120 chars), Promised (80), Objection (80), Next step (60), Callback timing (60). All editable. |
| 5d.6 | Deal temperature chips | Look below the text fields | 5 chips: Hot / Warm / Cool / Cold / Dead. One should be pre-selected by AI. Click to change. |
| 5d.7 | Objection tag chips | Look for tag chip grid | Multi-select chips from allowlist. Selecting "other" should reveal a note textarea. |
| 5d.8 | KNOWN GAP: tag not auto-selected | Check if AI objection text matches a tag but no chip is highlighted | Confirm: text field populated but no chip selected |
| 5d.9 | "Use these notes" | Click it | Draft assembles into structured note text. Inline correction fields appear below. |
| 5d.10 | "Flag draft" | Click the flag button | Turns orange. Becomes disabled. Check that parent state shows `draft_flagged = true`. |
| 5d.11 | "Use my notes" | (Alternate path) Click this instead of "Use these notes" | Bypasses AI draft. Your raw notes are used. Objection tags still captured. |
| 5d.12 | Post-draft corrections | After clicking "Use these notes", look below | 4 textareas: Promises made, Primary objection, Suggested next action, Best callback timing. All editable. |
| 5d.13 | Quick callback date correction | Look for datetime-local input in corrections area | Present only for follow_up/appointment dispositions. Lets operator override the date from Step 2. |
| 5d.14 | Motivation level buttons | Look for 1-5 number buttons | 5 buttons. AI may pre-select one with "AI" label. Clicking a different one removes the AI label. |
| 5d.15 | Seller timeline chips | Look for timeline options | 4 chips: Immediate / 30 days / 60 days / Flexible. Single-select. |
| 5d.16 | Qual gap strip | Look for strip showing unknown qual fields | Shows which fields are still unknown |
| 5d.17 | KNOWN GAP: qual strip always unknown | Check if strip shows actual values or all unknown | Confirm: all fields show unknown regardless of actual CRM data |
| 5d.18 | "Save & Continue" | Click it with all fields filled | Publishes. See Section 5e for DB verification. |
| 5d.19 | "Flag AI output" | Look for flag toggle (only visible when extraction ran) | Toggles orange. Only appears if AI extract ran in 5d.1. |
| 5d.20 | "Skip — save without qual" | (Alternate path) Click this instead of Save & Continue | Publishes with dispo + date only. No qual fields updated. |
| 5d.21 | "Change" button | Click it in Step 3 | Returns to Step 2 (if you came from date) or Step 1 (if direct) |

### 5e. Publish Verification

**Run these checks after a successful "Save & Continue" in Step 3.**

| # | Test | Where to check | Expected |
|---|------|---------------|----------|
| 5e.1 | Publish API response | DevTools > Network > find POST to `/api/dialer/v1/sessions/{id}/publish` | Response: `{ ok: true, calls_log_id, lead_id, task_id }` |
| 5e.2 | calls_log updated | Supabase > calls_log table > filter by the returned calls_log_id | disposition, duration_sec, notes all updated correctly |
| 5e.3 | leads updated | Supabase > leads table > filter by lead_id | motivation_level, seller_timeline updated (only if you set them) |
| 5e.4 | Task created | Supabase > tasks table > filter by lead_id, recent | New task row with correct title, due_at, assigned_to |
| 5e.5 | Objection tags written | Supabase > lead_objection_tags > filter by lead_id | One row per tag you selected |
| 5e.6 | Post-call structure written | Supabase > post_call_structures > filter by session_id | summary_line, promises_made, objection, next_task_suggestion, deal_temperature, callback_timing_hint all populated |
| 5e.7 | AI traces updated | Supabase > dialer_ai_traces > filter by session_id or recent | review_flag set correctly for extract/summary/draft run IDs |
| 5e.8 | Eval ratings written | Supabase > eval_ratings > filter recent | One row per AI workflow that ran |
| 5e.9 | Dialer events | Supabase > dialer_events > filter by session_id | `call.published` event. `follow_up.task_created` if follow_up. `ai_output.reviewed` / `ai_output.flagged` if AI ran. |
| 5e.10 | Counter PATCH fires | DevTools > Network | PATCH /api/dialer/call fires with `skipCallsLogWrite: true` |
| 5e.11 | Success confirmation | Watch UI | Panel shows "Logged: Follow Up" for ~1 second, then auto-advances to next lead |
| 5e.12 | Counter PATCH failure visibility | Browser console (F12 > Console) | If PATCH fails, warning: `[PostCallPanel] /api/dialer/call counter PATCH failed` appears |

---

## Section 6: Manual Dial Execution (2 items)

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 6.2 | Dial Now | Type a real number (your test phone) in Manual Dial input, click "Dial Now" | Call initiates. Test phone rings. VoIP status updates. |
| 6.3 | End button | Click "End" during the manual call | Call terminates. PATCH fires with disposition: "manual_hangup". |

After the call ends, verify:
- **KNOWN GAP G2:** No PostCallPanel appears. No way to log disposition or notes. The call is over and the UI returns to idle.

---

## Section 8: Inbound Call Handling (4 items)

**Setup:** Call your Twilio number from your test phone.

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 8.1 | Inbound call rings | Call the Dominion Twilio number from your test phone | Your cell phone rings (forwarded from Twilio). Twilio answers with TwiML. |
| 8.2 | Answered inbound | Answer the forwarded call on your cell | Check dialer_events: row with event_type `inbound.answered` and lead_id (if phone matches a lead) |
| 8.3 | Missed inbound | Call the Twilio number, let it ring, don't answer | Check dialer_events: `inbound.missed`. Check tasks: priority-3 callback task created. |
| 8.4 | War Room missed-inbound queue | Navigate to /dialer/war-room after a missed inbound | Missed Inbound section shows the missed call with caller info |

---

## Section 8/9: Missed Opportunities Widget (FAILED — needs debugging)

| # | Test | What to do | Expected |
|---|------|-----------|----------|
| 8.4 / 9.5 | Missed Opportunities widget | Navigate to /dialer/war-room. Look at the "Missed Opportunities" widget. | **PREVIOUSLY FAILED with "Failed to load".** Check if it loads now, or reproduce the error and capture the browser console error message (F12 > Console). |

**If it fails again:** Copy the exact error from the browser console. This is a real bug to fix.

---

## Section 12: Automation Chain (9 items)

Most of these unlock from the full call flow above.

| # | Automation | When to check | Expected |
|---|------------|--------------|----------|
| 12.5 | Live notes auto-update | During active call with STT configured | Bullets appear in realtime. If STT not configured, mark BLOCKED. |
| 12.6 | AI extract auto-fires | DevTools > Network when entering Step 3 | POST to `/sessions/{id}/extract` fires without operator action |
| 12.7 | AI draft auto-fires | Same | POST to `/sessions/{id}/draft-note` fires without operator action |
| 12.8 | Task auto-created | After publishing with follow_up | Check tasks table: new row exists |
| 12.9 | Callback defaulting | Publish follow_up without setting a date | Task title includes "(set callback date)"; dialer_events has `follow_up.callback_date_defaulted` |
| 12.11 | Missed inbound auto-task | After a missed inbound call (Section 8.3) | Priority-3 task created automatically |
| 12.12 | Queue auto-advances | After successful publish | Next lead in queue selected within ~1 second |
| 12.13 | Token auto-refresh | Leave dialer page open for 50+ minutes. Watch DevTools > Network for GET /api/twilio/token | New token fetched ~3 min before TTL expires |
| 12.14 | 7-day sequence routing | Disposition a lead as no_answer/voicemail multiple times | After sequence completes without live answer, lead auto-routes to nurture stage |

---

## Section 13: Data Integrity Checks

**Run these in Supabase SQL Editor after completing the full test cycle.**

### 13.1 — No orphaned sessions
```sql
SELECT id, status, created_at
FROM call_sessions
WHERE status NOT IN ('ended', 'failed')
  AND created_at < now() - interval '1 hour';
```
Expected: 0 rows.

### 13.2 — Every published call has a dialer_event
```sql
SELECT c.id, c.disposition, c.created_at
FROM calls_log c
LEFT JOIN dialer_events e
  ON e.payload->>'calls_log_id' = c.id::text
  AND e.event_type = 'call.published'
WHERE c.disposition NOT IN ('initiating', 'in_progress', 'ringing_prospect')
  AND e.id IS NULL
  AND c.created_at > now() - interval '1 day';
```
Expected: 0 rows.

### 13.3 — Post-call structures match published calls
```sql
SELECT c.id, c.disposition
FROM calls_log c
LEFT JOIN post_call_structures p
  ON p.session_id = c.dialer_session_id
WHERE c.dialer_session_id IS NOT NULL
  AND c.disposition IN ('completed', 'follow_up', 'appointment', 'offer_made', 'not_interested')
  AND p.id IS NULL
  AND c.created_at > now() - interval '1 day';
```
Expected: 0 rows.

### 13.4 — AI traces have run_ids
```sql
SELECT id, workflow, created_at
FROM dialer_ai_traces
WHERE run_id IS NULL
  AND created_at > now() - interval '1 day';
```
Expected: 0 rows.

### 13.5 — No double-counted calls
```sql
SELECT lead_id, phone_dialed, DATE_TRUNC('minute', started_at), count(*)
FROM calls_log
WHERE created_at > now() - interval '1 day'
GROUP BY lead_id, phone_dialed, DATE_TRUNC('minute', started_at)
HAVING count(*) > 1;
```
Expected: 0 rows.

### 13.6 — Tasks have valid due dates
```sql
SELECT id, title, created_at
FROM tasks
WHERE due_at IS NULL
  AND status = 'pending'
  AND created_at > now() - interval '1 day';
```
Expected: 0 rows.

---

## Retest Summary

| Section | Items to retest | Key action required |
|---------|----------------|-------------------|
| 1. KPI Card | 1 | Click a stat card |
| 2. Pre-call brief | 3 | DevTools network inspection |
| 3. Consent flow | 4 | Dial an unconsented lead |
| 4. Network checks | 2 | DevTools during call |
| 5. Full post-call flow | 36+ | One full follow_up call through Steps 1-3 |
| 6. Manual dial | 2 | Dial a manual number |
| 8. Inbound | 4 | Call your Twilio number |
| 8/9. Missed Opportunities bug | 1 | Reproduce and capture console error |
| 12. Automations | 9 | Most covered by the full call flow |
| 13. Data integrity | 6 | Run SQL queries in Supabase |

**Total items to retest: ~68**
**Estimated time: 30-45 minutes** (one real call through full flow + inbound test + DB checks)
