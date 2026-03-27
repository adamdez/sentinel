# Intake Queue Monitoring Dashboard

**Status:** ✅ End-to-End Testing Active
**Date:** 2026-03-27

Use these queries to monitor the intake queue in real-time as you build the UI.

---

## Quick Health Check

### 1. View Latest Intake Leads (Pending Review)

```sql
SELECT
  id,
  owner_name,
  owner_phone,
  source_vendor,
  source_category,
  status,
  created_at
FROM intake_leads
WHERE status = 'pending_review'
ORDER BY created_at DESC
LIMIT 20;
```

**What to watch:**
- ✅ New leads appear within seconds of webhook POST
- ✅ `source_category` is correctly mapped (e.g., "Lead House" for lead_house)
- ✅ `status` is always `'pending_review'` for new intakes

---

### 2. Check SMS Alert Delivery (PPL Leads)

PPL leads trigger SMS alerts to Logan + Adam. To verify:

```sql
SELECT
  id,
  owner_name,
  owner_phone,
  source_vendor,
  created_at,
  CASE
    WHEN source_vendor IN ('lead_house', 'leadhouse', 'ppl_partner_a', 'ppl_partner_b')
    THEN 'SMS ALERT SENT'
    ELSE 'No alert (non-PPL)'
  END as alert_status
FROM intake_leads
ORDER BY created_at DESC
LIMIT 10;
```

**What to watch:**
- ✅ PPL sources (lead_house) should have `alert_status = 'SMS ALERT SENT'`
- ✅ Non-PPL sources (gmail, website) should show 'No alert'
- ⚠️ If SMS didn't go out, check NOTIFY_SMS_NUMBERS env var

---

### 3. Monitor Claimed Leads

Once you claim a lead via UI, check:

```sql
SELECT
  il.id as intake_lead_id,
  il.owner_name,
  il.claimed_by,
  il.claimed_at,
  l.id as lead_id,
  l.from_special_intake,
  l.next_action,
  l.source_category
FROM intake_leads il
LEFT JOIN leads l ON l.intake_lead_id = il.id
WHERE il.status = 'claimed'
ORDER BY il.claimed_at DESC
LIMIT 20;
```

**What to watch:**
- ✅ `claimed_by` is populated (your user ID)
- ✅ `claimed_at` timestamp is recent
- ✅ `lead_id` is created (not null)
- ✅ `from_special_intake = true` on the new lead
- ✅ `next_action = 'review'` (required before auto-dial)
- ✅ `source_category` matches intake provider

---

### 4. Check Auto-Cycle Suppression

Verify special intake leads won't be auto-dialed until approved:

```sql
SELECT
  l.id,
  l.status,
  l.from_special_intake,
  l.next_action,
  il.source_category,
  CASE
    WHEN l.from_special_intake AND l.next_action != 'call'
    THEN '🛑 SKIPPED (awaiting approval)'
    WHEN l.from_special_intake AND l.next_action = 'call'
    THEN '✅ APPROVED (auto-dial enabled)'
    ELSE 'Regular lead (no suppression)'
  END as auto_cycle_status
FROM leads l
LEFT JOIN intake_leads il ON l.intake_lead_id = il.id
WHERE l.from_special_intake = true
ORDER BY l.created_at DESC;
```

**What to watch:**
- ✅ New claimed leads show `🛑 SKIPPED (awaiting approval)`
- ✅ When you set `next_action = 'call'`, status changes to `✅ APPROVED`
- ✅ Auto-redial cron will skip leads with `next_action = 'review'`

---

### 5. Provider Configuration

Check available providers for UI dropdown:

```sql
SELECT id, name, description, is_active
FROM intake_providers
WHERE is_active = true
ORDER BY name;
```

**What to watch:**
- ✅ "Lead House" should be present (default)
- ✅ All providers have `is_active = true`
- ✅ These populate the "Select Provider" dropdown in claim modal

---

### 6. Intake Queue Summary (KPI View)

High-level metrics for dashboard:

```sql
SELECT
  source_category,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending,
  SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
  SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
  SUM(CASE WHEN status = 'duplicate' THEN 1 ELSE 0 END) as duplicate,
  ROUND(100.0 * SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) /
        NULLIF(COUNT(*), 0), 1) as claim_rate_pct
FROM intake_leads
GROUP BY source_category
ORDER BY total DESC;
```

**What to watch:**
- Shows breakdown by PPL partner (Lead House, etc.)
- Claim rate tells you operator throughput
- Duplicates show missed fuzzy matches

---

## Real-Time Monitoring Script

Run this in PostgreSQL client to watch intake_leads as they come in:

```sql
-- Watch new intake_leads in real-time (refresh every 5 seconds)
SELECT
  SUBSTRING(id, 1, 8) as intake_id,
  owner_name,
  owner_phone,
  source_category,
  status,
  CURRENT_TIMESTAMP - created_at as age_seconds
FROM intake_leads
ORDER BY created_at DESC
LIMIT 15;
```

---

## Test Lead Creation Commands

### Create a PPL Lead (Triggers SMS Alert)

```bash
curl -X POST https://sentinel.dominionhomedeals.com/api/inbound/vendor \
  -H "Content-Type: application/json" \
  -H "x-intake-secret: c1de3970584942985c4553072364374a91982828625fa1e35a9216be79f8d320" \
  -d '{
    "source_vendor": "lead_house",
    "source_channel": "vendor_inbound",
    "owner_name": "PPL Test Lead",
    "phone": "5095551234",
    "property_address": "123 Test St",
    "city": "Spokane",
    "state": "WA",
    "zip": "99201",
    "county": "Spokane County",
    "apn": "1234567",
    "notes": "PPL test intake"
  }'
```

### Create an Email Lead (No SMS Alert)

```bash
curl -X POST https://sentinel.dominionhomedeals.com/api/inbound/email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -d '{
    "message_id": "test_email_123",
    "subject": "Email Test Lead",
    "from": "test@example.com",
    "snippet": "Test email intake"
  }'
```

### Create a Webform Lead (No SMS Alert)

```bash
curl -X POST https://sentinel.dominionhomedeals.com/api/inbound/webform \
  -H "Content-Type: application/json" \
  -H "x-intake-secret: c1de3970584942985c4553072364374a91982828625fa1e35a9216be79f8d320" \
  -d '{
    "owner_name": "Webform Test Lead",
    "phone": "5095559999",
    "email": "webform@example.com",
    "property_address": "456 Form St",
    "city": "Coeur d'\''Alene",
    "state": "ID",
    "zip": "83814",
    "county": "Kootenai County"
  }'
```

---

## Known Issues & Workarounds

### Issue: Error Response on Vendor Webhook

**Symptom:** Webhook returns `{"error":"Unable to process inbound vendor lead right now"}`

**Cause:** Response formatting error (catch block triggered), but data IS being inserted into intake_leads.

**Workaround:** Check the database directly — the intake_lead should be created despite the error response.

**Fix:** Update vendor/route.ts to return actual error details instead of generic message.

---

### Issue: SMS Alert Not Received

**Symptom:** PPL lead created but no SMS alert

**Cause:** Either:
1. NOTIFY_SMS_NUMBERS env var not set
2. Twilio credentials missing
3. Alert is fire-and-forget (logged but not visible in response)

**Check:**
```bash
echo "NOTIFY_SMS_NUMBERS env var:" && echo $NOTIFY_SMS_NUMBERS
```

**Workaround:** Check Vercel logs for `[notify] SMS failed:` error messages.

---

### Issue: Claim Endpoint Returns 401 Unauthorized

**Symptom:** POST /api/intake/claim fails with `{"error":"Unauthorized"}`

**Cause:** Bearer token is required but not valid.

**Workaround:** For testing, you need a valid Supabase JWT. You can:
1. Log in to Sentinel UI and use browser console to get token
2. Use curl with Supabase service role key (admin-only workaround)

---

## Metrics to Track During UI Build

As you implement the dashboard, track these:

| Metric | Query | Expected |
|--------|-------|----------|
| Pending intakes | `COUNT(*)` WHERE status='pending_review' | Growing with test leads |
| PPL vs other sources | `source_category` breakdown | > 50% should be Lead House if testing PPL |
| SMS delivery | Manual check after webhook | SMS arrives within 2 seconds |
| Claim success rate | `claimed / total * 100%` | Should grow as you claim leads |
| Auto-cycle suppression | Check lead.next_action | New claims should have 'review' |

---

## UI Implementation Checklist

As you build `/app/intake` dashboard, verify:

- [ ] GET /api/intake/queue works and returns pending leads
- [ ] Filter by `source_category` works (only shows "Lead House" when selected)
- [ ] Filter by `status` works
- [ ] Claim modal populates fields from intake_lead
- [ ] Provider dropdown loads from GET /api/intake/providers
- [ ] POST /api/intake/claim creates lead successfully
- [ ] After claim, lead appears in /app/dialer with special_intake marker
- [ ] Auto-redial cron skips unclaimed leads (check logs)
- [ ] Set next_action='call' enables auto-dial

---

## Debug Queries for Troubleshooting

If something's broken, run these in order:

```sql
-- 1. Are intake_leads being created?
SELECT COUNT(*) FROM intake_leads;

-- 2. Are providers configured?
SELECT * FROM intake_providers WHERE is_active = true;

-- 3. Are leads being created from intakes?
SELECT COUNT(*) FROM leads WHERE from_special_intake = true;

-- 4. Do they have next_action set?
SELECT id, next_action, from_special_intake
FROM leads
WHERE from_special_intake = true
LIMIT 10;

-- 5. Are duplicate detections working?
SELECT COUNT(*) FROM intake_leads
WHERE duplicate_of_lead_id IS NOT NULL;

-- 6. SMS alert mapping (which source_vendors trigger alerts)?
SELECT DISTINCT source_vendor
FROM intake_leads
WHERE source_vendor IN ('lead_house', 'leadhouse', 'ppl_partner_a', 'ppl_partner_b');
```

---

## Next Steps

1. **You:** Build `/app/intake` dashboard with these SQL queries behind GET /api/intake/queue
2. **Claude:** Monitor Vercel logs for errors as you test
3. **Both:** Run monitoring queries after each major UI feature
4. **You:** Test claim modal end-to-end with test leads
5. **Claude:** Check if new claimed leads have correct flags + auto-cycle behavior

---

**Contact:** If you see unexpected behavior, run the monitoring queries above and paste the results — they'll help diagnose fast.

Good luck! 🚀
