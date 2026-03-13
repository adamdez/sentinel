# Phase 5 Slice 3 Plan: Mutation Gateway (Mock / Dry-Run Mode)

## A. Current-State Assessment
*   **What Slice 3 builds on:** Slice 1 (Validated Recommendation Capture) and Slice 2 (Approvals API & UI). We have a database of "Approved" recommendations that currently sit dormant.
*   **What is already true:** We have verified entity links (Campaign/Ad Group/Keyword IDs) and market-separation data burned into the `ads_recommendations` table.
*   **What remains out of scope:** Live Google Ads API mutation calls. The "Write" permission for the Google Ads Client is explicitly NOT integrated in this slice.

## B. Slice 3 Scope Definition
*   **In Scope:**
    *   Creating the `src/lib/ads/gateway/` service layer.
    *   A "Dry-Run" execution pipeline that simulates the end-to-end flow of an approved recommendation.
    *   Logging "Mock Execution" entries into `ads_implementation_logs`.
    *   Updating recommendation status to `mock_implemented` or `simulated`.
*   **Out of Scope:**
    *   Actual `google-ads-api` mutation calls.
    *   Changing the state of live Google Ads campaigns.
*   **Remains Manual:** The actual change in Google Ads.
*   **Remains Approval-Only:** No recommendation can enter the Gateway unless its status in `ads_recommendations` is already `approved`.

## C. Mock Gateway Architecture
*   **Entry Point:** `POST /api/ads/gateway/simulate`.
*   **Trigger:** Manual operator trigger from the Approvals UI (to be added in Step 2 of this slice).
*   **Eligibility & Safety Checks (The "Hardened Gates"):**
    1.  **Auth Check:** Operator must be authenticated and authorized.
    2.  **State Check:** Status must be exactly `approved`.
    3.  **Freshness Check:** Recommendation `created_at` must be < 7 days old.
    4.  **Entity Revalidation:** The gateway MUST re-query `ads_keywords` / `ads_campaigns` to ensure the entity still exists and hasn't changed market since the recommendation was made.
    5.  **Conflict Check:** Ensure no other `mock_implemented` log exists for this specific recommendation ID (Concurrency Guard).
*   **Final Mock Outcome:** On success, the gateway returns a simulation report and writes to the ledger.

## D. Exact State Semantics
*   **Status Name:** `mock_implemented`. We explicitly avoid the terminal `implemented` status to prevent any confusion about whether a live change occurred.
*   **UI Clarity:** The log entry and status label MUST include a "SIMULATED" or "MOCK" badge. 
*   **Operator Warning:** The UI triggering this action will state: *"SIMULATE: This tests the execution logic and records a mock implementation in the ledger. NO CHANGE will be made to Google Ads."*

## E. Failure Modes
*   **Stale Approval:** If an operator approves a recommendation but waits 3 days to simulate it, and it hits the 7-day hard limit, the Gateway rejects it.
*   **Entity Missing:** If the Keyword was deleted in Google Ads and synced out of Sentinel since the recommendation was made, the Gateway revalidation fails and marks the recommendation as `invalidated`.
*   **Logs Implying Real Execution:** Prevented by the strict prefix `MOCK_` in all `ads_implementation_logs` entries for this slice.
*   **Drift toward Real Execution:** The `google-ads-api` library is NOT imported in the Gateway service in this slice. It is physically impossible for the code to make a live call.

## F. Recommended Slice 3 Implementation Slices
*   **Step 1: The Simulator Layer.** Create `src/lib/ads/gateway/simulator.ts` which handles the logic of revalidation, ledger logging, and status updating to `mock_implemented`.
*   **Step 2: The Simulation Route.** Build `POST /api/ads/gateway/simulate` to expose this logic to the UI safely.
*   **Step 3: The Simulation UI.** Add a "Simulate Implementation" button to the "Approved" items list to prove the pipeline.

**The first step is Step 1: The Simulator Layer.**

## G. Final Recommendation
**PROCEED WITH SLICE 3 PLANNING AS SCOPED.**
This approach allows us to "smoke test" the entire orchestration and audit trail logic for Phase 5 without incurring any risk of accidental Google Ads mutations. It solidifies the "Implementation Ledger" concept before the final "Live" bridge is built.
