# Ads Integration: Launch-Readiness & Operating Plan

This document outlines the transition from the completed **Dry-Run Simulation** phase to the real-world **Manual Spokane Launch**. Consistent with project guardrails, all live mutation automation is deferred in favor of measurement and CRM stabilization.

## A. Current Operational State
- **Built & Trustworthy**:
    - **5-Stage Sync**: High-fidelity read-path for campaigns, ad groups, and keywords.
    - **Lead Attribution**: Reliable bridge linking inbound GCLID/keyword data to CRM leads.
    - **Approval State Machine**: Gated review pipeline for AI recommendations.
    - **Simulation Engine**: Hardened simulator for validating orchestration logic without execution.
- **Still Manual**:
    - **Campaign Management**: All creation and execution must happen in the Google Ads UI.
    - **Conversion Mapping**: Manual link between Google Ads conversion actions and Sentinel lead stages.
- **Missing (Pre-Execution Prerequisites)**:
    - **Conversion Maturity**: 90+ days of attribution data (Closed Deals -> Keyword).
    - **Gateway Hardening**: Dedicated isolation of mutate capabilities.

## B. Why Live Execution Planning is Deferred
- **Measurement Before Automation**: We cannot Safely automate what we cannot accurately measure. Conversion data (contracts/appointments) is currently too sparse for the AI to drive bidding strategy without risk of cratering ROAS.
- **Manual Baseline Required**: The first Spokane Search campaign must be stabilized manually to establish "truth" metrics before we allow an AI gateway to influence it.
- **Workflow Truthfulness**: Automated execution saves minutes; accurate attribution saves thousands in wasted ad spend. The latter is our higher-value priority.

## C. Launch-Readiness Checklist (Spokane Search)
- [ ] **Conversion Audit**: Confirm Google Ads conversion tags are firing on the `/thank-you` page.
- [ ] **Sentinel Sync**: Verify `GOOGLE_ADS_CUSTOMER_ID` targets the production CID.
- [ ] **Manual Build**: Campaign "Spokane_Search_v1" created in Google Ads (Manual).
- [ ] **Proposal Sign-off**: Keywords and negative scrub-list approved by Adam/Logan.
- [ ] **Attribution Test**: Submit a test lead through `/sell?gclid=test_id` and verify `ads_lead_attribution` record creation.
- [ ] **Go-Live**: Toggle campaign status to ENABLED.

## D. 7-Day Monitoring Plan (Post-Launch)
- **Hours 0–24**: Monitor `ads_sync_logs` for any "FAILED" entries under real traffic volume.
- **Day 2**: Verify "Daily Metrics" are populating the Ads Command Center charts.
- **Day 4**: Audit `ads_lead_attribution`. Ensure 100% of GCLID-bearing leads have a campaign ID record.
- **Day 7**: First AI Strategy Review. Generate an AI Review to see if Claude identifies waste in the new campaign. **Simulation only.**

## E. Stabilization Recommendations
1. **Encapsulate Gateway**: Move all `mutate` exports from `lib/google-ads.ts` into `lib/ads/gateway/` to prevent accidental developer usage elsewhere.
2. **Audit Log Cleanup**: Implement a background job to archive `ads_implementation_logs` older than 90 days.
3. **Freshness Alerting**: If `ads_sync_logs` fail for >48 hours, surface a global banner in the Ads Command Center.

## F. Next Phase Recommendation: Acquisitions CRM / Revenue Feedback
**Recommendation**: Prioritize the **Acquisitions CRM Feedback Layer** over Slice 4 Execution.
- **Value**: This layer uploads "Offline Conversions" (Lead -> Signed Contract) back to Google Ads.
- **Impact**: It teaches Google's Smart Bidding exactly which keywords lead to revenue vs. just clicks. This is 10x more valuable than automating a "Pause Keyword" button.

## G. Final Recommendation
**HALT PHASE 5.**
Do not proceed to Slice 4. The system is currently in a state of high-fidelity observability. We should launch the Spokane campaign manually, monitor the sync reliability for 14 days, and then pivot to building the **Offline Conversion Feedback** pipeline.
