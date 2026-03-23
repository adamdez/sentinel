# Dialer Fixes — Cursor Build Spec

## Context

The dialer workspace has several broken or missing features that prevent Logan from working effectively. The backend fixes for speaker diarization (dual Deepgram connections) and strategist throttling (8s cooldown) are already deployed. This spec covers the remaining UI and data flow work.

---

## Fix 1: Live Notes — Show Seller Summaries Only, Not Raw Transcript

**Problem:** Live notes copy every line verbatim from Deepgram. Logan sees 46 raw transcript fragments like "For calling Dominion Homes. This" and "is Jeff, the office assistant." — one sentence per row, piling up every 3 seconds. Unusable.

**Fix:** Show condensed seller-only summaries during the call. Ignore operator speech entirely in the notes display.

### Frontend Changes

**File:** `src/components/sentinel/live-assist-panel.tsx`

The panel currently shows `structuredLiveNotes` (discovery map extractions) and `recentTurns`. Change it to:

1. **Filter recentTurns to seller only** — only show turns where `speaker === "seller"` (channel_index === 1)
2. **Group consecutive seller turns** — if the seller says 3 fragments in a row, combine them into one note
3. **Label clearly** — each note shows "Seller:" prefix in a distinct color

**Display format:**
```
SELLER NOTES (live)
─────────────────────
Seller: "Property has been sitting empty since mom passed.
We've been thinking about selling but haven't done anything yet."

Seller: "I talked to another investor last week but their
offer was too low."
```

**Keep the discovery map** — the structured slots (motivation, timeline, decision maker, etc.) are useful. Show them ABOVE the seller notes. Just remove the raw operator transcript fragments.

### Backend Changes

**File:** `src/app/api/webhooks/deepgram/route.ts`

The webhook already receives `channel_index` from the relay. With the dual-connection fix now deployed:
- `channel_index === 0` → operator (Logan)
- `channel_index === 1` → seller

No backend changes needed — the speaker field is now correctly populated. The frontend just needs to filter.

---

## Fix 2: Post-Call Closeout — Space Bar Not Working

**Problem:** In the post-call structure text inputs, the space bar doesn't work. User can't type spaces in notes.

**Root cause:** Likely a keyboard event handler higher up in the dialer page that captures space bar events (e.g., for play/pause or some hotkey). The post-call inputs don't call `e.stopPropagation()`.

**File:** `src/components/sentinel/post-call-panel.tsx`

**Fix:** Add `onKeyDown={(e) => e.stopPropagation()}` to ALL text inputs and textareas in the post-call panel. This prevents parent keyboard handlers from swallowing the space key.

Search for all `<input` and `<textarea` elements in the file and add the stopPropagation handler.

---

## Fix 3: Qual Checklist Buttons — Make Them Functional

**Problem:** The qual checklist chips (Address, Decision-maker, Timeline, Why selling, Condition, Occupancy, Next step) don't do anything when clicked. They're display-only.

**File:** `src/components/sentinel/post-call-draft-panel.tsx`

**Fix:** Each chip should toggle between "confirmed" (filled, green) and "unknown" (outline, gray). When the closeout is published, the chip states should write to the lead's qualification fields:

| Chip | Maps to lead field |
|------|-------------------|
| Address | `qualification.addressConfirmed` (boolean) |
| Decision-maker | `qualification.decisionMakerConfirmed` |
| Timeline | `qualification.timelineConfirmed` |
| Why selling | `qualification.motivationConfirmed` |
| Condition | `qualification.conditionConfirmed` |
| Occupancy | `qualification.occupancyConfirmed` |
| Next step | `qualification.nextStepConfirmed` |

When published via `/api/dialer/v1/sessions/[id]/publish`, include these boolean fields in the `qualPatch`.

---

## Fix 4: Unlinked Calls — Dialer Sidebar Folder + Auto-Match

**Problem:** Calls that end without a lead attached (`lead_id: null`) disappear — there's nowhere to find them, review notes, or convert them to leads. The post-call closeout silently fails on unlinked calls.

### 4a. Phone Number Auto-Match on Call Connect

**When any call connects (inbound or outbound), immediately look up the phone number:**

1. **Check `leads` table** — `SELECT * FROM leads WHERE owner_phone = $phone LIMIT 5`
   - If exactly 1 match → auto-link session to lead, load full lead context (seller memory, distress tags, property basics, talking points, score) into the dialer workspace. No clicks needed. The lead file auto-deploys.
   - If multiple matches → show a small picker: "Multiple leads match this number:" with name + address for each. Operator clicks to select.

2. **Check `call_sessions` table** — `SELECT * FROM call_sessions WHERE phone_dialed = $phone AND lead_id IS NULL ORDER BY started_at DESC LIMIT 3`
   - If match found → show banner: "This number called before (3/20/26). Previous notes:" with AI summary from that session.

3. **No match** → show "New caller — no history" indicator. Non-blocking.

**API endpoint (already built):** `GET /api/dialer/v1/phone-lookup?phone={number}` — returns matching leads and/or previous unlinked sessions.

### 4b. Unlinked Calls Folder — Lives in the Dialer Sidebar

**Location:** Inside the dialer workspace itself, NOT on the Today page or dashboard. After a call ends, unlinked calls stay visible right where Logan is working. No page navigation required.

**Where in the dialer:** Add a collapsible section in the dialer left sidebar (below the call queue), labeled "Unlinked Calls (N)". Badge count shows how many are pending.

**Data source:** `SELECT cs.id, cs.phone_dialed, cs.started_at, cs.ended_at, cs.status, (SELECT string_agg(sn.content, ' ' ORDER BY sn.created_at) FROM session_notes sn WHERE sn.session_id = cs.id AND sn.note_type = 'transcript_chunk' AND sn.speaker = 'seller' LIMIT 500) as seller_transcript FROM call_sessions cs WHERE cs.lead_id IS NULL AND cs.status = 'ended' ORDER BY cs.started_at DESC LIMIT 50`

**Each unlinked call card shows:**
```
┌─────────────────────────────────────────────────────┐
│ (509) 209-6326          Today 11:17am  ·  4:32      │
│                                                      │
│ AI Summary:                                          │
│ "Seller owns inherited property on N Side near       │
│  Francis/Nevada. 3bd/1.5ba ranch, 1960s build.       │
│  Roof leaking, furnace old. Wife wants it resolved.  │
│  Feels like a burden — wants to close the chapter."  │
│                                                      │
│ Discovery Map:                                       │
│ ● Condition: roof leak, furnace old                  │
│ ● Pain: burden, relief, wife pushing                 │
│ ● Timeline: (not captured)                           │
│ ● Decision: wife involved                            │
│                                                      │
│ [Convert to Lead]  [Link to Existing]  [Delete]      │
└─────────────────────────────────────────────────────┘
```

**Key detail:** The AI summary is generated from seller transcript chunks (not operator speech). If no AI summary exists yet, show the first 3 seller turns concatenated as a preview.

**The discovery map slots from the call session should also display** on each card — showing which slots fired during the call. This gives Logan/Adam a quick picture of what was covered without reading the full transcript.

**Clicking on a card** expands it to show the full seller transcript (grouped into paragraphs, not raw chunks).

**Search bar at top of folder:** Filter by phone number. When a number calls in again, the auto-match (4a) shows the previous unlinked call. But the search bar lets you manually look up past calls too.

**No expiration, no auto-delete.** Cards persist until explicitly dealt with. They stack up — that's the point. Nothing falls through the cracks.

### 4c. Actions on Each Unlinked Call

**"Convert to Lead"** — opens a minimal inline form (NOT a modal, stays in the dialer):
- Phone: pre-filled from caller ID (read-only)
- Name: text input (required)
- Address: text input with autocomplete (optional — if Bricked search is wired, use it)
- Source: auto-set to "inbound_call"
- Distress tags: optional multi-select chips
- On submit:
  1. POST `/api/prospects` to create lead (auto-enrichment fires: county GIS + Bricked if address provided)
  2. PATCH `/api/dialer/v1/sessions/{id}/link` to link session to new lead
  3. All session_notes (transcript, discovery map) carry over to the lead
  4. Seller memory populates immediately from the call data
  5. Card disappears from unlinked folder
  6. Lead appears in Lead Queue under Team Leads (or assigned operator)

**"Link to Existing"** — opens search overlay (reuse the global search component). Search by name, address, or phone. On select:
- PATCH `/api/dialer/v1/sessions/{id}/link` with `{ lead_id: selectedLeadId }`
- Session notes become visible in lead's call history
- Seller memory updates with data from this call
- Card disappears from unlinked folder

**"Delete"** — confirmation dialog: "Delete this call and its notes? This cannot be undone."
- On confirm: DELETE `/api/dialer/v1/sessions/{id}` (deletes session + session_notes)
- Card disappears
- Use for test calls, junk calls, wrong numbers

### 4d. API Endpoints (already built, verify working)

**`GET /api/dialer/v1/phone-lookup`** ✓ Built
```typescript
// Query: ?phone=5092096326
// Returns: { leads: Lead[], unlinkedSessions: CallSession[] }
```

**`PATCH /api/dialer/v1/sessions/[id]/link`** ✓ Built
```typescript
// Body: { lead_id: string }
// Updates call_sessions.lead_id
```

**`DELETE /api/dialer/v1/sessions/[id]`** ✓ Built
```typescript
// Only allows deletion of sessions with lead_id IS NULL (safety)
```

### 4e. Unlinked Calls Folder — API Endpoint Needed

**`GET /api/dialer/v1/sessions/unlinked`** — NEW
```typescript
// Returns all unlinked ended sessions with:
// - session metadata (id, phone_dialed, started_at, duration)
// - AI summary (from session_notes where note_type = 'ai_summary')
// - Seller transcript preview (first 500 chars of seller-only chunks)
// - Discovery map state (from call_sessions.live_coach_state)
// - Count of total notes
// Ordered by started_at DESC
// Limit 50
```

---

## Fix 5: Stop Live Coach Polling After Call Ends

**Problem:** The `useLiveCoach` hook polls `/api/dialer/v1/sessions/{id}/live-assist` every 2.5 seconds and continues after the call ends.

**File:** `src/hooks/use-live-coach.ts`

**Fix:** The hook already has cleanup logic that stops when `enabled` becomes false. Verify that the parent component (dialer workspace) sets `enabled={false}` when:
- Call disposition is set
- Session status changes to "ended"
- User navigates away from the dialer

If the parent doesn't update `enabled`, add a check inside the hook:
```typescript
// If session status is 'ended', stop polling
if (data?.sessionStatus === 'ended') {
  clearInterval(intervalRef.current);
  return;
}
```

---

## Fix 6: Seller Memory Pipeline — Wire Post-Call to Structured Memory

**Problem:** The `post_call_structures` table exists and the seller memory panel reads from it, but nothing reliably writes to it. After 3 calls, seller memory is still empty.

**The data flow that needs to work:**
1. Call ends → transcript exists in `session_notes` (working ✓)
2. Post-call closeout runs → disposition + next action saved (working ✓)
3. **AI extraction runs on the transcript** → extracts promises, objections, temperature, key facts
4. **Writes to `post_call_structures`** → seller memory panel reads this on next call

**File:** `src/app/api/dialer/v1/sessions/[id]/publish/route.ts`

**Fix:** After the publish completes successfully, trigger `runPostCallAnalysis()` using the session's transcript (from `session_notes` WHERE `note_type = 'transcript_chunk'`), NOT from manual operator notes. The transcript always exists if Deepgram was running.

**In `src/lib/dialer/post-call-analysis.ts`:**
- Change the input source from `session_notes WHERE note_type = 'operator_note'` to `session_notes WHERE note_type = 'transcript_chunk' AND speaker = 'seller'`
- This uses the seller's actual words as input for memory extraction
- The AI prompt should extract: promises made (by operator), objections (by seller), deal temperature, key seller statements, timeline mentioned

**Result:** After every published call, `post_call_structures` gets a row with structured memory. Next time the seller memory panel loads for that lead, it shows the recap.

---

## Fix 7: Next Action Redundancy Cleanup

**Problem:** The lead queue shows TWO lines in the Next Action column:
```
Callback in 3d          ← next_action text
Callback scheduled in 3d ← next_call_scheduled_at derived
```
These say nearly the same thing.

**File:** Lead queue row component (likely `src/components/sentinel/leads/lead-table.tsx` or the row sub-component)

**Fix:** Show only the first line (the shorter `next_action` text). Remove the second derived line entirely.

Also: the score badge "33 LOW" overlaps with the next action text. The score column needs `min-width: 90px` or the badge needs to be smaller. *(Note: Cursor may have already fixed this in the latest deploy — verify before changing.)*

---

## Fix 8: Jeff's Messages — Priority Tier in Dialer

**Problem:** When Jeff (Vapi AI receptionist) takes a message because nobody answered in the browser, there is zero indication in Sentinel that a call happened. No notification, no missed call, no message. The caller's info and Jeff's notes vanish.

**What needs to happen:** Jeff's messages are the highest-priority items in the dialer. These are people who called YOU — they're hotter than any outbound lead. They must be impossible to miss.

### 8a. Jeff's Messages Banner — Top of Dialer Sidebar

**Location:** Above the call queue, above the unlinked calls section. This is the first thing Logan or Adam sees when they open the dialer.

**Visual treatment:** Red accent background or red dot badge. Distinct from unlinked calls (which are operator-initiated calls that ended without linking). Jeff's messages are INBOUND calls that went unanswered — higher urgency.

**Label:** `🔴 JEFF'S MESSAGES (N)` — red dot with count, always visible when count > 0.

**Each Jeff message card shows:**
```
┌─────────────────────────────────────────────────────┐
│ 🔴 JEFF'S MESSAGES (1)                              │
│                                                      │
│ (509) 590-7091  ·  2 min ago  ·  Inbound            │
│                                                      │
│ "Seller owns inherited property near Francis/Nevada. │
│  Roof issues, wife wants it resolved. Wants          │
│  callback today."                                    │
│                                                      │
│ Motivation: inherited  ·  Timeline: soon             │
│ Decision: wife involved                              │
│                                                      │
│ [Call Back Now]  [Convert to Lead]  [Dismiss]        │
└─────────────────────────────────────────────────────┘
```

**Data source:** Jeff's messages come from Vapi's `end-of-call-report` webhook. When the call ends, Vapi sends:
- `call.customer.number` — caller's phone number
- `analysis.summary` — Jeff's summary of the conversation
- `analysis.structuredData` — extracted fields (motivation, timeline, decision-maker, etc.)
- `transcript` — full conversation transcript

The webhook handler (`/api/voice/vapi/webhook/route.ts`) already receives this data and writes to `voice_sessions`. The missing piece: it needs to also write a `jeff_message` record that the dialer UI can poll for.

### 8b. Jeff Message Data Model

**New table or flag:** Add a `source` column to `voice_sessions` (or use existing fields) to distinguish Jeff-taken messages from other Vapi calls. Key fields:

```
voice_sessions WHERE assistant_id = jeff_assistant_id AND status = 'ended'
  - caller_phone: from call.customer.number
  - summary: from analysis.summary
  - structured_data: from analysis.structuredData (JSON — motivation, timeline, decision_maker, property_mentioned)
  - transcript: full conversation
  - acknowledged: boolean (false until operator dismisses/acts on it)
  - acknowledged_by: operator who acted on it
  - acknowledged_at: timestamp
```

### 8c. Jeff Message Actions

**"Call Back Now"** — dials the caller's number immediately in the browser dialer. When the call connects:
- Jeff's summary displays as pre-call brief
- Auto-creates an unlinked session with the caller's phone
- If the operator converts to lead after the callback, Jeff's original notes carry over

**"Convert to Lead"** — same inline form as unlinked calls (phone pre-filled, name/address inputs). On submit:
- Creates lead via POST `/api/prospects` (auto-enrichment fires)
- Links Jeff's voice_session to the new lead
- Jeff's summary becomes the first entry in seller memory
- Card disappears from Jeff's Messages, lead appears in queue

**"Dismiss"** — marks `acknowledged = true`. Card disappears. Use for junk calls, wrong numbers, or calls already handled another way. No confirmation dialog needed — dismissing is soft (the data stays, just hidden from the active view).

### 8d. Routing — Logan vs Adam

**Default:** Jeff's messages go to Logan's dialer (he's the acquisitions manager).

**Exception:** If Jeff detected a request for Adam specifically (e.g., caller says "I need to talk to Adam" or "the manager"), route to Adam's dialer instead.

**Detection:** Check `analysis.summary` or `transcript` for Adam/management references. Simple string match is fine — no AI needed for this.

**Fallback:** If Jeff's structured data includes a `route_to` field (which we can add to Jeff's Vapi assistant config), use that. Otherwise default to Logan.

### 8e. API Endpoint Needed

**`GET /api/dialer/v1/jeff-messages`** — NEW
```typescript
// Returns all unacknowledged Jeff messages for the current operator
// Query: ?operator=logan@dominionhomedeals.com (or infer from session)
// Returns: voice_sessions WHERE assistant_id = jeff_id AND acknowledged = false
// Fields: id, caller_phone, summary, structured_data, created_at, duration
// Ordered by created_at DESC
```

**`PATCH /api/dialer/v1/jeff-messages/[id]/acknowledge`** — NEW
```typescript
// Body: { action: 'dismissed' | 'called_back' | 'converted_to_lead', lead_id?: string }
// Sets acknowledged = true, acknowledged_by, acknowledged_at
```

### 8f. Polling / Real-time

The dialer should poll `GET /api/dialer/v1/jeff-messages` every 15 seconds while the dialer page is open. When a new message appears:
- The `🔴 JEFF'S MESSAGES` badge count increments
- A browser notification fires (if permissions granted): "Jeff took a message from (509) 590-7091"
- Optional: play a subtle audio chime

---

## Fix 9: Inbound Calls Ring Browser — No Cell Phones

**Problem:** When someone calls the Sentinel number, the dialer doesn't ring. Calls forward to cell phones (Logan → Adam → Jeff). The browser-based dialer has zero inbound call capability.

**What needs to happen:** Inbound calls ring in the Sentinel dialer browser first. Cell phones are removed from the call chain entirely.

### 9a. Inbound Call Chain (new)

```
Inbound call → Twilio
  → Ring Logan's browser (identity: logan@dominionhomedeals.com) for 20s
  → If no answer → Ring Adam's browser (identity: adam@dominionhomedeals.com) for 20s
  → If no answer → Transfer to Jeff (Vapi AI receptionist)
  → Jeff takes message → Message appears in dialer as Fix 8 above
```

**No cell phones in the chain. Period.**

### 9b. Twilio Inbound Webhook Changes

**File:** `src/app/api/twilio/inbound/route.ts`

Change the TwiML response from:
```xml
<Response>
  <Dial timeout="20"><Number>+15098225460</Number></Dial>
  <Dial timeout="20"><Number>+15099921136</Number></Dial>
  <Redirect>/api/voice/vapi/...</Redirect>
</Response>
```

To:
```xml
<Response>
  <Dial timeout="20">
    <Client>logan@dominionhomedeals.com</Client>
  </Dial>
  <Dial timeout="20">
    <Client>adam@dominionhomedeals.com</Client>
  </Dial>
  <Redirect>/api/voice/vapi/transfer</Redirect>
</Response>
```

The `<Client>` tag rings the Twilio Client SDK in the browser instead of a phone number.

### 9c. Browser Incoming Call Handler

**File:** `src/app/(sentinel)/dialer/page.tsx` (or the Twilio device hook)

When the Twilio Device receives an incoming call:

1. **Full-screen ring overlay** — covers the dialer workspace with:
   - Caller's phone number (large text)
   - Auto-match result: "Known lead: Vick Eric — 2406 S Pines Rd" or "Previous caller — Jeff took a message 3 days ago" or "Unknown caller"
   - **[Answer]** button (green, large)
   - **[Decline]** button (red, smaller — lets it fall through to next in chain)
   - Ring audio plays in browser

2. **On Answer:**
   - Call connects in browser via Twilio Client
   - If matched to a lead → auto-deploy lead context (seller memory, distress, property, score)
   - If matched to previous Jeff message → show Jeff's summary as pre-call brief
   - If unknown → show blank context, session is unlinked

3. **On Decline or Timeout (20s):**
   - Overlay disappears
   - Call falls through to next in chain (Adam, then Jeff)
   - A "Missed Call" indicator appears in the dialer sidebar: "(509) 590-7091 — missed 30s ago"

### 9d. Missed Call Indicators

If an inbound call rings the browser but isn't answered (declined or timed out), show a missed call entry in the dialer sidebar:

```
MISSED CALLS (1)
─────────────────
(509) 590-7091  ·  3 min ago
Went to: Adam's browser → Jeff
[Call Back]
```

These persist until the call is returned or Jeff's message is handled.

### 9e. Twilio Client Token — Identity Setup

**File:** `src/app/api/twilio/token/route.ts`

The token endpoint already generates Twilio Client capability tokens. Verify it sets the identity to the operator's email:
```typescript
const identity = session.user.email; // logan@dominionhomedeals.com or adam@dominionhomedeals.com
const grant = new VoiceGrant({
  outgoingApplicationSid: twimlAppSid,
  incomingAllow: true, // THIS IS THE KEY — must be true for inbound
});
```

If `incomingAllow` is not set to `true`, the browser device will never receive incoming calls.

---

## Summary of All Files to Touch

| File | Fix | Priority | Status |
|------|-----|----------|--------|
| `src/components/sentinel/live-assist-panel.tsx` | Filter to seller-only notes, group fragments | P0 | ✅ Done |
| `src/components/sentinel/post-call-panel.tsx` | Add `e.stopPropagation()` to all inputs for spacebar fix | P0 | ✅ Done |
| `src/components/sentinel/post-call-draft-panel.tsx` | Make qual chips toggle + write to lead fields | P1 | ✅ Done |
| `src/hooks/use-live-coach.ts` | Stop polling when session ends | P0 | ✅ Done (was already correct) |
| `src/app/api/dialer/v1/phone-lookup/route.ts` | Phone number lookup against leads + sessions | P0 | ✅ Done |
| `src/app/api/dialer/v1/sessions/[id]/link/route.ts` | Link session to lead | P1 | ✅ Done |
| `src/app/api/dialer/v1/sessions/[id]/route.ts` | DELETE for trashing test calls | P1 | ✅ Done |
| `src/lib/dialer/post-call-analysis.ts` | Seller-only transcript for memory extraction | P1 | ✅ Done |
| `src/lib/dialer/live-coach-service.ts` | Expanded detection patterns (38 → 95 rules) | P0 | ✅ Done |
| Lead queue row component | Remove redundant next action line | P2 | ✅ Done |
| Dialer workspace — auto-match on connect | Phone match → auto-deploy lead file | P0 | ✅ Done |
| **Dialer sidebar — Unlinked Calls folder** | **Collapsible folder showing unlinked calls with AI summary, discovery map, Convert/Link/Delete actions** | **P0** | **TODO** |
| **`src/app/api/dialer/v1/sessions/unlinked/route.ts`** | **NEW — fetch all unlinked ended sessions with summaries** | **P0** | **TODO** |
| **Dialer sidebar — search bar** | **Filter unlinked calls by phone number** | **P1** | **TODO** |
| **Dialer sidebar — Jeff's Messages banner** | **Red-dot priority section above unlinked calls, with Call Back / Convert / Dismiss** | **P0** | **TODO** |
| **`src/app/api/dialer/v1/jeff-messages/route.ts`** | **NEW — fetch unacknowledged Jeff messages for current operator** | **P0** | **TODO** |
| **`src/app/api/dialer/v1/jeff-messages/[id]/acknowledge/route.ts`** | **NEW — mark Jeff message as acted on** | **P1** | **TODO** |
| **`src/app/api/twilio/inbound/route.ts`** | **Change `<Number>` to `<Client>` for browser ringing, remove cell phones** | **P0** | **TODO** |
| **Dialer page — incoming call overlay** | **Full-screen ring UI with caller info, Answer/Decline, auto-match** | **P0** | **TODO** |
| **Dialer sidebar — missed calls indicator** | **Show missed inbound calls with Call Back action** | **P1** | **TODO** |
| **`src/app/api/twilio/token/route.ts`** | **Verify `incomingAllow: true` for browser inbound** | **P0** | **TODO** |

---

## Verification Checklist

### Live Notes
- [ ] During a call, only seller speech appears in notes (no operator fragments)
- [ ] Consecutive seller fragments are grouped into readable paragraphs
- [ ] Discovery map slots still update correctly
- [ ] Notes stop updating after call ends

### Post-Call Closeout
- [ ] Space bar works in all text inputs
- [ ] Qual checklist chips toggle on click (confirmed ↔ unknown)
- [ ] Chip states persist through publish to lead qualification fields

### Unlinked Calls Folder (in Dialer Sidebar)
- [ ] Collapsible "Unlinked Calls (N)" section visible in dialer sidebar
- [ ] Badge count updates in real-time as calls end without linking
- [ ] Each card shows: phone, date, duration, AI summary, discovery map slots
- [ ] Clicking a card expands to show full seller transcript
- [ ] "Convert to Lead" opens inline form, creates lead + links + triggers enrichment
- [ ] "Link to Existing" opens search, links session, updates seller memory
- [ ] "Delete" removes session + notes after confirmation
- [ ] Search bar at top filters by phone number
- [ ] Cards persist until explicitly dealt with — no auto-delete
- [ ] After converting/linking, card disappears and lead appears in queue

### Phone Auto-Match
- [ ] Known lead calling in → lead file auto-deploys in dialer (seller memory, distress, property, score)
- [ ] Previous unlinked caller → shows past notes banner
- [ ] New caller → shows "New caller" indicator
- [ ] Multiple lead matches → shows picker

### Seller Memory Pipeline
- [ ] After publishing a call, `post_call_structures` gets a new row
- [ ] Next time that lead's seller memory panel loads, it shows the recap
- [ ] Memory shows: promises, objections, temperature, key statements

### Polling
- [ ] Live coach polling stops within 5 seconds of call ending
- [ ] No continued API calls to live-assist after session status = "ended"

### Jeff's Messages (Fix 8)
- [ ] Jeff's Messages section visible at TOP of dialer sidebar (above unlinked calls)
- [ ] Red dot badge with count when unacknowledged messages exist
- [ ] Each card shows: caller phone, time, Jeff's summary, extracted motivation/timeline/decision-maker
- [ ] "Call Back Now" dials caller in browser, shows Jeff's notes as pre-call brief
- [ ] "Convert to Lead" creates lead with Jeff's notes as first seller memory entry
- [ ] "Dismiss" hides the card (soft delete — data retained)
- [ ] Messages route to Logan by default, Adam if caller specifically requested management
- [ ] Browser notification fires when new Jeff message arrives
- [ ] Polling every 15 seconds for new messages

### Inbound Browser Ringing (Fix 9)
- [ ] Inbound call rings Logan's browser for 20s (no cell phone)
- [ ] If Logan doesn't answer → rings Adam's browser for 20s (no cell phone)
- [ ] If Adam doesn't answer → transfers to Jeff (Vapi)
- [ ] Full-screen ring overlay shows caller phone + auto-match result
- [ ] Answer button connects call in browser
- [ ] Decline button lets call fall through to next in chain
- [ ] Known lead auto-deploys context on answer (seller memory, distress, property)
- [ ] Previous Jeff message caller shows Jeff's summary on answer
- [ ] Missed call indicator appears in sidebar after timeout/decline
- [ ] `incomingAllow: true` set in Twilio token grant
- [ ] Zero cell phone numbers in the inbound call chain
