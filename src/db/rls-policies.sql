-- ══════════════════════════════════════════════════════════════════════
-- Sentinel ERP — Row Level Security Policies
-- 3-user RBAC: admin (full), agent (claim-only), viewer (read-only)
-- ══════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE distress_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

-- ── Helper: get current user's role ─────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT get_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ══════════════════════════════════════════════════════════════════════
-- USER PROFILES
-- ══════════════════════════════════════════════════════════════════════

-- Everyone can read all profiles (team visibility)
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "user_profiles_update_admin" ON user_profiles
  FOR UPDATE USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════
-- PROPERTIES
-- ══════════════════════════════════════════════════════════════════════

-- All authenticated users can read properties
CREATE POLICY "properties_select" ON properties
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Admins and agents can insert/update properties
CREATE POLICY "properties_insert" ON properties
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

CREATE POLICY "properties_update" ON properties
  FOR UPDATE USING (get_user_role() IN ('admin', 'agent'));

-- Only admin can delete properties
CREATE POLICY "properties_delete" ON properties
  FOR DELETE USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════
-- DISTRESS EVENTS (append-only, read by all authenticated)
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "distress_events_select" ON distress_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "distress_events_insert" ON distress_events
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

-- No UPDATE/DELETE policies — triggers enforce append-only

-- ══════════════════════════════════════════════════════════════════════
-- SCORING RECORDS (append-only, read by all authenticated)
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "scoring_records_select" ON scoring_records
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "scoring_records_insert" ON scoring_records
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

-- ══════════════════════════════════════════════════════════════════════
-- CONTACTS
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "contacts_select" ON contacts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "contacts_insert" ON contacts
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

CREATE POLICY "contacts_update" ON contacts
  FOR UPDATE USING (get_user_role() IN ('admin', 'agent'));

CREATE POLICY "contacts_delete" ON contacts
  FOR DELETE USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════
-- LEADS
-- Team can view all leads. Owner can edit their assigned leads.
-- Agents can only claim unassigned leads (field-user claim-only).
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "leads_select" ON leads
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "leads_insert" ON leads
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

-- Agents can only update leads assigned to them
CREATE POLICY "leads_update_own" ON leads
  FOR UPDATE USING (
    get_user_role() = 'agent' AND assigned_to = auth.uid()
  );

-- Agents can claim unassigned leads
CREATE POLICY "leads_claim" ON leads
  FOR UPDATE USING (
    get_user_role() = 'agent' AND assigned_to IS NULL
  );

-- Admin can update any lead
CREATE POLICY "leads_update_admin" ON leads
  FOR UPDATE USING (is_admin());

CREATE POLICY "leads_delete" ON leads
  FOR DELETE USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════
-- DEALS
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "deals_select" ON deals
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "deals_insert" ON deals
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

CREATE POLICY "deals_update" ON deals
  FOR UPDATE USING (get_user_role() IN ('admin', 'agent'));

CREATE POLICY "deals_delete" ON deals
  FOR DELETE USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════
-- TASKS
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

-- Agents can only update their own tasks
CREATE POLICY "tasks_update_own" ON tasks
  FOR UPDATE USING (
    get_user_role() = 'agent' AND assigned_to = auth.uid()
  );

CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════
-- CAMPAIGNS
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "campaigns_select" ON campaigns
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "campaigns_insert" ON campaigns
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

CREATE POLICY "campaigns_update" ON campaigns
  FOR UPDATE USING (get_user_role() IN ('admin', 'agent'));

CREATE POLICY "campaigns_delete" ON campaigns
  FOR DELETE USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════
-- OFFERS
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "offers_select" ON offers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "offers_insert" ON offers
  FOR INSERT WITH CHECK (get_user_role() IN ('admin', 'agent'));

CREATE POLICY "offers_update" ON offers
  FOR UPDATE USING (get_user_role() IN ('admin', 'agent'));

-- ══════════════════════════════════════════════════════════════════════
-- EVENT LOG (append-only, readable by admin)
-- ══════════════════════════════════════════════════════════════════════

CREATE POLICY "event_log_select_admin" ON event_log
  FOR SELECT USING (is_admin());

-- Agents can see their own audit entries
CREATE POLICY "event_log_select_own" ON event_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "event_log_insert" ON event_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ══════════════════════════════════════════════════════════════════════
-- REALTIME: enable for key tables
-- ══════════════════════════════════════════════════════════════════════

-- TODO: Run in Supabase Dashboard → Database → Replication
-- ALTER PUBLICATION supabase_realtime ADD TABLE leads;
-- ALTER PUBLICATION supabase_realtime ADD TABLE distress_events;
-- ALTER PUBLICATION supabase_realtime ADD TABLE scoring_records;
-- ALTER PUBLICATION supabase_realtime ADD TABLE deals;
-- ALTER PUBLICATION supabase_realtime ADD TABLE event_log;
