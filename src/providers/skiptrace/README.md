# providers/skiptrace/ — Phone & Email Enrichment

**Role:** Phone/email enrichment for contactability
**Provider:** TBD (evaluate BatchSkipTracing, PropStream skip, or equivalent)
**Phase:** Not started

**Usage rules:**
- Run ONLY on lead promotion to working status
- Run on stale-contact exception (repeated no-answer / wrong number)
- Run on explicit operator request
- Do NOT run on every lead import or every page load

Results stored as artifacts in intel/. Promoted to contact fields in core/ through the standard write path.
