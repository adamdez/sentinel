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

## Fix 4: Unlinked Calls Inbox

**Problem:** Calls that start without a lead attached (`lead_id: null`) lose their notes — there's nowhere to save follow-ups, and the post-call closeout silently fails.

### 4a. Phone Number Auto-Match on Call Connect

**When any call connects (inbound or outbound), immediately look up the phone number:**

1. **Check `leads` table** — `SELECT * FROM leads WHERE owner_phone = $phone LIMIT 5`
   - If exactly 1 match → auto-link session to lead, load full lead context (seller memory, distress tags, property basics, talking points, score) into the dialer workspace. No clicks needed.
   - If multiple matches → show a small picker: "Multiple leads match this number:" with name + address for each. Operator clicks to select.

2. **Check `call_sessions` table** — `SELECT * FROM call_sessions WHERE phone_dialed = $phone AND lead_id IS NULL ORDER BY started_at DESC LIMIT 3`
   - If match found → show banner: "This number called before (3/20/26). Previous notes:" with AI summary from that session.

3. **No match** → show "New caller — no history" indicator. Non-blocking.

**File for auto-match:** The dialer workspace component (wherever the call connect event is handled). Add a `useEffect` or callback that fires on call connect, queries the phone number, and populates context.

**API endpoint needed:** `GET /api/dialer/v1/phone-lookup?phone={number}` — returns matching leads and/or previous unlinked sessions.

### 4b. Unlinked Calls Section

**Location:** Add a section to the "Today" page (`src/app/(app)/today/page.tsx` or equivalent).

**Data source:** `SELECT cs.*, (SELECT content FROM session_notes sn WHERE sn.session_id = cs.id AND sn.note_type = 'ai_summary' LIMIT 1) as summary FROM call_sessions cs WHERE cs.lead_id IS NULL AND cs.status = 'ended' ORDER BY cs.started_at DESC`

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  UNLINKED CALLS (3)                        [Search by phone] │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ (509) 209-6326  ·  Today 11:17am  ·  4:32  ·  Inbound │  │
│  │ "Caller asked about selling inherited property on      │  │
│  │  E 5th Ave. Wants to know timeline and process."       │  │
│  │ [Link to Lead]  [Create Lead]  [🗑 Delete]             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ (641) 832-7926  ·  Today 10:45am  ·  0:45  ·  Test    │  │
│  │ "Test call — system check with Jeff."                  │  │
│  │ [Link to Lead]  [Create Lead]  [🗑 Delete]             │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Search bar:** Filter unlinked calls by phone number. Useful when a number calls back and operator wants to find the previous call.

**Actions:**

**"Link to Lead"** — opens search overlay (reuse the global search / command palette component). Search by name, address, or phone. On select:
- PATCH `/api/dialer/v1/sessions/{id}/link` with `{ lead_id: selectedLeadId }`
- Session's `lead_id` updated in DB
- Session notes become visible in lead's call history
- Card disappears from unlinked inbox

**"Create Lead"** — opens minimal form:
- Phone: pre-filled from caller ID (read-only)
- Name: text input (required)
- Address: text input (optional)
- Source: auto-set to "inbound_call"
- On submit: POST `/api/prospects` to create lead, then PATCH session to link
- Card moves from unlinked inbox to Lead Queue

**"Delete"** — confirmation dialog: "Delete this call and its notes? This cannot be undone."
- On confirm: DELETE `/api/dialer/v1/sessions/{id}` (deletes session + session_notes)
- Card disappears

### 4c. API Endpoints Needed

**`GET /api/dialer/v1/phone-lookup`**
```typescript
// Query: ?phone=5092096326
// Returns: { leads: Lead[], unlinkedSessions: CallSession[] }
// Searches leads.owner_phone and call_sessions.phone_dialed
```

**`PATCH /api/dialer/v1/sessions/[id]/link`**
```typescript
// Body: { lead_id: string }
// Updates call_sessions.lead_id
// Also updates any session_notes to be associated
// Returns: { success: true }
```

**`DELETE /api/dialer/v1/sessions/[id]`**
```typescript
// Deletes call_sessions row + all session_notes for that session
// Only allows deletion of sessions with lead_id IS NULL (safety)
// Returns: { success: true }
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

## Summary of All Files to Touch

| File | Fix | Priority |
|------|-----|----------|
| `src/components/sentinel/live-assist-panel.tsx` | Filter to seller-only notes, group fragments | P0 |
| `src/components/sentinel/post-call-panel.tsx` | Add `e.stopPropagation()` to all inputs for spacebar fix | P0 |
| `src/components/sentinel/post-call-draft-panel.tsx` | Make qual chips toggle + write to lead fields | P1 |
| `src/hooks/use-live-coach.ts` | Stop polling when session ends | P0 |
| `src/app/(app)/today/page.tsx` | Add Unlinked Calls inbox section | P1 |
| `src/app/api/dialer/v1/phone-lookup/route.ts` | NEW — phone number lookup against leads + sessions | P0 |
| `src/app/api/dialer/v1/sessions/[id]/link/route.ts` | NEW — link session to lead | P1 |
| `src/app/api/dialer/v1/sessions/[id]/route.ts` | Add DELETE for trashing test calls | P1 |
| Dialer workspace component | Auto-match phone on connect, show lead context | P0 |
| `src/app/api/dialer/v1/sessions/[id]/publish/route.ts` | Trigger post-call analysis from transcript | P1 |
| `src/lib/dialer/post-call-analysis.ts` | Read seller transcript chunks instead of manual notes | P1 |
| Lead queue row component | Remove redundant next action line (verify if already done) | P2 |

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

### Unlinked Calls
- [ ] Calls without lead_id appear in Unlinked Calls inbox on Today page
- [ ] Each card shows phone, date, duration, AI summary
- [ ] "Link to Lead" opens search, links session on select
- [ ] "Create Lead" creates lead + links session
- [ ] "Delete" removes session + notes after confirmation
- [ ] Search bar filters by phone number

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
