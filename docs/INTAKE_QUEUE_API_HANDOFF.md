# Special Lead Intake Queue — API Handoff to UI

**Status:** Phases 1-2 Complete (Database + Ingestion Routes + Claim Endpoint + SMS Alerts)
**Next:** Phase 3 (UI Dashboard) — Cursor owns this
**Date:** 2026-03-27

---

## Overview

The special intake queue is now operational. All inbound leads from webhooks (PPL partners like Lead House), email, and web forms automatically queue in the `intake_leads` table with `status = 'pending_review'`. Logan and Adam get SMS alerts for PPL leads.

**Operators must "claim" intake leads via the UI to create full lead records with:**
- `from_special_intake = true` (auto-cycle suppression flag)
- `source_category` = provider name (Lead House, Gmail, etc.)
- `next_action = 'review'` (requires operator to set before auto-dial)

---

## API Endpoints for UI

### 1. GET /api/intake/providers
Returns list of active intake providers for the claim modal dropdown.

**Request:**
```
GET /api/intake/providers
Authorization: Bearer {user_token}
```

**Response:**
```json
{
  "success": true,
  "providers": [
    {
      "id": "uuid",
      "name": "Lead House",
      "description": "PPL partner - primary source"
    },
    {
      "id": "uuid",
      "name": "Other PPL",
      "description": "Catch-all for other PPL partners"
    }
  ]
}
```

---

### 2. GET /api/intake/queue (TO BE BUILT)
Returns paginated list of pending intake leads with filtering/sorting.

**Request:**
```
GET /api/intake/queue?status=pending_review&source_category=Lead%20House&limit=50&offset=0
Authorization: Bearer {user_token}
```

**Query Parameters:**
- `status` (optional): pending_review | claimed | rejected | duplicate
- `source_category` (optional): Filter by provider name
- `limit` (optional, default 50): Number of records
- `offset` (optional, default 0): Pagination offset
- `sort_by` (optional, default received_at DESC): received_at | owner_name | owner_phone

**Response:**
```json
{
  "success": true,
  "total": 42,
  "leads": [
    {
      "id": "uuid",
      "owner_name": "John Smith",
      "owner_phone": "(509) 555-1234",
      "owner_email": "john@example.com",
      "property_address": "123 Main St",
      "property_city": "Spokane",
      "property_state": "WA",
      "property_zip": "99201",
      "county": "Spokane",
      "apn": "12345678",
      "source_channel": "vendor_inbound",
      "source_vendor": "lead_house",
      "source_category": "Lead House",
      "status": "pending_review",
      "received_at": "2026-03-27T14:30:00Z",
      "duplicate_of_lead_id": null,
      "duplicate_confidence": null,
      "review_notes": null
    }
  ]
}
```

---

### 3. POST /api/intake/claim
Promotes an intake_lead to a full lead record.

**Request:**
```json
POST /api/intake/claim
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "intake_lead_id": "uuid",
  "provider_id": "uuid (from providers dropdown)",
  "owner_name": "John Smith (can override)",
  "owner_phone": "(509) 555-1234",
  "property_address": "123 Main St",
  "property_city": "Spokane",
  "property_state": "WA",
  "property_zip": "99201",
  "apn": "12345678",
  "county": "Spokane County",
  "assign_to": "uuid (optional — user ID to assign lead to, e.g., Logan)",
  "notes": "Optional operator notes about this lead"
}
```

**Response (Success):**
```json
{
  "success": true,
  "lead_id": "uuid",
  "source_category": "Lead House",
  "intake_lead_id": "uuid"
}
```

**Response (Error):**
```json
{
  "error": "Intake lead not found" | "Cannot claim intake lead with status: claimed" | "Missing required fields..."
}
```

---

## Database Schema

### intake_leads Table
```sql
id UUID PRIMARY KEY
raw_payload JSONB                    -- Full original webhook/email/API payload
source_channel VARCHAR               -- e.g., vendor_inbound, email_intake, webform
source_vendor VARCHAR                -- e.g., lead_house, gmail, website
source_category VARCHAR              -- Operator-friendly label (for filtering/KPI)
intake_method VARCHAR                -- Additional metadata
received_at TIMESTAMPTZ              -- When the intake was received
owner_name VARCHAR
owner_phone VARCHAR                  -- E.164 format
owner_email VARCHAR
property_address TEXT
property_city VARCHAR
property_state VARCHAR               -- 2-letter state code
property_zip VARCHAR
county VARCHAR
apn VARCHAR
status VARCHAR                       -- pending_review | claimed | rejected | duplicate
review_notes TEXT                    -- Operator notes during review
reviewed_by UUID REFERENCES auth.users
reviewed_at TIMESTAMPTZ
claimed_by UUID REFERENCES auth.users
claimed_at TIMESTAMPTZ
duplicate_of_lead_id UUID REFERENCES leads
duplicate_confidence SMALLINT        -- 0-100, confidence score
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ

INDEX idx_intake_leads_status
INDEX idx_intake_leads_source_category
INDEX idx_intake_leads_received_at DESC
INDEX idx_intake_leads_owner_phone
INDEX idx_intake_leads_owner_email
```

### leads Table (New Columns)
```sql
intake_lead_id UUID                   -- FK to intake_leads, null for non-intake leads
from_special_intake BOOLEAN           -- true = came from intake queue, requires operator approval
source_category VARCHAR               -- Provider name (Lead House, Gmail, etc.)

INDEX idx_leads_intake_lead_id
INDEX idx_leads_from_special_intake
INDEX idx_leads_source_category
INDEX idx_leads_auto_cycle_suppression (from_special_intake, next_action, status)
```

### intake_providers Table
```sql
id UUID PRIMARY KEY
name VARCHAR UNIQUE                  -- e.g., "Lead House", "PPL Partner A"
webhook_vendor VARCHAR               -- Internal vendor name for detection
description TEXT
is_active BOOLEAN                    -- For UI dropdown filtering
kpi_tracking_enabled BOOLEAN
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ

INDEX idx_intake_providers_active
```

---

## UI Components to Build (Phase 3)

### /app/intake — Intake Dashboard

**Main Page:**
- Filter bar: Status (pending_review/claimed/rejected/duplicate), Source Category (dropdown), Date range
- Metrics strip: Total Pending, Claimed Today, Rejection Rate, Duplicates Detected
- Intake leads table with columns:
  - Owner Name | Phone | Address | Source Category | Received | Status | Actions
  - Inline "Claim Lead" button
  - Inline "Reject" button + note field
  - Click row to see full raw_payload + normalized fields

**"Claim Lead" Modal:**
- Dropdown: Select Provider (populated from /api/intake/providers GET)
- Pre-filled fields (from intake_lead):
  - Owner Name (editable)
  - Owner Phone (editable)
  - Property Address (editable)
  - City, State, Zip (editable)
  - County (editable)
  - APN (editable)
- Checkbox: "Assign to Logan" (optional, defaults to unassigned)
- Notes field (optional)
- "Claim Lead" button → POST to /api/intake/claim
- Shows duplicate warning if `duplicate_confidence > 60`

**Optional KPI Dashboard (second tab):**
- Source Category metrics:
  - Total Intakes | Claimed | Rejected | Duplicates | Claim Rate (%)
  - Grouped by source_category, sorted by claim count
  - Time series (last 30 days)

---

## Data Flow

```
Webhook/Email/API  →  Normalize  →  intake_leads INSERT (pending_review)
                                     ↓
                              SMS Alert to Logan + Adam
                              (PPL sources only)
                                     ↓
                         Operator views /app/intake
                                     ↓
                         Operator clicks "Claim Lead"
                                     ↓
                         Modal: Select provider + edit fields
                                     ↓
                         POST /api/intake/claim
                                     ↓
                    Create: properties, contacts, leads
                    Set: from_special_intake = true
                         intake_lead_id = <id>
                         source_category = <selected_provider>
                         next_action = 'review'
                                     ↓
                    Update intake_leads: status = 'claimed'
                                     ↓
                    Log: dialer_event (special_intake.claimed)
                                     ↓
                         Lead appears in /app/dialer
                    (But auto-cycle skips it until operator
                         sets next_action = 'call')
```

---

## Auto-Cycle Suppression

The cron `/api/cron/jeff-auto-redial` now:
1. Fetches due phones from dialer_auto_cycle_phones
2. For each phone, checks the linked lead's `from_special_intake` flag
3. **Skips** if: `from_special_intake = true` AND `next_action != 'call'`
4. Only fires Jeff if lead is approved (next_action set by operator)

**Log entry:** `special_intake_awaiting_approval (next_action=review)`

---

## Environment Variables Required

**For SMS Alerts:**
```
NOTIFY_SMS_NUMBERS="+15091234567,+15099876543"   # Logan, Adam
```

The existing Twilio vars are already set:
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

---

## Testing Checklist

- [ ] POST /api/inbound/vendor with `source_vendor: "lead_house"` → intake_leads INSERT + SMS alert
- [ ] POST /api/inbound/email with Gmail message → intake_leads INSERT
- [ ] POST /api/inbound/webform with form data → intake_leads INSERT
- [ ] GET /api/intake/providers returns "Lead House" + "Other PPL"
- [ ] GET /api/intake/queue returns pending leads (TO BE BUILT)
- [ ] POST /api/intake/claim creates lead + updates intake_leads status to claimed
- [ ] New claimed lead has from_special_intake = true
- [ ] Auto-redial cron skips unclaimed special intake leads
- [ ] Operator can set next_action = 'call' to enable auto-redial
- [ ] SMS alerts only trigger for PPL sources, not for email/webform

---

## Known Limitations / Future Work

1. **Duplicate Detection:** Currently uses fuzzy matching against existing leads. If both lead exists and no match, duplicate_confidence set to null.
2. **Reject Workflow:** "Reject" button not yet wired — update intake_leads status to 'rejected' + notes.
3. **KPI Dashboard:** Not yet built — will require aggregation query on intake_leads grouped by source_category.
4. **Email Extraction:** Gmail extraction works but raw fields (from, to, subject) need better parsing for property/owner data.

---

## Next Steps

1. **Cursor:** Build `/app/intake` dashboard with filtering, claim modal, KPI view
2. **Cursor:** Wire up "Reject" button to update intake_leads status + add review notes
3. **Cursor:** Create intake queue notification (alert on new pending leads)
4. **Claude:** Build KPI dashboard backend (aggregation queries)
5. **Claude:** Build full email parsing AI (extract property/owner from email body)

---

## Questions / Issues?

- **SMS not sending?** Check NOTIFY_SMS_NUMBERS env var + Twilio credentials
- **Duplicate detection off?** Check findDuplicateCandidate in imports-server.ts
- **Auto-cycle cron errors?** Check /api/cron/jeff-auto-redial logs in Vercel
- **Claim endpoint fails?** Check upsert logic in /api/intake/claim — ensure contact phone has unique constraint

---

**Built by:** Claude Code
**Responsibility handoff:** Cursor (UI), Claude (Remaining backend phases + KPI)
