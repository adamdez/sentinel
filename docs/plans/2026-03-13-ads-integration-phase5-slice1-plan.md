# Phase 5 Implementation Slices & Slice 1 Plan

## A. Phase 5 Broken into Small Implementation Slices

### Slice 1: Core Recommendation Data Layer (Validation & Capture)
*   **Objective:** Modify the AI review engine to output strict JSON recommendations alongside the legacy text summary. Validate and insert these recommendations into the `ads_recommendations` table.
*   **Safety:** 100% safe. This is exclusively a backend data pipeline. No UI changes and zero execution capability mean zero operator risk.
*   **Dependencies:** Phase 1 schema, Phase 2 normalized sync data.
*   **Manual remainders:** Everything. Operator still uses legacy `ad_views`.
*   **Out of scope:** Approvals UI, Mutation Gateway execution.

### Slice 2: Approvals State Machine & UI
*   **Objective:** Add the "Pending Approvals" table to the Ads Command Center. Allow operators to click "Approve" or "Reject," updating the row status and logging their UUID.
*   **Safety:** Safe. Approving a row still does nothing because the Mutation Gateway does not yet exist. It is pure state capture.
*   **Dependencies:** Slice 1 (must have valid recommendations flowing in).
*   **Manual remainders:** Actual execution of the approved change within the Google Ads dashboard. 
*   **Out of scope:** Mutation execution.

### Slice 3: The Mutation Gateway (Mock Mode)
*   **Objective:** Build `src/lib/ads/gateway.ts`. It takes an approved recommendation, runs the strict freshness/safety checks, writes a pre-execution log, and then *simulates* a Google Ads success by returning a mock "OK" and updating the row to `implemented`.
*   **Safety:** Safe. It proves the choking logic and logging pipeline work flawlessly without touching real money.
*   **Dependencies:** Slice 2.
*   **Manual remainders:** Real Google Ads execution.

### Slice 4: Mutation Gateway (Live Execution)
*   **Objective:** Connect the Gateway to the real Google Ads API mutator.
*   **Safety:** High risk. Protected by the proven safety checks built in Slices 1–3. Validated by slow rollouts (waste-flag pauses first).
*   **Dependencies:** Slices 1, 2, and 3.

---

## B. Recommended First Slice Only
**Slice 1: Core Recommendation Data Layer (Validation & Capture)**

## C. Why This Slice Should Come First
*   **The Adversarial Argument:** An adversarial reviewer would state, *"Why not build the UI first so the operator can see what's happening?"*
*   **The Rebuttal:** Building UI without mathematically validated data creates a false sense of security. If the AI hallucinates a `keyword_id` and the UI shows "Pause Keyword X", the operator might approve it, leading to a Gateway crash later. 
We must **first** build an ironclad validation layer that silently drops hallucinated entities or cross-market contaminations *before* they ever reach a database row. Once the data flowing into `ads_recommendations` is proven to be 100% real and tied to valid Sentinel IDs, we can safely expose it to the operator. This ensures the operator never sees a mathematically impossible recommendation.

## D. Exact Implementation Scope for Slice 1
*   **Files / Modules Touched:**
    *   `src/lib/ads/recommendations.ts` (NEW): Contains `parseAiRecommendations()` and `insertValidatedRecommendations()`.
    *   `src/app/api/ads/review/route.ts` (MODIFIED): Updates the Claude system prompt to demand structured JSON *in addition* to the existing legacy summary. Plumbs the JSON payload to the new `recommendations.ts` module.
*   **Tables Involved:**
    *   Reads from: `ads_campaigns`, `ads_ad_groups`, `ads_keywords` (to validate IDs).
    *   Writes to: `ads_recommendations` (new insertions) and `ad_reviews` (legacy insertions maintain parity).
*   **Schema Changes:** None. The Phase 1 schema already created `ads_recommendations`.
*   **API Routes Affected:** `/api/ads/review` only.
*   **UI Surfaces Affected:** None. The operator's Command Center remains completely frozen on the legacy AI Review tab.
*   **What Stays Frozen:** `ad_actions` generation logic and `ReviewTab` UI. Execution and the Mutation Gateway DO NOT exist yet.

## E. Safety Constraints for Slice 1
*   **What absolutely must not happen:** The system must not crash the existing AI Review workflow. The legacy data generation must succeed even if the new JSON parsing fails.
*   **Read-Only / Approval-Only:** The layer is strictly database-write. It does not touch Google Ads.
*   **Mandatory Validations (The Enforcement Core):**
    1.  *Type Check:* Ensure the AI JSON matches the `RecommendationInsertType`.
    2.  *Entity Check:* If the AI outputs `related_keyword_id: 12345`, the code MUST run `SELECT id, market FROM ads_keywords WHERE id = 12345`. If it returns null, the recommendation is discarded.
    3.  *Market Lockdown:* The DB insert ignores any `market` property claimed by the AI. It strictly inherits the `market` verified during the Entity Check. (Spokane stays Spokane).

## F. Verification Plan for Slice 1
*   **Tests:**
    *   Write a unit test for `insertValidatedRecommendations()` injecting a fake JSON payload with a hallucinated keyword ID. Verify the function silently drops it and inserts 0 rows.
    *   Write a unit test injecting a valid keyword ID but a wrong market. Verify the inserted row is stamped with the *correct* market from the DB entity.
*   **Adversarial Checks:**
    *   Run exactly one live AI review via the Command Center UI. 
    *   Query the Supabase `ads_recommendations` table directly.
    *   Verify rows appearing there securely map to actual `ads_campaigns` and have `status = 'pending'`.
*   **Pass/Fail Criteria:** Legacy UI still works flawlessly. New DB table slowly populates with mathematically valid, real-world recommendations waiting in the dark.
*   **Rollback / Containment Plan:** If `/api/ads/review` begins throwing 500s due to JSON parse errors, the catch block simply logs the error, skips `ads_recommendations` insertion, and falls back to saving strictly the `ad_reviews` row, preserving operator functionality.
