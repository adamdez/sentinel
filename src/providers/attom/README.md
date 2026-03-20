# providers/attom/ — Canonical Property Facts

**Role:** Normalized property/owner/mortgage/valuation backstop
**Pricing:** API usage-based
**Key endpoints:** /property/snapshot (fast search), /property/detailowner, /property/detailmortgageowner (full card)
**Cache policy:** Static characteristics 30 days. Ownership/mortgage on active leads refresh every 7 days or on stage change.

Do not use ATTOM field names in business logic. Map everything to Sentinel canonical property types.
