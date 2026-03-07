# /skip-trace — Skip Trace Strategy for Prospect

Develop a contact-finding strategy for a specific prospect or batch of prospects missing phone/email. In wholesale, you can't make money if you can't reach the owner.

## Arguments
The user may provide: a specific property/lead ID, or "batch" to process all prospects missing contact info.

## What to do

### For a specific prospect:

1. **Current contact data** — Check what we already have:
   - `owner_phone` on properties table
   - `owner_email` on properties table
   - `owner_flags.phone`, `owner_flags.email`
   - `owner_flags.pr_raw` phone/email fields from PropertyRadar
   - `mailing_address` in owner_flags

2. **Owner identity verification** — Confirm we have the right person:
   - Cross-reference owner_name with county ArcGIS records
   - Check if corporate owner (LLC/Trust) → need to find registered agent
   - For deceased/probate: identify heir or executor (from court records)
   - For divorce: identify which party is on title

3. **Free lookup sources** — Before paid skip-trace:
   - WA Secretary of State (ccfs.sos.wa.gov) for LLC registered agents
   - County recorder for deed/mortgage docs with mailing addresses
   - County assessor for mailing address on file
   - Voter registration (public record in WA)
   - Court filings (names of attorneys, which list phone numbers)

4. **Paid skip-trace recommendation** — If free sources fail:
   - PropertyRadar contact append (if available in our plan)
   - Recommend specific third-party skip-trace services
   - Batch vs single lookup cost comparison
   - Priority: phone > email > mailing address

### For batch processing:

1. **Identify prospects missing contact info** — Query leads where status='prospect' joined to properties where owner_phone IS NULL.

2. **Categorize by difficulty**:
   - Easy: Have mailing address, just need phone (reverse lookup)
   - Medium: Have owner name + county, need everything
   - Hard: Corporate owner, need to pierce LLC veil
   - Very hard: Deceased owner, need heir identification

3. **Batch strategy** — Recommend most efficient approach:
   - How many can be resolved via county records (free)
   - How many need PropertyRadar contact append
   - How many need manual research
   - Expected cost and timeline

## Key files
- `src/lib/county-data.ts` — County owner lookups
- `src/lib/predictive-skiptrace.ts` — Skip trace scoring model
- `src/lib/enrichment-engine.ts` — Where contact data gets filled
