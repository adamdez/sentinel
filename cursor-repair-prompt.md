# Sentinel Codebase Repair — Full Audit Fix Prompt

You are working on **Sentinel**, a wholesale real estate acquisition ERP built with Next.js 15, React 19, TypeScript, Supabase, Tailwind CSS v4, Zustand, and TanStack React Query. The repo root is the current working directory.

A full codebase audit has been completed. Below are ALL issues found, grouped by priority. Fix every issue listed. Do NOT skip any. Do NOT add new features — only repair what's broken. Preserve the existing dark glassmorphism "Obsidian Abyss AI Ultra" aesthetic. Preserve all existing working functionality.

**Critical rules:**
- All database writes MUST go through API routes using `createServerClient()` (service role key, bypasses RLS). Never do client-side Supabase inserts.
- `distress_events`, `scoring_records`, and `event_log` are append-only tables with DB triggers preventing UPDATE/DELETE. Never attempt to mutate them.
- APN + County is the unique property identity. All property upserts use `ON CONFLICT (apn, county) DO UPDATE`.
- Scoring must remain deterministic and versioned.

---

## GROUP 1: RUNTIME CRASHES (fix these first)

### 1.1 — `src/app/api/ingest/propertyradar/top10/route.ts` ~line 428
**Bug:** The variable `inserted` is referenced but never declared. This will throw a `ReferenceError` on any request to this endpoint.
**Fix:** Find where `inserted` is used and either declare it properly from the Supabase upsert result, or replace the reference with the correct variable name from the surrounding upsert logic. Look at how similar upserts work in `src/app/api/ingest/propertyradar/route.ts` for the correct pattern.

### 1.2 — `src/app/api/ranger-push/route.ts` ~lines 109, 131
**Bug:** `distressFingerprint` and `isDuplicateError` are referenced but never imported or defined. This will throw a `ReferenceError` when a Dominion push arrives.
**Fix:** Import or define these functions. `distressFingerprint` should come from `src/lib/dedup.ts` (check what's exported there). `isDuplicateError` should be a helper that checks if a Supabase error is a unique constraint violation (error code `23505`). If `dedup.ts` doesn't export these, implement them inline:
- `distressFingerprint(propertyId, eventType, source)` → SHA-256 hash string
- `isDuplicateError(error)` → checks `error.code === '23505'`

---

## GROUP 2: ACTUAL BUGS IN FUNCTIONAL FEATURES

### 2.1 — `src/app/(sentinel)/sales-funnel/prospects/page.tsx` ~line 180
**Bug:** `handleClaim` uses a hardcoded user ID `"c0b4d733-607b-4c3c-8049-9e4ba207a258"` instead of the actual logged-in user.
**Fix:** The component already has access to the Zustand store. Use `currentUser.id` (or however the store exposes the user) instead of the hardcoded UUID.

### 2.2 — `src/app/(sentinel)/sales-funnel/prospects/page.tsx` ~line 191
**Bug:** The claim update sets `owner_id` but the `leads` table column is `assigned_to`.
**Fix:** Change `owner_id: userId` to `assigned_to: userId` in the Supabase update call.

### 2.3 — `src/components/sentinel/pipeline-board.tsx` ~line 172
**Bug:** `handleDragEnd` only reorders items in the array but never updates the `status` field when dragging between columns. Cards visually snap back to their original column.
**Fix:** In `handleDragEnd`, detect which column the item was dropped into (from the `destination.droppableId`) and update the item's `status` to match that column. The columns map to: `"prospect"`, `"lead"`, `"negotiation"`, `"disposition"`, `"nurture"`, `"dead"`, `"closed"`. Also persist the status change to Supabase via a PATCH to `/api/prospects` or a direct server call.

### 2.4 — `src/app/(sentinel)/analytics/page.tsx` ~lines 27-38
**Bug:** The `KPIConfig` interface requires `glowColor: string` but none of the 10 KPI card objects in the `KPI_CARDS` array provide it. This causes `undefined` to be passed to `style={{ background: card.glowColor }}`.
**Fix:** Either add a `glowColor` value to each KPI card object (use colors from the design system — cyan `#00d4ff`, purple `#a855f7`, neon `#00ff88`, orange `#ff6b35` as appropriate), OR make `glowColor` optional in the interface and add a fallback in the JSX: `background: card.glowColor ?? 'rgba(0, 212, 255, 0.1)'`.

### 2.5 — `src/app/(sentinel)/dialer/page.tsx` ~line 236
**Bug:** Same issue — `s.glowColor` is accessed on stat card objects that don't have a `glowColor` property. The objects only have `label`, `value`, `icon`, and `color`.
**Fix:** Either add `glowColor` to each stat card object, or use the existing `color` property as the fallback: `background: s.glowColor ?? s.color`.

### 2.6 — `src/lib/types.ts` — LeadStatus union
**Bug:** `"my_lead"` is used in the app for claimed leads but is not in the `LeadStatus` union type. This breaks status transition validation.
**Fix:** Check the `LeadStatus` type definition and the `lead_status` enum in `src/db/schema.ts`. If `"my_lead"` is a UI-only concept (a filter for "leads assigned to me"), do NOT add it to the DB enum — instead fix the code that passes `"my_lead"` as a status to use the proper status (`"lead"`) plus a filter on `assigned_to`. If it IS a real DB status, add it to both the Drizzle enum and the TypeScript type.

---

## GROUP 3: SECURITY FIXES

### 3.1 — Add authentication to cost-generating API routes
The following API routes have ZERO authentication. Add auth checks at the top of each handler. Use `createServerClient()` to get the Supabase client, then call `supabase.auth.getUser()`. If no valid user, return `401 Unauthorized`. Apply to:
- `src/app/api/ingest/propertyradar/route.ts`
- `src/app/api/ingest/propertyradar/top10/route.ts`
- `src/app/api/dialer/call/route.ts`
- `src/app/api/comps/search/route.ts`
- `src/app/api/scoring/replay/route.ts`
- `src/app/api/scoring/predict/route.ts`

### 3.2 — Fix Gmail IDOR vulnerability
In the Gmail API routes (`src/app/api/gmail/inbox/route.ts`, `send/route.ts`, `status/route.ts`), the `user_id` is accepted from the request body or query params. Instead, derive the user ID from the authenticated session: call `supabase.auth.getUser()` and use that user's ID. Ignore any `user_id` passed in the request.

### 3.3 — Stop leaking stack traces in API responses
In all API route catch blocks, do NOT return `error.message` or `error.stack` in the JSON response. Return a generic error message like `"Internal server error"` and log the real error server-side with `console.error`.

Apply to all files in `src/app/api/` — search for patterns like:
- `return NextResponse.json({ error: error.message`
- `return NextResponse.json({ error: err.message`
- `return NextResponse.json({ error: e.message`

Replace with:
```ts
console.error('[route-name]', error);
return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
```

### 3.4 — Fix Gmail token encryption fallback
In `src/lib/gmail.ts`, find where the encryption key falls back to a hardcoded string. Remove the hardcoded fallback. If `GMAIL_ENCRYPTION_KEY` is not set, throw an error at startup or return a clear error to the caller.

---

## GROUP 4: DEAD "CALL" BUTTONS

All "Call" buttons across the app should be wired to open the dialer widget or at minimum trigger a `tel:` link. Since Twilio integration is not yet live, the best interim fix is to make Call buttons open a `tel:` link using the contact's phone number (this lets the user's OS/phone handle the call).

For each of these, add an `onClick` handler that does `window.open(\`tel:\${phoneNumber}\`)` where `phoneNumber` is available from the component's data:

- `src/components/sentinel/pipeline-board.tsx` ~line 121 — "Call" button on pipeline cards
- `src/components/sentinel/master-client-file-modal.tsx` ~line 1325 — "Call {phone}" button
- `src/components/sentinel/dashboard/widgets/my-top-leads.tsx` ~line 132 — "Call" button
- `src/components/sentinel/dashboard/widgets/my-top-prospects.tsx` ~line 103 — Phone icon button
- `src/components/sentinel/dashboard/widgets/next-best-action.tsx` ~line 163 — "Call Now" button
- `src/components/sentinel/dashboard/widgets/quick-dial.tsx` ~line 93 — Quick Dial `handleCall`
- `src/components/sentinel/dialer-widget.tsx` ~line 17 — `handleDial` function

For the "Snooze" button at `next-best-action.tsx` ~line 167, make it dismiss the current action card (hide it or move to the next suggestion).

---

## GROUP 5: TOP BAR / NAVIGATION FIXES

### 5.1 — `src/components/layout/top-bar.tsx` ~line 114
**Bug:** Notification bell has no `onClick` handler and shows hardcoded "3" badge.
**Fix:** For now, make the bell toggle a dropdown/popover showing "No new notifications" (or a placeholder list). Remove the hardcoded "3" or replace with a dynamic count from a Zustand store value (default to 0).

### 5.2 — `src/components/layout/top-bar.tsx` ~lines 145-147
**Bug:** "Profile", "Settings", and "Audit Log" dropdown items have no handlers.
**Fix:**
- "Profile" → no-op for now (or navigate to settings page)
- "Settings" → `router.push("/settings")`
- "Audit Log" → `router.push("/analytics")` (closest existing page)

Import `useRouter` from `next/navigation` if not already imported.

---

## GROUP 6: HARDCODED DATA REPLACEMENTS

### 6.1 — `src/components/sentinel/pipeline-board.tsx` ~lines 38-73
**Bug:** Entire board uses `DEMO_ITEMS` array with 4 fake people. Never fetches from DB.
**Fix:** Replace the hardcoded data with a Supabase query. Fetch leads joined with properties (to get address, owner info). Use `createBrowserClient` from `@/lib/supabase`. Query: `supabase.from('leads').select('*, properties(*)').in('status', ['prospect','lead','negotiation','disposition','nurture','dead','closed'])`. Map the results to the pipeline item format. Keep the `DEMO_ITEMS` as a fallback only if the query fails or returns empty during development.

### 6.2 — `src/components/layout/command-palette.tsx` ~lines 75-81
**Bug:** 5 fake hardcoded contacts in search results.
**Fix:** Remove the `CONTACT_DATA` constant. The command palette already has a Supabase search for properties — add a parallel search on the `contacts` table: `supabase.from('contacts').select('*').ilike('first_name', \`%\${query}%\`).limit(5)` (or search across first_name, last_name, phone, email). Merge results into the search output.

### 6.3 — `src/components/sentinel/dialer-widget.tsx` ~lines 93-95
**Bug:** Hardcoded contact "Margaret Henderson" with fake phone number.
**Fix:** Accept the contact as a prop or read from a Zustand store (e.g., `useStore(s => s.activeDialerContact)`). If no contact is set, show an empty state: "No contact selected". The parent component should pass the contact when opening the dialer.

### 6.4 — `src/components/layout/top-bar.tsx` ~line 117
**Bug:** Notification badge hardcoded to "3".
**Fix:** Addressed in 5.1 above — replace with dynamic count defaulting to 0.

---

## GROUP 7: SETTINGS PAGE FIXES

### 7.1 — `src/app/(sentinel)/settings/page.tsx`
**Bugs:**
- Feature flag `<Switch>` components have no `onChange` handler — toggling them does nothing.
- "Regenerate Secret" button has no `onClick` handler.
- Setting section cards have `cursor-pointer` but no `onClick`.

**Fix:**
- Wire the feature flag switches to the Zustand store. The store already has `features` state (check `src/lib/store.ts`). Each switch should call `useStore.getState().setFeature(flagName, newValue)` or similar.
- The "Regenerate Secret" button can show a toast saying "Webhook secret regenerated" for now (use `toast` from sonner).
- Either remove `cursor-pointer` from the setting cards or make them expand/collapse their content.

---

## GROUP 8: STUB API ROUTES

### 8.1 — `src/app/api/audit/route.ts`
**Bug:** GET returns hardcoded data. POST never persists.
**Fix:**
- GET: Query `event_log` table from Supabase, ordered by `created_at DESC`, limit 50. Return the real rows.
- POST: Insert into `event_log` table using `createServerClient()`. Accept `{ user_id, action, entity_type, entity_id, details }` in the request body.

### 8.2 — `src/app/api/dialer/call/route.ts`
**Bug:** May not export a PATCH handler. The dialer page sends PATCH for hang-up.
**Fix:** Verify the file exports both `POST` and `PATCH`. If PATCH is missing, add it. The PATCH handler should update the call record's `ended_at` timestamp and `duration`.

---

## GROUP 9: ENVIRONMENT VARIABLE SAFETY

### 9.1 — `src/lib/supabase.ts`
**Bug:** Uses `!` non-null assertion on env vars with no runtime guard.
**Fix:** Add runtime checks at the top of the file:
```ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}
```
Do the same for `SUPABASE_SERVICE_ROLE_KEY` in `createServerClient()` — throw an explicit error instead of silently degrading to the anon key.

---

## GROUP 10: UNUSED IMPORTS (cleanup)

Remove these dead imports:
- `src/app/(sentinel)/campaigns/page.tsx` — unused `Skeleton` import
- `src/app/(sentinel)/contacts/page.tsx` — unused `Skeleton` import
- `src/app/(sentinel)/settings/page.tsx` — unused `Separator` import
- `src/app/(sentinel)/sales-funnel/ppl/page.tsx` — unused `Skeleton` import
- `src/app/(sentinel)/sales-funnel/negotiation/page.tsx` — unused `Skeleton` import
- `src/components/sentinel/dashboard/widgets/active-drips.tsx` — unused `Mail`, `Eye`, `MousePointer` imports

Remove these dead props (remove from interface, remove from destructuring):
- `src/components/sentinel/ai-score-badge.tsx` — `showBreakdown` prop declared but never used
- `src/components/sentinel/glass-card.tsx` — `glowCyan` and `glowPurple` props declared but never used

---

## EXECUTION ORDER

Fix in this order to avoid cascading issues:
1. Group 1 (runtime crashes)
2. Group 2 (functional bugs)
3. Group 3 (security)
4. Group 9 (env vars)
5. Group 8 (stub APIs)
6. Group 4 (call buttons)
7. Group 5 (top bar)
8. Group 6 (hardcoded data)
9. Group 7 (settings)
10. Group 10 (cleanup)

After all fixes, run `npm run build` to verify no TypeScript errors. Fix any that appear.
