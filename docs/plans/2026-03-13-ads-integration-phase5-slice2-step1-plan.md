# Phase 5 Slice 2 Step 1: Approvals API Setup

## 1. Exact Step 1 Scope
*   Build `GET /api/ads/approvals`: Fetch explicitly actionable recommendations (`status = 'pending'`). Enforce a 7-day hard expiry. Perform server-side deduplication so the UI will only ever see one pending action per entity. Provide entity names by joining to `ads_campaigns`, `ads_ad_groups`, and `ads_keywords`.
*   Build `PATCH /api/ads/approvals`: Accept a recommendation ID and a decision (`approve` or `reject`). Ensure the user is securely authenticated. Atomically check that the recommendation is still `pending` and `< 7 days old`. Update the status to the decision. Insert a ledger row into `ads_approvals` capturing the decision and the actor's UUID.

## 2. Out of Scope Items
*   **UI Work:** No changes to `src/app/(sentinel)/ads/page.tsx` or any React components.
*   **Mutation Gateway:** No execution logic.
*   **Google Ads Writes:** No importing or usage of Google Ads mutate clients.
*   **Auto-Execution:** No automation is introduced.
*   **Sync-Delta Invalidation:** Deferring this for now. The data model currently lacks a reliable, lightweight way to deterministically diff the pre-recommendation entity state against the current sync state without complex snapshot comparison overhead. We will rely on the 7-day hard expiry and the duplicate filter for safety.

## 3. Exact Files/Modules/Tables to Change
*   **New File:** `src/app/api/ads/approvals/route.ts`
*   **Tables Read:** `ads_recommendations`, `ads_campaigns`, `ads_ad_groups`, `ads_keywords`.
*   **Tables Written:** `ads_recommendations` (update status), `ads_approvals` (insert ledger row).

## 4. Safest Atomicity Approach for PATCH
Since we cannot guarantee a strict multi-statement SQL transaction across two tables via the standard single-client Supabase REST API without RPCs, we will use an **Opportunistic Update with State-Match Guard**:
1.  Run `UPDATE ads_recommendations SET status = $decision WHERE id = $id AND status = 'pending' AND created_at > NOW() - 7 days RETURNING id`.
2.  If the update returns 0 rows, we fail immediately (the row was already decided, stale, or hallucinated).
3.  If the update returns 1 row, we immediately `INSERT INTO ads_approvals (recommendation_id, decided_by, decision)`.
This guarantees a recommendation transitions out of `pending` exactly once, preventing double-execution race conditions on the status change.

## 5. Schema Sufficiency
The Phase 1 schema is 100% sufficient. `ads_recommendations` has a `status` column, and `ads_approvals` has `recommendation_id`, `decided_by`, and `decision` columns. No schema migrations are required.

## 6. Sync-Delta Invalidation Deferral
**DEFERRED.** We cannot safely implement sync-delta invalidation right now because we do not capture the *exact* metric or state snapshot that triggered the AI recommendation in a cheap queryable format (e.g. `previous_status_when_recommended`). Faking it introduces dangerous false-positives. We will rely on the 7-day hard expiration.

## 7. Adversarial Risks
*   *Risk:* Client sends a `userId` in the payload to bypass auth.
    *   *Mitigation:* The API completely ignores client payload user IDs and fetches the actor strictly via `supabase.auth.getUser(token)`.
*   *Risk:* Client attempts to approve a recommendation that was just approved milliseconds ago by another operator.
    *   *Mitigation:* The `UPDATE ... WHERE status = 'pending'` atomic guard ensures the second request fails because the status is no longer `pending`.

## 8. Confirmation
No UI, Mutation Gateway, or Google Ads execution behavior will be added in this step. The definition of "approved" here functionally means "recorded for future manual action."
