# Lead Table Operator Speed Pass — Design

**Date:** 2026-03-13
**Goal:** Make the lead list actionable enough that Logan can triage and call without clicking into leads.

## Changes

### 1. Source normalization fix
- `sourceMeta()` in lead-table.tsx pipes raw source through `normalizeSource()` before label lookup
- "Bulkseed 1000 20260301" → "CSV Import"

### 2. Compact property data line
- Second line under address: `SFR | 3/2 | 1,450sf | AVM $361k`
- Uses existing LeadRow fields (beds, baths, sqft, estimatedValue, propertyType)
- Muted zinc, text-[10px], graceful fallback for missing fields

### 3. Age timer visual escalation
- Color-code age text in Next Action column:
  - < 24h: zinc (normal)
  - 24-48h: amber
  - 48-72h: orange
  - 72h+: red
- Applied to "First response pending" and "No contact attempt" age displays

### 4. Default sort by urgency-weighted score
- Composite sort: score tier × age penalty
- 91 Platinum at 10 days sorts above 30 Bronze at 14 hours
- Default when no explicit sort selected

### 5. One-click-to-dial on row
- Show full phone number next to owner name (e.g. `(509) 555-1234`)
- Clickable — opens dialer widget pre-loaded with lead
- "No phone" in muted text if missing

### 6. Fix "Urgentmore" chip truncation
- Fix chip overflow/collision in signals column

### 7. Last contact outcome in Next Action
- When lastContactAt exists, show disposition + date: "LVM 3/10"
- Uses existing dispositionCode and lastContactAt from LeadRow

### 8. Log external call button
- "Log call" icon on each lead row
- Minimal modal: disposition dropdown, optional notes, save
- POST to `/api/leads/[id]/log-call`
- Inserts `calls_log`, calls `increment_lead_call_counters` RPC
- Same infrastructure as Twilio calls, no SID required

## Not in scope
- No new database tables
- No scoring algorithm changes
- No push notifications
- No dialer widget changes
- No mobile layout work
