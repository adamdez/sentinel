# providers/ — External Service Adapters

**Owns:** API authentication, request/response mapping, retries, provenance tracking, rate-limit handling, caching.

**Does not own:** Business decisions, CRM rules, scoring logic, lead routing.

**Primary rule:** Convert provider shapes into Sentinel canonical types. Nothing else.

## Boundary Rules

- Provider-specific field names NEVER leak into `core/`, `dialer/`, `intel/`, or UI components.
- Every provider adapter exports functions that return Sentinel canonical types.
- Every adapter is testable without the full app running (mock the HTTP layer).
- Every adapter handles its own rate limiting, retries, and error mapping.
- Raw provider payloads are stored in `intel/` as artifacts for provenance. The adapter returns the normalized version.

## Adapter interface pattern

Every provider adapter should export:
1. A canonical type mapping (provider fields → Sentinel fields)
2. Functions that accept Sentinel identifiers and return canonical types
3. Error handling that maps provider errors to Sentinel error types
4. Rate-limit configuration
5. Cache policy (see Section 5.5 of the blueprint for freshness rules)

## Current providers

| Folder | Provider | Role | Status |
|--------|----------|------|--------|
| attom/ | ATTOM | Canonical property/owner/mortgage truth | Early stage |
| propertyradar/ | PropertyRadar | Discovery, list building, monitoring, owner graph | Early stage |
| bricked/ | Bricked AI | Comping / underwriting ($49/mo) | Not started |
| regrid/ | Regrid | Parcel geometry / APN normalization (evaluate) | Not started |
| mls/ | Spokane MLS Grid / RESO | Live comps, listing status | Not started |
| skiptrace/ | TBD | Phone/email enrichment | Not started |
| voice/ | Twilio + Synthflow/Vapi | Telephony + voice AI | Partially exists |
| firecrawl/ | Firecrawl | Structured web extraction ($83/mo) | Not started |

## Cost awareness

- ATTOM: API pricing, stage-aware usage (lookup=light, promotion=moderate, offer=deep)
- Bricked AI: $49/mo, cache 7 days, refresh on offer preparation
- Regrid: $375/mo Standard + $0.10/record overage. Enhanced Ownership = Enterprise only.
- Firecrawl: $83/mo Standard (100K credits). FIRE-1 bills on failed requests.
- Skip trace: run ONLY on promotion, stale-contact exception, or operator request
