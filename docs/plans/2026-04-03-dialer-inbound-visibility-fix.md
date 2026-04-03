# Dialer Inbound Visibility Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make inbound calls, missed calls, and caller identity visible in the Sentinel dialer — scoreboard, history, missed queue, and briefs.

**Architecture:** Five backend fixes (calls_log writeback, KPI counting, event writes) and three frontend fixes (history direction, scoreboard scope, brief fallback). Each task is independent and can be committed separately.

**Tech Stack:** Next.js API routes, Supabase postgres, React hooks, Twilio webhooks

---

## Root Cause Summary

| Symptom | Root Cause |
|---------|-----------|
| Scoreboard MISSED CALLS = 0 | Inbound calls assigned to Logan's user_id; scoreboard shows only current user's metrics. Also, many inbound calls stuck as `in_progress` — never counted as missed |
| History shows no inbound | `use-call-history.ts` re-derives direction from disposition set that doesn't match actual inbound dispositions (`no_answer`, `in_progress`). Ignores the correct `direction` column in DB |
| MissedInboundQueue empty | `handleMissedInbound` writes `inbound.missed` events correctly but may not fire for all missed paths. 0 events in DB despite 9+ missed inbound calls |
| Brief unavailable (404) | Most inbound `calls_log` entries have `lead_id: null`. Brief API returns 404 when lead not found. No phone-to-lead fallback |
| 29 calls stuck `in_progress` | Neither `handleAnsweredInbound` nor `handleMissedInbound` updates `calls_log` disposition. Only outbound calls get status writeback |

---

### Task 1: Fix calls_log writeback for inbound calls

**Files:**
- Modify: `src/app/api/twilio/inbound/route.ts` — `handleAnsweredInbound()` (~line 665) and `handleMissedInbound()` (~line 571)

**Step 1: Add calls_log update to handleAnsweredInbound**

In `handleAnsweredInbound()`, after the `dialer_events` insert (line 699), add:

```typescript
  // ── Update calls_log disposition from in_progress → completed ──────────
  const durationSec = dialDuration ? parseInt(dialDuration) : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: logErr } = await (sb.from("calls_log") as any)
    .update({
      disposition: "completed",
      duration_sec: durationSec,
      lead_id: leadId,  // backfill if phone lookup matched
    })
    .eq("twilio_sid", callSid)
    .eq("direction", "inbound")
    .in("disposition", ["in_progress", "initiating", "ringing_prospect"]);

  if (logErr) {
    console.error("[inbound] calls_log answered update failed:", logErr.message);
  }
```

**Step 2: Add calls_log update to handleMissedInbound**

In `handleMissedInbound()`, after the `dialer_events` insert (line 631), add:

```typescript
  // ── Update calls_log disposition from in_progress → missed ─────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: logErr } = await (sb.from("calls_log") as any)
    .update({
      disposition: "missed",
      lead_id: leadId,  // backfill if phone lookup matched
    })
    .eq("twilio_sid", callSid)
    .eq("direction", "inbound")
    .in("disposition", ["in_progress", "initiating", "ringing_prospect"]);

  if (logErr) {
    console.error("[inbound] calls_log missed update failed:", logErr.message);
  }
```

**Step 3: Verify by checking the Twilio SID lookup works**

Run: `grep -n "twilio_sid" src/db/calls-log-table.sql` to confirm the column exists.

**Step 4: Commit**

```bash
git add src/app/api/twilio/inbound/route.ts
git commit -m "Fix inbound calls_log writeback: update disposition on answer/miss"
```

---

### Task 2: Fix call history direction derivation

**Files:**
- Modify: `src/hooks/use-call-history.ts`

**Step 1: Add direction to the Supabase select and use DB column**

Replace the `INBOUND_DISPOSITIONS` set usage. The `calls_log` table already has a `direction` column set correctly. The hook should use it instead of guessing from disposition.

At line 38, add `direction` to the select (it's already fetched via `*`-style but let's be explicit). The key fix is lines 79 and 101.

Replace line 79 (fallback path):
```typescript
// OLD:
direction: INBOUND_DISPOSITIONS.has(r.disposition as string) ? "inbound" : "outbound",
// NEW:
direction: (r.direction === "inbound" ? "inbound" : "outbound") as "inbound" | "outbound",
```

Replace line 101 (main path):
```typescript
// OLD:
direction: INBOUND_DISPOSITIONS.has(r.disposition) ? "inbound" as const : "outbound" as const,
// NEW:
direction: (r.direction === "inbound" ? "inbound" : "outbound") as "inbound" | "outbound",
```

Add `direction` to the fallback select at line 67:
```typescript
// OLD:
.select("id, phone_dialed, disposition, duration_sec, started_at, ended_at, notes, ai_summary, lead_id")
// NEW:
.select("id, phone_dialed, disposition, duration_sec, started_at, ended_at, notes, ai_summary, lead_id, direction")
```

The `INBOUND_DISPOSITIONS` const can be removed (dead code after this change).

**Step 2: Commit**

```bash
git add src/hooks/use-call-history.ts
git commit -m "Fix call history: use DB direction column instead of disposition guess"
```

---

### Task 3: Fix scoreboard to show inbound/missed for all users

**Files:**
- Modify: `src/lib/dialer-kpis.ts` — `aggregateDialerKpis()` and `MISSED_INBOUND_DISPOSITIONS`

**Step 1: Add "missed" to MISSED_INBOUND_DISPOSITIONS**

Line 47 — the `handleMissedInbound` function now writes `disposition: "missed"` (from Task 1). Add it to the set:

```typescript
// OLD:
const MISSED_INBOUND_DISPOSITIONS = new Set(["no_answer", "missed", "busy"]);
// NEW:
const MISSED_INBOUND_DISPOSITIONS = new Set(["no_answer", "missed", "busy", "canceled"]);
```

**Step 2: Count inbound/missed as team-wide (not per-user)**

In `aggregateDialerKpis()` (line 248-279), inbound calls are counted per-user. But inbound calls ring everyone — they shouldn't be attributed to one person's scoreboard. The fix: count inbound and missed for the current user regardless of assignment.

Replace lines 266-274:

```typescript
    if (isInboundCall(call)) {
      // Inbound calls are shared — count for current user regardless of assignment
      metrics.inbound.user += 1;
      if (isTeam) metrics.inbound.team += 1;
    }

    if (isMissedInboundCall(call)) {
      // Missed inbound calls are shared — everyone should see them
      metrics.missedCalls.user += 1;
      if (isTeam) metrics.missedCalls.team += 1;
    }
```

**Step 3: Commit**

```bash
git add src/lib/dialer-kpis.ts
git commit -m "Fix scoreboard: count inbound/missed for all users, add canceled disposition"
```

---

### Task 4: Fix KPI route to include inbound calls for all users

**Files:**
- Modify: `src/app/api/dialer/v1/kpis/route.ts`

**Step 1: Read the current query to understand how calls are fetched**

The KPI route queries `calls_log` with date filters. Confirm it fetches ALL calls (not just the current user's). The aggregation function handles per-user filtering, so the route must fetch team-wide.

Read the file and verify the query does NOT filter by `user_id`. If it does, remove that filter for direction='inbound' rows, or fetch all and let the aggregator handle it.

**Step 2: Commit if changes needed**

```bash
git add src/app/api/dialer/v1/kpis/route.ts
git commit -m "Fix KPI route: include all inbound calls regardless of assigned user"
```

---

### Task 5: Fix pre-call brief phone-to-lead fallback

**Files:**
- Modify: `src/app/api/dialer/v1/pre-call-brief/route.ts`
- Modify: `src/hooks/use-pre-call-brief.ts`

**Step 1: Add phone-based lead lookup fallback in the API route**

In the brief API route, when `leadId` lookup returns no lead, fall back to searching by phone number via the contacts/properties tables. Find the section where it returns 404 (around line 280-290) and add:

```typescript
  // If leadId provided but no lead found, try phone lookup
  if (!lead && phoneNumber) {
    const { unifiedPhoneLookup } = await import("@/lib/dialer/phone-lookup");
    const match = await unifiedPhoneLookup(phoneNumber, sb);
    if (match.leadId) {
      // Re-fetch lead with the matched ID
      const { data: phoneLead } = await sb.from("leads").select("*").eq("id", match.leadId).single();
      if (phoneLead) lead = phoneLead;
    }
  }

  // If still no lead, return a minimal brief instead of 404
  if (!lead) {
    return NextResponse.json({
      bullets: [`Unknown caller: ${phoneNumber || "no number"}`],
      suggestedOpener: "Hi, this is Logan with Dominion Home Deals. I see you called us — how can I help?",
      currentStage: "unknown",
      stageReason: "No lead record found for this caller",
      primaryGoal: "Identify caller and their property situation",
      talkingPoints: ["Ask about their property", "Ask what prompted their call"],
      nextQuestions: ["What property are you calling about?", "Are you the owner?"],
      empathyMoves: [],
      objectionHandling: [],
      watchOuts: ["Unknown caller — may be spam, vendor, or new seller"],
      riskFlags: ["No lead record — create one if legitimate"],
      _promptVersion: "fallback-no-lead",
      _provider: "system",
      _model: "none",
    });
  }
```

**Step 2: Update the hook to pass phone number**

In `use-pre-call-brief.ts`, ensure the POST body includes `phoneNumber` alongside `leadId`:

```typescript
body: JSON.stringify({ leadId, phoneNumber }),
```

**Step 3: Commit**

```bash
git add src/app/api/dialer/v1/pre-call-brief/route.ts src/hooks/use-pre-call-brief.ts
git commit -m "Fix brief API: phone-to-lead fallback instead of 404 for unknown callers"
```

---

### Task 6: Backfill stuck in_progress inbound calls

**Files:**
- None (SQL migration)

**Step 1: Run SQL to fix historical data**

```sql
-- Backfill: inbound calls stuck as in_progress older than 1 hour are missed
UPDATE calls_log
SET disposition = 'missed'
WHERE direction = 'inbound'
  AND disposition = 'in_progress'
  AND started_at < NOW() - INTERVAL '1 hour';
```

**Step 2: Verify**

```sql
SELECT disposition, count(*) FROM calls_log
WHERE direction = 'inbound'
GROUP BY disposition;
```

Expected: 0 rows with `in_progress` older than 1 hour.

**Step 3: Commit migration file**

```bash
echo "-- Backfill stuck inbound calls" > src/db/migrations/2026-04-03-backfill-inbound-dispositions.sql
git add src/db/migrations/
git commit -m "Backfill: resolve 29 inbound calls stuck as in_progress → missed"
```

---

### Task 7: Verify MissedInboundQueue widget is on dialer page

**Files:**
- Modify: `src/app/(sentinel)/dialer/page.tsx` (if needed)

**Step 1: Check if MissedInboundQueue is rendered on the dialer page**

Search for `MissedInboundQueue` or `missed-inbound-queue` import in the dialer page. If it's only on the dashboard, add it to the dialer page — either as a collapsible panel above the scoreboard or as a fourth tab in the right panel.

**Step 2: If not present, add it**

Add import at top of dialer page:
```typescript
import { MissedInboundQueue } from "@/components/sentinel/dashboard/widgets/missed-inbound-queue";
```

Add a "Missed" tab to the right panel tabs (line 4141):
```typescript
{ key: "missed" as const, label: "Missed" },
{ key: "history" as const, label: "History" },
{ key: "jeff" as const, label: "Jeff" },
{ key: "sms" as const, label: "SMS" },
```

Update the tab type to include `"missed"`, and add the render case:
```typescript
{idleRailTab === "missed" && <MissedInboundQueue />}
```

**Step 3: Commit**

```bash
git add src/app/\(sentinel\)/dialer/page.tsx
git commit -m "Add Missed tab to dialer right panel with MissedInboundQueue widget"
```

---

## Execution Order

Tasks 1-3 are the critical path (fix the data pipeline). Tasks 4-7 are polish.

1. **Task 1** — calls_log writeback (fixes the root data problem)
2. **Task 2** — history direction (instant UI fix)
3. **Task 3** — scoreboard counting (instant UI fix)
4. **Task 6** — backfill historical data (cleanup)
5. **Task 4** — KPI route check
6. **Task 5** — brief fallback
7. **Task 7** — missed tab on dialer

After all tasks, push to main and verify the Vercel deployment succeeds.
