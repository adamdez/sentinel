# Sentinel Dialer — Comprehensive Manual Test Plan

**Version:** 1.0
**Date:** 2026-03-15
**Scope:** All dialer surfaces, automations, post-call discipline, pre-call prep, inbound handling, and operator workflows.

**Test objective:** Verify that every button, automation, and data flow in the dialer system works correctly for the end user (Logan as primary operator, Adam as reviewer). Evaluate whether the system reduces manual labor and increases agent precision as intended.

---

## How to use this document

- Run through each section in order. Each section represents a distinct operator workflow.
- Mark each item PASS / FAIL / BLOCKED / N/A.
- "BLOCKED" means the feature depends on configuration that is not set up (e.g., STT).
- "KNOWN GAP" items are documented shortcomings, not test failures — they describe missing features.
- After completing the test, the FAIL and KNOWN GAP items together form the backlog.

---

## Prerequisites

Before testing, confirm:

- [ ] Logged in as an operator with leads assigned
- [ ] At least 3 leads in `lead` or `negotiation` stage assigned to you
- [ ] At least 1 lead has prior call history (for repeat-call testing)
- [ ] At least 1 lead has never been called (for first-call consent testing)
- [ ] Twilio credentials configured (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`)
- [ ] OpenAI API key configured (`OPENAI_API_KEY`)
- [ ] Browser microphone permissions granted
- [ ] A second phone available to receive test calls

---

## 1. Dialer Page Load and VoIP Initialization

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 1.1 | Navigate to `/dialer` | Page loads without errors | |
| 1.2 | VoIP status badge | Shows "VoIP Ready" within 5 seconds of page load | |
| 1.3 | Dial queue populates | Left panel shows up to 7 leads sorted by priority | |
| 1.4 | Queue priority order | Overdue/due follow-ups appear first, then unscheduled | |
| 1.5 | KPI bar | 6 stat cards visible: My Outbound, My Inbound, My Live Answers, My Avg Talk Time, Team Outbound, Team Inbound | |
| 1.6 | Click any KPI card | StatDetailModal opens with period tabs (Today / Week / Month / All Time) | |
| 1.7 | Call history panel (right) | Shows recent calls with direction dot, name, phone, disposition, duration, time ago | |
| 1.8 | Call history filter tabs | All / Outbound / Inbound tabs filter correctly | |

---

## 2. Lead Selection and Pre-Call Context

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 2.1 | Click a lead in the queue | Center panel updates with lead info (name, address, phone, property data) | |
| 2.2 | Lead detail accuracy | Owner name, address, city/state/county, phone, ARV, equity %, owed, beds/baths, sqft, year, lot size all display correctly | |
| 2.3 | Distress tags | Visible if lead has distress signals (tax lien, pre-foreclosure, etc.) | |
| 2.4 | Qualification strip | Stage, route, next action, due date, qual score, motivation, timeline, last outcome all present | |
| 2.5 | "Open Lead Detail" eye icon | Opens MasterClientFileModal overlay; data matches the lead card | |
| 2.6 | Additional phone numbers | If lead has multiple phones, alternate number buttons appear and load into Manual Dial input when clicked | |
| 2.7 | Pre-call brief loads | Purple card appears with AI-generated bullets, suggested opener, talking points, objections + rebuttals, negotiation anchor, watch-outs | |
| 2.8 | Pre-call brief risk flags | Amber "Risk Flags" section appears if contradictions/cautions exist in lead data; absent if no risk signals | |
| 2.9 | Pre-call brief metadata | `_promptVersion`, `_provider`, `_model` visible in response (check network tab) | |
| 2.10 | Pre-call brief for repeat lead | Brief includes "Latest Reviewed Seller Takeaway" section with structured memory from prior calls | |
| 2.11 | Pre-call brief for first-time lead | Brief degrades gracefully — shows generic opener, no memory section, no errors | |
| 2.12 | **KNOWN GAP** | Seller memory panel is NOT visible in idle state before the call starts. Logan cannot see call history, objections, or promises without starting the call. | |

---

## 3. First-Call Consent Flow

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 3.1 | Click Dial on an unconsented lead | Yellow consent banner appears: "Agent Consent Acknowledgment — Washington law (RCW 9.73.030)" | |
| 3.2 | Click "Cancel" | Banner dismisses; no call initiated; no consent recorded | |
| 3.3 | Click "Confirm & Dial" | POST /api/dialer/consent fires; lead's `call_consent` updates to `true`; call initiates immediately after | |
| 3.4 | Subsequent dial on same lead | Consent banner does NOT appear again | |

---

## 4. Outbound Call — Queue-Based (Session-Backed Path)

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 4.1 | Click Dial on a consented lead | Call initiates: session created (POST /api/dialer/v1/sessions), call logged (POST /api/dialer/call), Twilio SDK connects | |
| 4.2 | VoIP status | Badge changes to "RINGING PROSPECT..." then "LIVE — VoIP" on answer | |
| 4.3 | Call timer | Starts counting up when call connects | |
| 4.4 | Mute button | Toggles mute state; UI reflects muted indicator; prospect cannot hear agent when muted | |
| 4.5 | Hang Up button | Ends the call; state transitions to "ended"; hotkey: Escape | |
| 4.6 | Session state sync | Check call_sessions table: status progresses through `initiating` → `ringing` → `connected` → `ended` | |
| 4.7 | Live notes panel | Shows AI-generated bullets if STT is configured. If `TRANSCRIPTION_WS_URL` is not set, panel is empty (see note below) | |
| 4.8 | Note scaffold | When call connects, note textarea pre-populates with qual prompt scaffolding (e.g., "Timeline:", "Motivation:"); does NOT overwrite if operator has already typed | |
| 4.9 | Seller memory panel appears | Right column shows SellerMemoryPanel with: total calls, answered, last contact, open tasks, scheduled callback, structured memory, objections, DM note, call history | |
| 4.10 | Call status polling | Network tab shows GET /api/dialer/call-status every 2 seconds during the call | |

**Note on live transcription:** If `TRANSCRIPTION_WS_URL` is not configured in environment variables, live notes will not populate. This is expected. The STT layer is optional in the current build. Mark this test as BLOCKED if the env var is unset, not FAIL.

---

## 5. Post-Call — Disposition (Session-Backed Path)

This is the primary path for all queue-based calls. The PostCallPanel replaces the legacy 9-button grid.

### 5a. Step 1 — Disposition Selection

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 5a.1 | PostCallPanel appears after hangup | Panel renders (not the legacy 9-button grid) because a dialer session exists | |
| 5a.2 | 8 disposition tiles visible | `no_answer`, `voicemail`, `completed` (Talked), `not_interested`, `follow_up`, `appointment`, `offer_made`, `disqualified` | |
| 5a.3 | Each tile shows next-step hint | `+ date` hint on follow_up/appointment; `+ qual` hint on completed/not_interested/offer_made | |
| 5a.4 | Notes textarea | Present, 300 char limit, pre-filled from call notes/summary if available | |
| 5a.5 | "Skip — next lead" button | Fires PATCH /api/dialer/call (disposition: "completed"), advances to next lead in queue | |

### 5b. One-Tap Dispositions (no_answer, voicemail, disqualified)

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 5b.1 | Select `no_answer` | Publishes immediately (POST /api/dialer/v1/sessions/{id}/publish) — no Step 2 or Step 3 | |
| 5b.2 | Select `voicemail` | Same as above — immediate publish | |
| 5b.3 | Select `disqualified` | Same as above — immediate publish | |
| 5b.4 | Verify DB after one-tap | Check calls_log: disposition updated. Check leads: call counters incremented. Check dialer_events: `call.published` event exists | |

### 5c. Step 2 — Callback Date (follow_up / appointment only)

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 5c.1 | Select `follow_up` | Step 2 appears: datetime-local input + notes textarea | |
| 5c.2 | Select `appointment` | Same as above | |
| 5c.3 | Date picker min constraint | Cannot select dates in the past (min = now) | |
| 5c.4 | "Next: Confirm Outcome" | Advances to Step 3 with date and notes carried forward | |
| 5c.5 | "Skip date & qual — save now" | Publishes immediately without date or qual. Check tasks table: task created with "(set callback date)" suffix in title | |
| 5c.6 | Verify defaulted callback event | Check dialer_events: `follow_up.callback_date_defaulted` event when date is skipped | |
| 5c.7 | "Change" button | Returns to Step 1 | |

### 5d. Step 3 — Qual Confirm + AI Draft

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 5d.1 | AI extract fires | POST /api/dialer/v1/sessions/{id}/extract fires automatically on entering Step 3. Network tab shows request. | |
| 5d.2 | AI draft fires | POST /api/dialer/v1/sessions/{id}/draft-note fires automatically. Network tab shows request. | |
| 5d.3 | AI summary pre-generation | POST /api/dialer/summarize fires in background for eval closure | |
| 5d.4 | PostCallDraftPanel appears | Spinner "Drafting call notes..." then 5 editable fields populate | |
| 5d.5 | AI draft fields | Summary (120 chars), Promised (80), Objection (80), Next step (60), Callback timing (60) — all editable | |
| 5d.6 | Deal temperature chips | 5 chips (Hot/Warm/Cool/Cold/Dead); AI pre-selects one; operator can toggle | |
| 5d.7 | Objection tag chips | Multi-select from allowlist; "other" reveals a note textarea. Counter shows "N tagged" | |
| 5d.8 | **KNOWN GAP** | AI objection text populates the text field but no tag chip is auto-selected. Operator must manually select matching tag. | |
| 5d.9 | "Use these notes" | Assembles draft into structured note text; shows inline corrections below | |
| 5d.10 | "Flag draft" | Turns orange, becomes disabled, sets `draft_flagged` in parent state | |
| 5d.11 | "Use my notes" | Bypasses AI draft; objection tags still captured; uses operator's raw notes | |
| 5d.12 | Post-draft corrections | 4 textarea fields appear: Promises made, Primary objection, Suggested next action, Best callback timing — all editable | |
| 5d.13 | Quick callback date correction | datetime-local input appears for follow_up/appointment dispositions | |
| 5d.14 | Motivation level buttons | 5 buttons (1-5); AI pre-selects with "AI" label; clicking removes label | |
| 5d.15 | Seller timeline chips | 4 options: Immediate / 30 days / 60 days / Flexible; single-select | |
| 5d.16 | Qual gap strip | Shows remaining unknown qual fields | |
| 5d.17 | **KNOWN GAP** | Qual gap strip always shows ALL fields as unknown because `qualContext` is not passed from dialer page. Strip is not useful in current state. | |
| 5d.18 | "Save & Continue" | Publishes with all data. Verify in DB: calls_log, leads, tasks, lead_objection_tags, post_call_structures, dialer_ai_traces, eval_ratings | |
| 5d.19 | "Flag AI output" | Toggles orange; only visible when extraction ran | |
| 5d.20 | "Skip — save without qual" | Publishes with dispo + date only; no qual fields updated | |
| 5d.21 | "Change" button | Returns to Step 2 (if came from date) or Step 1 (if came direct from dispo) | |

### 5e. Publish Verification

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 5e.1 | POST publish fires | POST /api/dialer/v1/sessions/{id}/publish returns `{ ok: true }` | |
| 5e.2 | calls_log updated | Check: disposition, duration_sec, notes fields updated correctly | |
| 5e.3 | leads updated | Check: motivation_level, seller_timeline, qualification_route updated (only if provided) | |
| 5e.4 | Task created (follow_up/appointment) | Check tasks table: new task with correct title, due_at, assigned_to | |
| 5e.5 | Objection tags written | Check lead_objection_tags: one row per selected tag | |
| 5e.6 | Post-call structure written | Check post_call_structures: summary_line, promises_made, objection, next_task_suggestion, deal_temperature, callback_timing_hint | |
| 5e.7 | AI traces updated | Check dialer_ai_traces: review_flag set correctly for extract/summary/draft run IDs | |
| 5e.8 | Eval ratings written | Check eval_ratings: one row per AI workflow that ran (extract, summarize, draft_note) | |
| 5e.9 | Dialer events | Check dialer_events: `call.published` event. Also `follow_up.task_created` if applicable. Also `ai_output.reviewed` / `ai_output.flagged` if AI ran. | |
| 5e.10 | Counter PATCH fires | PATCH /api/dialer/call fires with `skipCallsLogWrite: true` for counter increment only | |
| 5e.11 | Success confirmation | Panel shows "Logged: {disposition label}" for ~1 second, then advances to next lead | |
| 5e.12 | Counter PATCH failure visibility | If PATCH fails, browser console shows `[PostCallPanel] /api/dialer/call counter PATCH failed` warning | |

---

## 6. Manual Dial Path

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 6.1 | Enter 10-digit number in Manual Dial input | Number formats to `(509) 555-1234` pattern | |
| 6.2 | Click "Dial Now" | Call initiates via POST /api/dialer/call (mode: voip) + Twilio SDK connect | |
| 6.3 | "End" button during call | Terminates call, fires PATCH /api/dialer/call with `disposition: "manual_hangup"` | |
| 6.4 | **KNOWN GAP** | After manual dial ends, NO PostCallPanel appears. No way to log disposition, notes, or next action. The call is effectively invisible to the follow-up system. | |
| 6.5 | "Send Text" from Manual Dial | Opens inline SMS compose; 500 char limit; "Send" fires POST /api/dialer/sms | |
| 6.6 | SMS from lead card | "Text" button opens SMS compose with auto-populated message; fires POST /api/dialer/sms | |
| 6.7 | **KNOWN GAP** | No server-side SMS compliance block for Washington state leads. Product rules say WA follow-up is call-only, but the API does not enforce this. | |

---

## 7. Seller Memory Panel (During Call)

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 7.1 | Panel appears on call start | Right column shows SellerMemoryPanel when `dialerSessionId` exists | |
| 7.2 | Quick stats strip | 3 tiles: Total Calls, Answered, Last contact | |
| 7.3 | Staleness warning | Orange warning if last contact > 21 days ago | |
| 7.4 | Open task banner | Amber banner with promised follow-up title + due datetime (if pending task exists) | |
| 7.5 | Scheduled callback | Cyan banner with next_call_scheduled_at (if set) | |
| 7.6 | Structured memory block | Last call: Promised, Next action, Callback timing, Deal temperature | |
| 7.7 | Open objections | Orange chips with tag + age in days; warn color > 21 days; tooltip shows note | |
| 7.8 | Decision-maker note | Shows with provenance badge (pen = confirmed, sparkle = AI) | |
| 7.9 | Call history (expandable) | Up to 3 calls; header: date, age, dispo, duration, provenance. Body: notes (full opacity if operator, italic 55% if AI) | |
| 7.10 | Qual signals section | Collapsible; shows Motivation dots, Timeline, Route | |
| 7.11 | First-contact empty state | "First contact — no prior history" + TrustLanguagePack with first-call scripts | |
| 7.12 | Panel for lead with rich history | All sections populated; verify data matches what is in Supabase | |

---

## 8. Inbound Call Handling

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 8.1 | Inbound call to Twilio number | TwiML response rings forward to `TWILIO_FORWARD_TO_CELL` | |
| 8.2 | Answered inbound call | dialer_events row: `inbound.answered` with lead_id if phone matches a lead | |
| 8.3 | Missed inbound call | dialer_events row: `inbound.missed`; tasks row: priority-3 callback task created with title "Missed inbound — call back {name}" and due_at = next business morning | |
| 8.4 | War Room missed-inbound queue | Shows missed/unclassified answered calls | |
| 8.5 | **KNOWN GAP** | No operator-facing UI for the inbound classify/commit/transfer pipeline. APIs exist but there is no screen to: review what the inbound caller said, approve a writeback draft, classify caller type, or book a callback from within the dialer. | |
| 8.6 | **KNOWN GAP** | If an inbound call is classified but never committed, no calls_log row is created. The call is invisible to stats and call history. | |

---

## 9. War Room Page

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 9.1 | Navigate to `/dialer/war-room` | Page loads without errors | |
| 9.2 | Overdue alert banner | Shows if overdue tasks exist; links to `/tasks`; count is accurate | |
| 9.3 | Missed Inbound section | Shows if missed/unclassified calls exist | |
| 9.4 | Daily Brief widget | Loads; shows callback slippage, overdue follow-ups, flagged AI issues, top attention leads | |
| 9.5 | Missed Opportunities widget | Loads; shows counts by type (defaulted callbacks, overdue tasks, flagged AI, leakage signals) | |
| 9.6 | Call Quality snapshot | Loads; shows flagged/reviewed/corrected/unreviewed counts; queue of top unreviewed items with deep links | |
| 9.7 | Weekly Discipline table | 4 weeks; columns: Calls, F/U Calls, Tasks, Task rate, No date, Slippage, AI rev, Flagged, Flag rate | |
| 9.8 | Danger highlighting | Red/orange highlight on threshold breaches in weekly table | |
| 9.9 | Action links | All 6 links navigate correctly: Tasks, Leads, Dialer, Inbound, Weekly Review, Pipeline | |
| 9.10 | Header nav buttons | "Weekly Review" → `/dialer/review`; "Dialer" → `/dialer` | |

---

## 10. Weekly Review Page

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 10.1 | Navigate to `/dialer/review` | Page loads without errors | |
| 10.2 | Weekly Discipline table | Full-width with metric glossary | |
| 10.3 | Qual Gaps section | Shows "X of Y live calls incomplete"; per-field counts; per-lead list with "Ask: {question}" hint and link to lead | |
| 10.4 | Objection Patterns section | Bar chart by tag; recent unresolved list with "resolve" button | |
| 10.5 | Resolve button | Fires resolveTag(id); tag status updates to resolved; button disappears or changes state | |
| 10.6 | Contradiction Flags section | Count-by-type chips; recent flag rows with description, date, link | |
| 10.7 | Active Prompt Versions | Shows current prompt versions; link to settings | |
| 10.8 | Voice Policy Ledger | Shows entries for last 14 days | |
| 10.9 | War Room link | Navigates to `/dialer/war-room` | |

---

## 11. Twilio Infrastructure

| # | Test | Expected Result | Status |
|---|------|-----------------|--------|
| 11.1 | Token generation | GET /api/twilio/token returns valid token with VoiceGrant; TTL 1 hour | |
| 11.2 | Token auto-refresh | Token refreshes 3 minutes before expiry (check `tokenWillExpire` event in console) | |
| 11.3 | Browser VoIP TwiML | POST /api/twilio/voice/browser returns TwiML with `<Dial><Number>` to prospect | |
| 11.4 | Call status callback | POST /api/twilio/voice/status fires on call state changes; updates calls_log disposition | |
| 11.5 | Session state sync | Status callback forwards to /api/dialer/v1/twilio/status; session status updates match Twilio lifecycle | |
| 11.6 | "Test Twilio" button | Fires POST /api/dialer/test; diagnostics panel shows PASS/WARN/FAIL for each check | |

---

## 12. Automation Chain Verification

These are behaviors that should happen automatically without operator action.

| # | Automation | Trigger | Expected Behavior | Status |
|---|------------|---------|-------------------|--------|
| 12.1 | Queue auto-loads on page mount | Dialer page loads | First lead in queue selected automatically | |
| 12.2 | Pre-call brief auto-fetches | Lead selected in queue | Brief generated within 2-3 seconds (300ms debounce + API) | |
| 12.3 | Session auto-created on dial | Operator clicks Dial | POST /api/dialer/v1/sessions fires before call connects | |
| 12.4 | Note scaffold auto-seeded on connect | Call state = connected | Missing qual fields appear as prompts in note textarea (once per session) | |
| 12.5 | Live notes auto-update | STT processes audio | Realtime subscription on calls_log delivers new bullets (requires STT configured) | |
| 12.6 | AI extract auto-fires in Step 3 | Operator enters Step 3 (qual confirm) | POST /api/dialer/v1/sessions/{id}/extract fires automatically | |
| 12.7 | AI draft auto-fires in Step 3 | Operator enters Step 3 | POST /api/dialer/v1/sessions/{id}/draft-note fires automatically | |
| 12.8 | Task auto-created on follow_up | Disposition = follow_up or appointment | tasks row created with correct title + due_at | |
| 12.9 | Callback defaulting | follow_up without date | Task created with "(set callback date)" in title; `follow_up.callback_date_defaulted` event logged | |
| 12.10 | Call counter auto-increment | Publish succeeds | `increment_lead_call_counters` RPC fires; total_calls and relevant counters update on leads row | |
| 12.11 | Missed inbound auto-task | Inbound call goes unanswered | Priority-3 callback task created automatically with due = next business morning | |
| 12.12 | Queue auto-advances | Publish succeeds | Next lead in queue selected after 850ms confirmation | |
| 12.13 | Token auto-refresh | Token nearing expiry | New token fetched 3 min before TTL expires | |
| 12.14 | 7-day call sequence routing | PATCH /api/dialer/call with sequence-eligible dispo | Call sequence step increments; if complete without live answer, lead auto-routed to nurture | |

---

## 13. Data Integrity Checks

Run these after completing a full test cycle.

| # | Check | Query / Where to look | Expected | Status |
|---|-------|----------------------|----------|--------|
| 13.1 | No orphaned sessions | `SELECT * FROM call_sessions WHERE status NOT IN ('ended','failed') AND created_at < now() - interval '1 hour'` | 0 rows | |
| 13.2 | Every published call has a dialer_event | `SELECT c.id FROM calls_log c LEFT JOIN dialer_events e ON e.payload->>'calls_log_id' = c.id::text AND e.event_type = 'call.published' WHERE c.disposition NOT IN ('initiating','in_progress','ringing_prospect') AND e.id IS NULL AND c.created_at > now() - interval '1 day'` | 0 rows (all dispositioned calls have a publish event) | |
| 13.3 | Post-call structures match published calls | `SELECT count(*) FROM calls_log c LEFT JOIN post_call_structures p ON p.session_id = c.dialer_session_id WHERE c.dialer_session_id IS NOT NULL AND c.disposition IN ('completed','follow_up','appointment','offer_made','not_interested') AND p.id IS NULL AND c.created_at > now() - interval '1 day'` | 0 rows (every serious call has a structure row) | |
| 13.4 | AI traces have run_ids | `SELECT count(*) FROM dialer_ai_traces WHERE run_id IS NULL AND created_at > now() - interval '1 day'` | 0 rows | |
| 13.5 | No double-counted calls | `SELECT lead_id, count(*) FROM calls_log WHERE created_at > now() - interval '1 day' GROUP BY lead_id, phone_dialed, DATE_TRUNC('minute', started_at) HAVING count(*) > 1` | 0 rows | |
| 13.6 | Tasks have valid due dates | `SELECT * FROM tasks WHERE due_at IS NULL AND status = 'pending' AND created_at > now() - interval '1 day'` | 0 rows (every task has a due date) | |

---

## Known Gaps Summary

These are documented shortcomings — features described in the product vision that do not yet exist or have broken wiring. They are not test failures; they are the backlog.

| # | Gap | Impact | Severity |
|---|-----|--------|----------|
| G1 | Seller memory panel not visible before call starts | Logan cannot see call history, objections, or promises in the pre-call idle state. Must start a call to see context. | HIGH |
| G2 | Manual dial has no post-call path | Calls made via manual number entry are invisible after they end. No disposition, notes, or task creation. Follow-up discipline breaks for any non-queue call. | HIGH |
| G3 | Inbound workflow has no operator surface | APIs for classify/commit/transfer/recover exist but have no UI. Operator sees only a task in the war room. Cannot review inbound details, approve writeback, or book callback from dialer. | HIGH |
| G4 | No live AI assistance during calls | No suggested questions, no live objection prompts, no script overlay during an active call. The seller memory panel is passive history, not active guidance. | MEDIUM |
| G5 | Objection tag chip not auto-selected from AI draft | AI identifies an objection but does not pre-select the matching tag chip. Operator must manually find and select the correct tag. | LOW |
| G6 | QualGapStrip always shows all fields unknown | `qualContext` prop is not passed from dialer page to PostCallPanel, so the strip never reflects actual CRM values. | LOW |
| G7 | No callback booking surface | System creates follow-up tasks but there is no UI to confirm a time with the seller, send confirmation, or manage the callback as a booking. | MEDIUM |
| G8 | SMS has no WA compliance guard | POST /api/dialer/sms does not enforce Washington's call-only follow-up rule at the API level. | MEDIUM |
| G9 | Live transcription is optional and likely unset | `TRANSCRIPTION_WS_URL` controls live STT. If unset (likely), live notes panel is empty. The STT layer the vision depends on is not running. | MEDIUM |
| G10 | No mid-call note-taking with timestamps | Only a single scratch-pad textarea. No timestamped note log, no "save note mid-call" action. Notes only become structured after the call ends. | LOW |

---

## Test Completion Checklist

After running all tests:

- [ ] All PASS items confirmed
- [ ] All FAIL items documented with reproduction steps
- [ ] All BLOCKED items noted with missing configuration
- [ ] Known gaps reviewed and prioritized for next branch
- [ ] Data integrity queries run and results documented
- [ ] Screenshots captured for any unexpected behavior
