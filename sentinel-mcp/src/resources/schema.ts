/**
 * Static database schema reference resource.
 * Gives Claude the full schema so it can write accurate SQL for run_sql.
 */

export const SCHEMA_TEXT = `# Sentinel Database Schema (20 tables)

## Enums
- lead_status: prospect, lead, negotiation, disposition, nurture, dead, closed
- deal_status: draft, negotiating, under_contract, assigned, closed, dead
- user_role: admin, agent, viewer
- distress_type: probate, pre_foreclosure, tax_lien, code_violation, vacant, divorce, bankruptcy, fsbo, absentee, inherited

## Core Tables

### properties
Primary identity table. Unique on (apn, county).
Columns: id (uuid PK), apn (varchar), county (varchar), address (text), city, state, zip, owner_name (text), owner_phone, owner_email, estimated_value (int), equity_percent (numeric 5,2), bedrooms (int), bathrooms (numeric), sqft (int), year_built (int), lot_size (int), property_type (varchar), owner_flags (jsonb), created_at, updated_at

### leads
Workflow lifecycle. One lead per property.
Columns: id (uuid PK), property_id (FK→properties), contact_id (FK→contacts), status (lead_status), assigned_to (uuid), priority (int 0-100 = composite score), source (varchar), promoted_at, last_contact_at, next_follow_up_at, next_call_scheduled_at, call_sequence_step (int, 1-7), total_calls (int), live_answers (int), voicemails_left (int), call_consent (bool), disposition_code, notes (text), tags (text[]), lock_version (int), created_at, updated_at

### distress_events (append-only, immutable)
Columns: id (uuid PK), property_id (FK→properties), event_type (distress_type), source (varchar), severity (int 1-10), fingerprint (unique dedup key), raw_data (jsonb), confidence (numeric 4,3), created_at

### scoring_records (append-only, immutable)
Columns: id (uuid PK), property_id (FK→properties), model_version (varchar), composite_score (int 0-100), motivation_score (int), deal_score (int), severity_multiplier (numeric), recency_decay (numeric), stacking_bonus (int), owner_factor_score (int), equity_factor_score (numeric), equity_multiplier (numeric), ai_boost (int), factors (jsonb), created_at

### scoring_predictions (append-only, immutable)
Columns: id (uuid PK), property_id (FK→properties), model_version (varchar), predictive_score (int), days_until_distress (int), confidence (numeric), owner_age_inference (int), equity_burn_rate (numeric), absentee_duration_days (int), tax_delinquency_trend (numeric), life_event_probability (numeric), features (jsonb), factors (jsonb), created_at

### contacts
Columns: id (uuid PK), first_name, last_name, phone, email, address, contact_type, source, dnc_status (bool), opt_out (bool), litigant_flag (bool), notes, created_at, updated_at

### deals
Columns: id (uuid PK), lead_id (FK→leads), property_id (FK→properties), status (deal_status), ask_price (int), offer_price (int), contract_price (int), assignment_fee (int), arv (int), repair_estimate (int), buyer_id (FK→contacts), closed_at, created_at, updated_at

### calls_log (append-only)
Columns: id (uuid PK), lead_id (FK→leads), property_id (FK→properties), user_id (uuid), phone_dialed, transferred_to_cell, twilio_sid, disposition (varchar), duration_sec (int), notes, recording_url, transcription, ai_summary, summary_timestamp, started_at, ended_at, created_at

### tasks
Columns: id (uuid PK), title, description, assigned_to (uuid), lead_id (FK→leads), deal_id (FK→deals), due_at, completed_at, priority (int), status (varchar), created_at, updated_at

### campaigns
Columns: id (uuid PK), name, campaign_type, status, audience_filter (jsonb), template_id, sent_count (int), open_count (int), click_count (int), response_count (int), created_by (uuid), created_at, updated_at

### user_profiles
Columns: id (uuid PK = auth.users.id), full_name, email, role (user_role), avatar_url, phone, personal_cell, twilio_phone_number, is_active (bool), saved_dashboard_layout (jsonb), preferences (jsonb), last_seen_at, created_at, updated_at

### offers
Columns: id (uuid PK), deal_id (FK→deals), offer_type, amount (int), terms, status, offered_by (uuid), offered_at, expires_at, response, responded_at, created_at

### event_log (append-only audit trail)
Columns: id (uuid PK), user_id (uuid), action (varchar), entity_type, entity_id, details (jsonb), ip_address, created_at

### audit_log (compliance trail)
Columns: id (uuid PK), action, entity_type, entity_id, actor, lead_id (FK→leads), user_id, details, payload (jsonb), ip_address, created_at

### Compliance Tables
- dnc_list: id, phone (unique), source, notes, created_at
- opt_outs: id, phone (unique), source, reason, created_at
- litigants: id, phone (unique), name, source, created_at

### Google Ads Tables
- ad_snapshots: id, campaign_id, campaign_name, ad_group_id, ad_group_name, ad_id, headline1-3, description1-2, impressions, clicks, ctr, avg_cpc, conversions, cost, roas, quality_score, snapshot_date, raw_json (jsonb), created_at
- ad_reviews: id, snapshot_date, review_type (copy|performance|landing_page|strategy), summary, findings (jsonb), suggestions (jsonb), ai_engine, model_used, tokens_used, approved_by, approved_at, created_at
- ad_actions: id, review_id (FK→ad_reviews), action_type, target_entity, target_id, old_value, new_value, status (suggested|approved|applied|rejected), applied_at, created_at

## Key Relationships
- properties 1→* distress_events, scoring_records, scoring_predictions, leads
- leads 1→* deals, calls_log, tasks
- deals 1→* offers
- user_profiles 1→* leads (assigned_to), calls_log (user_id)

## Team
- Adam D. (admin) — adam@dominionhomedeals.com
- Nathan J. (agent) — nathan@dominionhomedeals.com
- Logan D. (agent) — logan@dominionhomedeals.com

## Score Tiers
- Platinum: composite_score >= 85
- Gold: composite_score >= 65
- Silver: composite_score >= 40
- Bronze: composite_score < 40

## Common Query Patterns
- Latest score: SELECT * FROM scoring_records WHERE property_id = $1 ORDER BY created_at DESC LIMIT 1
- Latest prediction: SELECT * FROM scoring_predictions WHERE property_id = $1 ORDER BY created_at DESC LIMIT 1
- Overdue leads: WHERE next_follow_up_at < NOW() AND status NOT IN ('dead','closed')
- Connect dispositions: 'interested','appointment','contract','nurture','dead','skip_trace','ghost'
- Connect rate: COUNT(*) FILTER (WHERE disposition IN (...connect_dispos...)) / COUNT(*)
`;
