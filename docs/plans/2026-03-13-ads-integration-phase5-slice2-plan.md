# Phase 5 Slice 2 Plan: Approvals State Machine & UI

## A. Current-State Assessment
*   **How Slice 1 data feeds Slice 2:** Slice 1 currently inserts mathematically valid, entity-grounded, market-mapped rows into `ads_recommendations` with `status = 'pending'`. These rows are currently invisible to the operator.
*   **What remains legacy:** The `ad_reviews` UI (AI Review tab) still shows the raw text output and `ad_actions`. This allows operators to continue their manual Google Ads workflow uninterrupted.
*   **What must not change yet:** The Mutation Gateway does not exist. No code may import Google Ads mutate clients. No "Execute" button should exist in the UI.

## B. Slice 2 Scope Definition
*   **In Scope:**
    *   Building the `/api/ads/approvals` route to handle state transitions (`pending` → `approved` / `rejected`).
    *   Adding a "Pending Approvals" UI table to the Ads Command Center.
    *   Writing operator decisions to the `ads_approvals` ledger.
    *   Enforcing freshness and deduplication policies on the `pending` table.
*   **Out of Scope:**
    *   Execution of approved recommendations against the Google Ads API.
*   **Remains Manual:** The operator must still manually execute approved changes in the Google Ads UI until the Mutation Gateway (Slice 3/4) is built.
*   **Remains Non-Operative:** The "Approved" status is currently a terminal state in Sentinel. It merely records the operator's intent.

## C. Approval State Machine Design
*   **`pending`**: Initial state created by Slice 1 AI review. Visible in the new UI table.
*   **`approved`**: Operator clicks "Approve". Row is hidden from the `pending` table. A record is inserted into `ads_approvals` capturing the operator's UUID.
*   **`rejected`**: Operator clicks "Reject". Row is hidden. Record inserted into `ads_approvals`.
*   **`stale`**: The system automatically transitions `pending` rows to `stale` if they are >7 days old, or if a newer sync detects the underlying entity was manually changed in Google Ads.
*   **`implemented`**: **NOT ALLOWED IN SLICE 2.** This state is strictly reserved for the future Mutation Gateway.

## D. Duplicate & Conflict Policy
*   **Repeated Recommendations:** If an AI review suggests pausing Keyword X, but a `pending` recommendation to pause Keyword X already exists, Slice 1 (or the UI fetch) will deduplicate it. We only show one active recommendation per entity/action pair.
*   **Conflicting Recommendations:** If the AI suggests increasing a bid by 10% on Monday, and then 20% on Wednesday (while Monday's is still pending), the newer recommendation deprecates the older one (moving the older to `stale`).
*   **Repeated Operator Actions:** The UI will instantly remove the row optimistically upon click. The API route strictly enforces that a recommendation can only transition out of `pending` *once*. Subsequent approval attempts return 400.
*   **Stale Recommendations:** Handled actively on read by the freshness policy.

## E. Freshness Policy (Mandatory Safety)
*   **7-Day Hard Expiry:** Any `pending` recommendation older than 7 days automatically drops from the UI and is marked `stale`. The market changes too fast to rely on week-old analysis.
*   **Sync Delta Invalidation:** When the UI loads, it checks the `last_sync` timestamp. If the recommendation was generated *before* the last sync, and the last sync shows the entity's state no longer matches the recommendation's premise (e.g., the AI said "pause this active keyword", but the sync shows the keyword is already paused), the recommendation is marked `stale` and hidden.

## F. UI Plan (Minimum Operator-Facing UX)
*   **Location:** Inside the existing Ads Command Center, either as a new "Approvals" tab or a prominent table above the performance metrics.
*   **Fields Shown:**
    *   Action Type (e.g., "Pause Keyword", "Decrease Bid").
    *   Entity Name & Type (e.g., "buy my house fast" - Keyword).
    *   Market (Explicitly badged: Spokane / Kootenai).
    *   Reason (Short AI rationale).
    *   Risk Level (Green/Yellow/Red indicator).
*   **Actions:** "Approve" (Green Check) and "Reject" (Red X).
*   **Mandatory Warning:** A persistent, highly visible banner above the table: *"⚠️ Approval Sandbox Mode: Approving recommendations here currently logs your decision but does NOT execute changes in Google Ads. You must still apply changes manually."*

## G. Data Model Usage
*   **`ads_recommendations`**: Filtered `WHERE status = 'pending' AND created_at > NOW() - INTERVAL '7 days'`. Updated via `PATCH` to change status.
*   **`ads_approvals`**: Inserted into upon operator click: `(recommendation_id, decided_by, decision, created_at)`. `decided_by` securely maps to the Supabase Auth user.
*   **No new schema changes are needed.** The tables created in Phase 1 support this perfectly.

## H. Top Failure Modes
*   **Approving stale recommendations:** Prevented by the strict 7-day cutoff and sync-delta invalidation. The API will also reject approvals for recommendations older than 7 days, even if a stale UI tab left them visible.
*   **Duplicate/conflicting approvals:** Prevented by duplicate filtering on the read path and enforcing a one-time state transition on the write path.
*   **Cross-market confusion:** Prevented by burning the market onto the row in Slice 1, honoring the global `marketFilter` dropdown in the Command Center, and explicitly badging the market on every row.
*   **UI implying execution:** Prevented by the mandatory Sandbox warning banner and the explicit omission of terms like "Execute" or "Deploy".
*   **Insufficient entity grounding:** Already solved by Slice 1's validation core. Hallucinated entities never reach the `pending` state.

## I. Recommended Slice 2 Implementation Slices
*   **Step 1:** Build `/api/ads/approvals` GET (with freshness filtering/deduplication) and PATCH (state transition + ledger insert).
*   **Step 2:** Build the `ApprovalsTable` UI component with the mandatory Sandbox warning.
*   **Step 3:** Mount it in the `AdsCommandCenter` behind the existing Tabs structure.

**Implementation Step 1 (The API) should be executed first.**

## J. Final Recommendation
**PROCEED WITH SLICE 2 PLANNING AS SCOPED.**
This plan securely advances the human-in-the-loop workflow without crossing the critical threshold of mutation execution. It forces operators to evaluate structured, validated data while explicitly acknowledging that real-world execution is still a manual fallback.
