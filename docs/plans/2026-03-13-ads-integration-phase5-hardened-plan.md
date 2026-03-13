# Phase 5 Hardened Implementation Plan: Recommendations, Approvals & Mutation Gateway

## A. Current-State Summary
*   **What is already built:** 
    *   Phase 0 (Connection live).
    *   Phase 1 (Normalized `ads_*` schema with RLS and market separation).
    *   Phase 2 (5-stage idempotent sync tracking real entity states locally).
    *   Phase 3 (Minimum attribution bridge: `ads_lead_attribution`).
    *   Phase 4 (Normalized read-path in Command Center with 5,000-row/30-day bounding).
*   **What is still legacy:** `ad_reviews` and `ad_actions` tables are still capturing freeform AI text reviews and unvalidated action suggestions. The AI Review tab reads from these.
*   **What Phase 5 is replacing:** The unstructured `ad_actions` workflow is completely replaced by a strict, type-safe pipeline: `ads_recommendations` → `ads_approvals` → `ads_implementation_logs`.
*   **Risky Assumptions:** "Optimizing toward business outcomes" is highly dangerous right now because conversion data (contracts/appointments) is sparse and slow. Bidding adjustments based on immature data can crater a campaign. Therefore, *all* outcome-driven recommendations must be informational (human review only) and cannot be automated.

## B. Parallel Reviewer Findings
1.  **Architecture Reviewer:** A single, choked Mutation Gateway is mandatory. No part of the codebase may call Google Ads mutate endpoints except this single service function (`executeMutation(recommendationId)`).
2.  **Recommendations/Workflow Reviewer:** AI cannot output freeform text actions anymore. It must output structured JSON matching the `ads_recommendations` schema, including actual database IDs (`related_keyword_id`, etc.) which must be validated against the DB before insertion.
3.  **Google Ads Safety Reviewer:** The concept of "green = auto execute" violates strict safety rules. Every single mutation requires an explicit `ads_approvals` row tied to an authenticated operator. No exceptions.
4.  **Security/Auth/Approval Reviewer:** Approvers must be captured via `supabase.auth.getUser()`. "Operator" string bypasses are forbidden.
5.  **Adversarial/Red-Team Reviewer:** If sync fails silently for 3 days, the AI might recommend pausing a keyword that a human already paused in the Google UI. If the gateway executes this blindly, it fails or reverts state. The gateway MUST enforce a strict data freshness check (< 36 hours since last successful sync) before executing ANY mutation.
6.  **Implementation Planner:** The transition must be seamless. We will temporarily run both the legacy "AI Review" tab and the new "Pending Approvals" UI concurrently until trust is established.

## C. Phase 5 Scope Definition
*   **In Scope:**
    *   Porting the structured `ads_recommendations` and `ads_approvals` service logic.
    *   Building the single Mutation Gateway API.
    *   Updating the AI Review prompt to generate structured JSON recommendations.
    *   Adding a "Pending Approvals" UI table to the Ads Command Center.
*   **Out of Scope:**
    *   No auto-execution of any kind.
    *   No new campaign deployment / ad group creation workflows.
    *   No broad AI self-management or unsupervised iteration loops.
*   **Must Remain Manual:** Campaign creation, budget changes >20%, bidding strategy alterations, and the actual *approval clicking* for any recommendation.
*   **Must Wait Until Later:** Outcome-driven automated bid adjustments (needs 90+ days of attribution data).

## D. Corrected Phase 5 Target Architecture
*   **Services / Modules:**
    *   `src/lib/ads/recommendations.ts`: Generates and validates AI suggestions against local `ads_*` tables. Drops hallucinated IDs.
    *   `src/lib/ads/approvals.ts`: Handles secure state transitions (`pending` → `approved` / `rejected`).
    *   `src/lib/ads/gateway.ts`: The Mutation Gateway. The only file authorized to import Google Ads mutate clients.
*   **Approval State Machine:**
    `pending` → operator review → `approved` / `rejected` → (if approved) mutation gateway → `implemented` (or `failed`)
*   **Mutation Gateway Boundary:**
    1.  Receives `(recommendationId, userId)`.
    2.  Verifies `status === 'approved'`.
    3.  Verifies sync freshness `< 36 hours`.
    4.  Verifies target campaign age `> 14 days`.
    5.  Logs pre-execution state to `ads_implementation_logs`.
    6.  Executes GoogleAds mutate payload.
    7.  Logs post-execution state and updates recommendation status.
*   **Entity Validation Layer:** AI outputs a `keyword_id`. The service queries `ads_keywords` to verify it exists and belongs to the correct market before creating the recommendation row.
*   **Market Separation:** Recommendations inherit the `market` string from their parent campaign automatically during the validation layer. The UI strictly filters pending recommendations by the global market toggle.

## E. Data Model Plan
Phase 1 already created the tables. We will enforce strict usage:
*   `ads_recommendations`: Stores structured outputs. Enforces FKs to campaigns/ad_groups/keywords.
*   `ads_approvals`: Append-only ledger linking a `recommendation_id` to an `auth.users.id` with a decision timestamp.
*   `ads_implementation_logs`: Audit trail written exclusively by the Mutation Gateway.

*No database schema migrations are required assuming Phase 1 was executed correctly.*

## F. Legacy Migration Plan
1.  Update the AI Review API endpoint (`/api/ads/review`) to prompt Claude for *both* the legacy summary text (saved to `ad_reviews`) AND a new structured JSON block (saved to `ads_recommendations`).
2.  The existing UI tabs continue reading `ad_reviews` natively.
3.  Add a new "Approvals" UI section that exclusively reads `ads_recommendations` where `status = 'pending'`.
4.  Once the operator is comfortable with the Approvals UI and Gateway execution, deprecate `ad_actions` entirely.

## G. Safety Policy for Phase 5
*   **Recommendation-Only (Informational):** Waste flagging, conversion gap analysis, ad copy suggestions.
*   **Approval-Required (Through Gateway):** Keyword pauses, exact-match negative keyword additions, minor bid adjustments (< 20%).
*   **Blocked / Not Allowed Yet:** Campaign creation, structural deletion, bidding strategy changes, network toggles.

## H. Top Failure Modes
1.  **Stale Data Mismatch:** AI recommends pausing a keyword that was deleted in the Google Ads UI yesterday.
    *   *Mitigation:* Gateway enforces < 36h sync freshness and natively catches Google Ads API `RESOURCE_NOT_FOUND` errors, marking the recommendation as `failed` without crashing.
2.  **Hallucinated Entity IDs:** AI invents a `keyword_id` integer.
    *   *Mitigation:* Validation layer strictly drops any recommendation where the ID does not exist in the Sentinel DB.
3.  **Market Contamination:** Operator approves a Spokane bid adjustment while viewing Kootenai context.
    *   *Mitigation:* UI enforces global market filtering on the Pending table, and the validation layer statically burns the `market` label onto the recommendation row.
4.  **Execution Bypass:** A rogue API route calls Google Ads API directly.
    *   *Mitigation:* Code review strictly enforces that `src/lib/google-ads.ts` mutate functions are only imported by `gateway.ts`.
5.  **Conflicting Approvals:** Two operators approve the same recommendation simultaneously.
    *   *Mitigation:* Gateway verifies `status === 'approved'` and uses a DB transaction or strictly synchronous API lock to prevent double-execution.

## I. Exact Phased Implementation Plan
*   **Step 1:** Build `src/lib/ads/recommendations.ts` (JSON parsing + entity validation) and `src/lib/ads/approvals.ts` (state machine).
*   **Step 2:** Build `src/lib/ads/gateway.ts` (The absolute mutate choke-point + `ads_implementation_logs` writing).
*   **Step 3:** Implement API routes (`/api/ads/recommendations`, `/api/ads/approvals`, `/api/ads/execute`).
*   **Step 4:** Modify `src/app/api/ads/review/route.ts` to append structured JSON into `ads_recommendations` alongside the legacy review.
*   **Step 5:** Build the UI component (`PendingApprovalsTable`) and add it to the Ads Command Center.
*   **Verification:**
    *   Run a mock "AI Review" and verify hallucinated IDs are dropped.
    *   Attempt an execution with a mock sync >36 hours old; verify it blocks.
    *   Ensure the gateway writes accurate pre/post logs to `ads_implementation_logs`.

## J. Final Recommendation
**PROCEED WITH PHASE 5 PLANNING AS SCOPED.**
The plan correctly quarantines execution to a single gateway, absolutely forbids auto-action, layers strict DB validation on AI outputs, and maintains the established trust UI from Phase 4.
