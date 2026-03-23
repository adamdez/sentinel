/**
 * Static database schema reference resource.
 * Gives Claude the full schema so it can write accurate SQL for run_sql.
 */

export const SCHEMA_TEXT = `# Sentinel Database Schema (28 tables)

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
Columns: id (uuid PK), property_id (FK→properties), contact_id (FK→contacts), status (lead_status), assigned_to (uuid), priority (int 0-100 = composite score), source (varchar), promoted_at, last_contact_at, next_follow_up_at, next_call_scheduled_at, call_sequence_step (int, 1-7), total_calls (int), live_answers (int), voicemails_left (int), call_consent (bool), disposition_code, notes (text), tags (text[]), lock_version (int), next_action (text), next_action_due_at, decision_maker_note (text), current_dossier_id (FK→dossiers), motivation_level (smallint), seller_timeline (text), condition_level (smallint), decision_maker_confirmed (bool), price_expectation (numeric), qualification_route (text), qualification_score_total (smallint), seller_situation_summary_short (text, from dossier), recommended_call_angle (text, from dossier), likely_decision_maker (text, from dossier), decision_maker_confidence (text, weak/probable/strong/verified), top_fact_1 (text), top_fact_2 (text), top_fact_3 (text), recommended_next_action (text), property_snapshot_status (text, pending/partial/enriched), comps_status (text, pending/stale/current), opportunity_score (smallint 0-100), contactability_score (smallint 0-100), confidence_score (smallint 0-100), created_at, updated_at

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

## Intelligence Pipeline Tables

### dossiers
AI-generated intelligence briefs. Status lifecycle: proposed → reviewed | flagged → promoted.
Columns: id (uuid PK), lead_id (FK→leads), property_id (FK→properties), status (proposed|reviewed|flagged|promoted), situation_summary (text), likely_decision_maker (text), top_facts (jsonb), recommended_call_angle (text), verification_checklist (jsonb), source_links (jsonb), raw_ai_output (jsonb), ai_run_id (text), reviewed_by (uuid), reviewed_at, review_notes, created_at, updated_at

### dossier_artifacts
Raw evidence from external sources. Each row is one URL/document captured.
Columns: id (uuid PK), lead_id (FK→leads), property_id (FK→properties), dossier_id (FK→dossiers), run_id (FK→research_runs), source_url (text), source_type (probate_filing|assessor|court_record|obituary|news|other), source_label (text), captured_at, extracted_notes (text), raw_excerpt (text), captured_by (uuid), created_at, updated_at

### fact_assertions
Discrete claims extracted from artifacts. Reviewed before contributing to dossiers.
Columns: id (uuid PK), artifact_id (FK→dossier_artifacts), lead_id (FK→leads), run_id (FK→research_runs), fact_type (ownership|deceased|heir|probate_status|financial|property_condition|timeline|contact_info|other), fact_value (text), confidence (unverified|low|medium|high), review_status (pending|accepted|rejected), promoted_field (text), reviewed_by (uuid), reviewed_at, asserted_by (uuid), created_at, updated_at

### research_runs
Groups artifact/fact capture sessions. Status: open → compiled | closed | abandoned.
Columns: id (uuid PK), lead_id (FK→leads), property_id (FK→properties), status, started_by (uuid), started_at, closed_at, notes (text), dossier_id (FK→dossiers), source_mix (jsonb), artifact_count (int), fact_count (int), created_at, updated_at

### source_policies
Per-source-type evidence policy: approved, review_required, blocked.
Columns: id (uuid PK), source_type (text unique), policy (approved|review_required|blocked), rationale (text), updated_by (uuid), updated_at, created_at

### lead_contradiction_flags
Per-lead contradiction findings from deterministic scans.
Columns: id (uuid PK), lead_id (FK→leads), check_type (text), severity (warn|flag), description (text), evidence_a (jsonb), evidence_b (jsonb), fact_id (FK→fact_assertions), artifact_id (FK→dossier_artifacts), status (unreviewed|real|false_positive|resolved), review_note, reviewed_by, reviewed_at, scanned_by, created_at, updated_at

## Control Plane Tables

### agent_runs
Tracks every agent execution with model, tokens, status, and error details.
Columns: id (uuid PK), agent_name (text), model (text), status (running|completed|failed|cancelled), input_summary (text), output_summary (text), tokens_used (int), started_at, completed_at, error_message (text), metadata (jsonb), created_at

### review_queue
Agent proposals awaiting operator approval.
Columns: id (uuid PK), run_id (FK→agent_runs), agent_name (text), entity_type (text), entity_id (uuid), action (text), proposal (jsonb), rationale (text), status (pending|approved|rejected|expired), priority (int), reviewed_by (text), reviewed_at, review_notes (text), expires_at, created_at

### feature_flags
Controls agent behavior: enabled/disabled + mode (off|shadow|review_required|auto).
Columns: id (uuid PK), flag_key (text unique), enabled (bool), mode (text), description (text), metadata (jsonb), created_at, updated_at

### prompt_registry
Prompt versioning with explicit lifecycle. Unique on (workflow, version).
Columns: id (uuid PK), workflow (text), version (text), status (testing|active|deprecated), description (text), changelog (text), registered_by (uuid), updated_by (uuid), created_at, updated_at

### voice_sessions
AI-handled voice calls (Vapi). Dialer domain — volatile session state. Facts stay here until operator promotes.
Columns: id (uuid PK), call_sid (text), vapi_call_id (text), direction (inbound|outbound), from_number (text), to_number (text), lead_id (FK→leads), caller_type (seller|buyer|vendor|spam|unknown), caller_intent (text), status (ringing|ai_handling|transferred|completed|failed|voicemail), transferred_to (text), transfer_reason (text), summary (text), extracted_facts (jsonb), callback_requested (bool), callback_time (text), assistant_id (text), model_used (text), duration_seconds (int), cost_cents (int), recording_url (text), transcript (text), feature_flag (text), run_id (FK→agent_runs), created_at, updated_at, ended_at

## Key Relationships
- properties 1→* distress_events, scoring_records, scoring_predictions, leads
- leads 1→* deals, calls_log, tasks, dossiers, dossier_artifacts, fact_assertions, research_runs, voice_sessions
- dossiers 1→* dossier_artifacts
- dossier_artifacts 1→* fact_assertions
- research_runs 1→* dossier_artifacts, fact_assertions
- deals 1→* offers
- user_profiles 1→* leads (assigned_to), calls_log (user_id)
- leads.current_dossier_id FK→dossiers (most recently promoted dossier)

## Team
- Adam D. (admin) — adam@dominionhomedeals.com
- Guest (agent) — nathan@dominionhomedeals.com
- Logan Anyan (agent) — logan@dominionhomedeals.com

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
