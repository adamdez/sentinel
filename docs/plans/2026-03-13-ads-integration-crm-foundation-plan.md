# Acquisitions CRM: Deal-Stage & Revenue Foundation (Revised)

This plan defines the sequential foundation for Dominion’s acquisitions funnel, moving from **Observability** to **Data Integrity** before attempting **Revenue Feedback**.

## A. Current Product Position
- **Built Now**: High-fidelity read-path (Google Ads Sync) and attribution bridge (`ads_lead_attribution`).
- **Dry-Run Layer**: Good for logic verification, but lacks the "Outside Game" deal data needed for optimization.
- **Missing**: A hardened, production-useful acquisitions CRM foundation that Logan and Adam can trust as the source of truth for deal outcomes.

## B. Correct Sequential Recommendation
1. **Launch Spokane** (Manual Google Ads build/stabilization) - **Day 0**
2. **Slice 1: Minimum CRM Foundation** (Visibility & Capture) - **Immediate Post-Launch**
3. **Slice 2: Deal-Stage Integrity Service** (Enforcement & Transition Logic)
4. **Slice 3: Offline Conversion Prep** (Revenue Feedback Prep)

## C. Slice 1: Minimum Acquisitions CRM Foundation
**Goal**: Provide the baseline operational surface for the Spokane launch.
- **Lead Inbox / Record**: Focus the arrivals UI on Spokane/Kootenai separation.
- **Source Attribution Visibility**: Map GCLID/Keyword context from `ads_lead_attribution` into the Lead Detail header.
- **Speed-to-Lead visibility**: Calculate and display response time (promoted_at vs first_contact_at).
- **Call Outcome Logging**: Harden the disposition feed to capture every Logan/Seller touchpoint.
- **Operational Milestone Capture**: Support (via schema update if needed) core acquisitions markers:
    - **Qualified Fit**: Explicit flag or route.
    - **Appointment**: `appointment_at` (timestamp).
    - **Offer**: `offer_amount` (numeric).
    - **Contract**: `contract_signed_at` (timestamp).

## D. Slice 2: Deal-Stage Integrity Service
**Goal**: Move transition logic into a dedicated service boundary.
- **Module**: `src/lib/ads/acquisitions-service.ts`.
- **Logic**: A domain service that validates stage progression based on business rules:
    - Entering **Negotiation**? Must have an owner (`assigned_to`) and a logged contact attempt.
    - Entering **Disposition** (Contract)? Must have an `appointment_at` and `offer_amount` recorded.
- **Integration**: The existing `PATCH /api/prospects` route delegates complex "Acquisitions" state logic to this service.

## E. Slice 3: Offline Conversion Prep
**Goal**: Build the revenue signal ledger only after CRM data is trustworthy.
- **Store Now**: GCLID, Deal Milestone ('contract'), Timestamp, and estimated Assignment Fee.
- **Wait Policy**: No uploads to Google Ads for 14-21 days. We must first verify Logan is logging milestones correctly in the real Spokane baseline.

## F. Launch-to-CRM Signal Chain
1. **Intake**: `/sell?gclid=XYZ` -> `ads_lead_attribution`.
2. **Inbox**: Logan qualifying via the new foundation (Slice 1).
3. **Funnel**: Milestone capture (Appointment -> Offer -> Contract).
4. **Validation**: Acquisitions Service (Slice 2) ensures signal integrity.
5. **Ledger**: Slice 3 records the conversion snapshot.

## G. Risk Review: "The Garbage-In Loop"
If we skip the CRM foundation and jump to offline conversions:
- False "Contract" signals (mis-clicks by the operator) will train Google Ads to spend money on junk traffic.
- **Mitigation**: Slice 2 (Integrity) is mandatory before Slice 3 (Prep).

## H. Final Recommendation
**Next Step**: Implement **Slice 1 (CRM Foundation)**. Focus on adding high-signal milestone fields (`appointment_at`, `offer_amount`, `contract_signed_at`) and surfacing them in the Lead Detail UI.
