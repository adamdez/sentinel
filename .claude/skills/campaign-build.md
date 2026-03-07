# /campaign-build — Build Marketing Campaign for Prospect Segment

Help design and prepare a marketing campaign (mail, cold call, text) targeting a specific segment of prospects. Wholesalers need targeted outreach — not spam blasts.

## Arguments
The user will describe the segment (e.g., "probate leads in Spokane", "absentee owners with tax liens", "all gold+ prospects").

## What to do

1. **Define the segment** — Build the query criteria:
   - Lead status filter (prospect, lead, nurture)
   - Score threshold (e.g., silver+, gold+, platinum)
   - Signal type filter (e.g., probate, pre_foreclosure, tax_lien)
   - County/ZIP filter
   - Owner type filter (absentee, corporate, individual)
   - Contact availability (has phone, has email, has mailing address)

2. **Size the audience** — Query the DB with the segment criteria:
   - Total leads matching
   - How many have phone (for cold calling)
   - How many have email (for email campaign)
   - How many have mailing address (for direct mail)
   - How many have all three

3. **Recommend channel** — Based on segment:
   - Probate/inherited → Direct mail (sensitive, personal touch)
   - Pre-foreclosure → Phone call (urgent, time-sensitive)
   - Tax lien → Phone + mail (need to explain options)
   - Absentee → Mail to mailing address (they're not at the property)
   - FSBO → Phone (they're already selling)
   - High score (75+) → Phone FIRST, then mail follow-up

4. **Draft messaging** — Create campaign copy:
   - Subject lines / headlines based on distress type
   - Call scripts with objection handling
   - Direct mail letter templates (handwritten style for probate)
   - Email templates (if applicable)
   - Text/SMS templates (if applicable)
   - Key messaging: empathy first, then offer to help, then value proposition

5. **Campaign logistics** — Plan execution:
   - Batch size recommendation (start small, 50-100, test response)
   - Timing (best days/times for cold calls, mail delivery timing)
   - Follow-up cadence (call → mail → call → text → call)
   - Tracking: how to measure response rate
   - Budget estimate (postage, dialer minutes, etc.)

6. **Export preparation** — If the user wants to execute:
   - Generate CSV export of the segment with: name, phone, email, address, mailing_address, primary_signal, score
   - Flag any records with data quality issues
   - Mark records as "campaign_[name]" tag in leads table

## Messaging guidelines for wholesale
- NEVER use "we buy ugly houses" language
- Lead with empathy: "I understand you may be going through a difficult time"
- Probate: "I help families with inherited properties they may not need"
- Foreclosure: "I may be able to help you avoid foreclosure"
- Tax lien: "I help property owners resolve tax situations"
- Always include: "No obligation, no pressure, just exploring options"
