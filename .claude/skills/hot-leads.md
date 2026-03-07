# /hot-leads — Find Hottest Actionable Leads Right Now

Identify the leads that should be called TODAY. This is the money skill — every day without calls is lost revenue. Filter for leads that are both high-score AND contact-ready.

## What to do

1. **Query top prospects** — From `leads` where status='prospect', join to:
   - `properties` — owner_name, owner_phone, owner_email, address, estimated_value
   - `scoring_records` — latest composite_score, label, primary_signal
   - `distress_events` — active signals with types and severity

2. **Filter for actionable** — A lead is actionable if it has ALL of:
   - owner_name (not "Unknown Owner")
   - owner_phone OR owner_email (can be contacted)
   - At least 1 active distress signal
   - composite_score >= 40 (silver or better)

3. **Rank by urgency** — Sort actionable leads by:
   - Foreclosure auction/sale date (if known) — these are time-critical
   - Tax sale deadline (if known)
   - Probate freshness (recent = more motivated)
   - Composite score (higher = more distressed)
   - Days since last contact (overdue follow-ups first)

4. **Produce the call list** — Top 20 leads, formatted:
   ```
   TODAY'S HOT LEADS — [date]

   #  Owner Name        Phone          Address                Score  Primary Signal    Urgency
   1  John Smith        509-555-1234   123 Main St, 99201    87     pre_foreclosure   Auction 3/15
   2  Jane Doe          208-555-5678   456 Oak Ave, 83814    72     probate           Filed 2 weeks ago
   ...

   TOTAL ACTIONABLE: XX leads
   CALL-READY (phone): XX
   EMAIL-ONLY: XX
   OVERDUE FOLLOW-UPS: XX
   ```

5. **Follow-up reminders** — Check leads table for:
   - `next_follow_up` dates that have passed (overdue)
   - Leads contacted but not yet dispositioned
   - Leads with notes indicating callback requested

6. **New since yesterday** — Highlight:
   - Leads promoted to prospect in last 24 hours
   - New distress events detected in last 24 hours
   - Score increases (leads that got hotter)

## Key tables
- `leads` — status, priority, next_follow_up, last_contacted_at, notes
- `properties` — owner info, contact info, address
- `scoring_records` — scores and labels
- `distress_events` — active signals
