# providers/propertyradar/ — Discovery & Monitoring

**Role:** Lead search, list building, monitoring, import-match-append, owner graph, distress signals
**Pricing:** ~$99-199/mo (API tier)
**Integration:** Direct REST API. Has real programmatic API (unlike PropStream which has no API).
**Cache policy:** Active monitoring lists refresh per PropertyRadar's own cadence. Promotion triggers allowed.

Raw payloads never write into Sentinel core tables directly. Promotion triggers go through the intel/ write path.
