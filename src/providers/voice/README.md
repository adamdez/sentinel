# providers/voice/ — Telephony & Voice AI

**Role:** Call control (Twilio), AI receptionist (Synthflow → Vapi), transcription (Deepgram)
**Pricing:** Twilio usage-based, Synthflow $29/mo (Phase 0), Vapi $0.05/min (Phase 6)

Phase 0: Synthflow/Upfirst basic receptionist. External, minimal integration.
Phase 6: Vapi CRM-connected agent querying Sentinel MCP mid-call.

Sentinel's dialer moat is conversation intelligence (seller memory, live AI notes, prompt caching, context injection), not basic phone features. Do not rebuild commodity phone features that a $25/mo tool solves.
