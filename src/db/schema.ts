import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  pgPolicy,
} from "drizzle-orm/pg-core";

// ── Enums ───────────────────────────────────────────────────────────

export const leadStatusEnum = pgEnum("lead_status", [
  "prospect", "lead", "negotiation", "disposition", "nurture", "dead", "closed",
]);

export const dealStatusEnum = pgEnum("deal_status", [
  "draft", "negotiating", "under_contract", "assigned", "closed", "dead",
]);

export const userRoleEnum = pgEnum("user_role", [
  "admin", "agent", "viewer",
]);

export const distressTypeEnum = pgEnum("distress_type", [
  "probate", "pre_foreclosure", "tax_lien", "code_violation",
  "vacant", "divorce", "bankruptcy", "fsbo", "absentee", "inherited",
]);

// ── Properties ──────────────────────────────────────────────────────
// Identity Model: APN + county = immutable property identity.
// Upserts mandatory. No SELECT-then-INSERT.

export const properties = pgTable("properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  apn: varchar("apn", { length: 50 }).notNull(),
  county: varchar("county", { length: 100 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }).notNull().default(""),
  state: varchar("state", { length: 2 }).notNull().default(""),
  zip: varchar("zip", { length: 10 }).notNull().default(""),
  ownerName: text("owner_name").notNull(),
  ownerPhone: varchar("owner_phone", { length: 20 }),
  ownerEmail: varchar("owner_email", { length: 255 }),
  estimatedValue: integer("estimated_value"),
  equityPercent: numeric("equity_percent", { precision: 5, scale: 2 }),
  bedrooms: integer("bedrooms"),
  bathrooms: numeric("bathrooms", { precision: 3, scale: 1 }),
  sqft: integer("sqft"),
  yearBuilt: integer("year_built"),
  lotSize: integer("lot_size"),
  propertyType: varchar("property_type", { length: 50 }),
  ownerFlags: jsonb("owner_flags").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_apn_county").on(table.apn, table.county),
  index("idx_properties_county").on(table.county),
  index("idx_properties_owner").on(table.ownerName),
  index("idx_properties_zip").on(table.zip),
]);

// ── Distress Events ─────────────────────────────────────────────────
// Signal Domain: append-only, deduplicated by fingerprint.
// Never mutates scoring_records, lead_instances, or workflow state.

export const distressEvents = pgTable("distress_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  eventType: distressTypeEnum("event_type").notNull(),
  source: varchar("source", { length: 100 }).notNull(),
  severity: integer("severity").notNull().default(5),
  fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
  rawData: jsonb("raw_data").notNull().default({}),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_distress_fingerprint").on(table.fingerprint),
  index("idx_distress_property").on(table.propertyId),
  index("idx_distress_type").on(table.eventType),
  index("idx_distress_created").on(table.createdAt),
]);

// ── Scoring Records ─────────────────────────────────────────────────
// Scoring Domain: append-only, versioned, deterministic, replayable.
// Never mutates workflow.

export const scoringRecords = pgTable("scoring_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  modelVersion: varchar("model_version", { length: 20 }).notNull(),
  compositeScore: integer("composite_score").notNull(),
  motivationScore: integer("motivation_score").notNull(),
  dealScore: integer("deal_score").notNull(),
  severityMultiplier: numeric("severity_multiplier", { precision: 4, scale: 2 }).notNull(),
  recencyDecay: numeric("recency_decay", { precision: 4, scale: 2 }).notNull(),
  stackingBonus: integer("stacking_bonus").notNull().default(0),
  ownerFactorScore: integer("owner_factor_score").notNull().default(0),
  equityFactorScore: numeric("equity_factor_score", { precision: 6, scale: 2 }).notNull().default("0"),
  aiBoost: integer("ai_boost").notNull().default(0),
  factors: jsonb("factors").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_scoring_property").on(table.propertyId),
  index("idx_scoring_composite").on(table.compositeScore),
  index("idx_scoring_version").on(table.modelVersion),
  index("idx_scoring_created").on(table.createdAt),
]);

// ── Contacts ────────────────────────────────────────────────────────

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  contactType: varchar("contact_type", { length: 50 }).notNull().default("owner"),
  source: varchar("source", { length: 100 }),
  dncStatus: boolean("dnc_status").notNull().default(false),
  optOut: boolean("opt_out").notNull().default(false),
  litigantFlag: boolean("litigant_flag").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_contacts_phone").on(table.phone),
  index("idx_contacts_email").on(table.email),
  index("idx_contacts_name").on(table.lastName, table.firstName),
]);

// ── Leads ───────────────────────────────────────────────────────────
// Workflow Domain: temporal acquisition lifecycle.
// Concurrency-safe claiming, optimistic locking, status guardrails.

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  status: leadStatusEnum("status").notNull().default("prospect"),
  assignedTo: uuid("assigned_to"),
  priority: integer("priority").notNull().default(0),
  source: varchar("source", { length: 100 }),
  promotedAt: timestamp("promoted_at", { withTimezone: true }),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  dispositionCode: varchar("disposition_code", { length: 50 }),
  notes: text("notes"),
  tags: text("tags").array().notNull().default([]),
  lockVersion: integer("lock_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_leads_property").on(table.propertyId),
  index("idx_leads_assigned").on(table.assignedTo),
  index("idx_leads_status").on(table.status),
  index("idx_leads_priority").on(table.priority),
  index("idx_leads_follow_up").on(table.nextFollowUpAt),
]);

// ── Deals ───────────────────────────────────────────────────────────

export const deals = pgTable("deals", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  status: dealStatusEnum("status").notNull().default("draft"),
  askPrice: integer("ask_price"),
  offerPrice: integer("offer_price"),
  contractPrice: integer("contract_price"),
  assignmentFee: integer("assignment_fee"),
  arv: integer("arv"),
  repairEstimate: integer("repair_estimate"),
  buyerId: uuid("buyer_id").references(() => contacts.id, { onDelete: "set null" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_deals_lead").on(table.leadId),
  index("idx_deals_status").on(table.status),
  index("idx_deals_property").on(table.propertyId),
]);

// ── Tasks ───────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assignedTo: uuid("assigned_to").notNull(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  priority: integer("priority").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_tasks_assigned").on(table.assignedTo),
  index("idx_tasks_due").on(table.dueAt),
  index("idx_tasks_status").on(table.status),
]);

// ── Campaigns ───────────────────────────────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  campaignType: varchar("campaign_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  audienceFilter: jsonb("audience_filter").notNull().default({}),
  templateId: varchar("template_id", { length: 100 }),
  sentCount: integer("sent_count").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  responseCount: integer("response_count").notNull().default(0),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_campaigns_status").on(table.status),
  index("idx_campaigns_type").on(table.campaignType),
]);

// ── Offers ──────────────────────────────────────────────────────────

export const offers = pgTable("offers", {
  id: uuid("id").defaultRandom().primaryKey(),
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  offerType: varchar("offer_type", { length: 50 }).notNull(),
  amount: integer("amount").notNull(),
  terms: text("terms"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  offeredBy: uuid("offered_by").notNull(),
  offeredAt: timestamp("offered_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  response: text("response"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_offers_deal").on(table.dealId),
  index("idx_offers_status").on(table.status),
]);

// ── Scoring Predictions ─────────────────────────────────────────────
// Predictive Scoring Domain: append-only, versioned, deterministic.
// Stores forward-looking distress probability from the v2.0 model.

export const scoringPredictions = pgTable("scoring_predictions", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  modelVersion: varchar("model_version", { length: 20 }).notNull(),
  predictiveScore: integer("predictive_score").notNull(),
  daysUntilDistress: integer("days_until_distress").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
  ownerAgeInference: integer("owner_age_inference"),
  equityBurnRate: numeric("equity_burn_rate", { precision: 8, scale: 4 }),
  absenteeDurationDays: integer("absentee_duration_days"),
  taxDelinquencyTrend: numeric("tax_delinquency_trend", { precision: 8, scale: 4 }),
  lifeEventProbability: numeric("life_event_probability", { precision: 5, scale: 2 }),
  features: jsonb("features").notNull().default({}),
  factors: jsonb("factors").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_predictions_property").on(table.propertyId),
  index("idx_predictions_score").on(table.predictiveScore),
  index("idx_predictions_days").on(table.daysUntilDistress),
  index("idx_predictions_version").on(table.modelVersion),
  index("idx_predictions_created").on(table.createdAt),
]);

// ── Event Log ───────────────────────────────────────────────────────
// Append-only audit trail. No updates or deletes allowed.

export const eventLog = pgTable("event_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  details: jsonb("details").notNull().default({}),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_event_log_user").on(table.userId),
  index("idx_event_log_entity").on(table.entityType, table.entityId),
  index("idx_event_log_action").on(table.action),
  index("idx_event_log_created").on(table.createdAt),
]);

// ── Google Ads: Enums ────────────────────────────────────────────────

export const adReviewTypeEnum = pgEnum("ad_review_type", [
  "copy", "performance", "landing_page", "strategy",
]);

export const adActionTypeEnum = pgEnum("ad_action_type", [
  "bid_adjust", "pause_keyword", "enable_keyword", "update_copy",
  "add_keyword", "budget_adjust", "pause_ad", "enable_ad",
]);

export const adActionStatusEnum = pgEnum("ad_action_status", [
  "suggested", "approved", "applied", "rejected",
]);

// ── Google Ads: Snapshots ───────────────────────────────────────────
// Daily performance snapshot pulled from Google Ads API.

export const adSnapshots = pgTable("ad_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: varchar("campaign_id", { length: 50 }).notNull(),
  campaignName: varchar("campaign_name", { length: 255 }).notNull(),
  adGroupId: varchar("ad_group_id", { length: 50 }),
  adGroupName: varchar("ad_group_name", { length: 255 }),
  adId: varchar("ad_id", { length: 50 }),
  headline1: text("headline1"),
  headline2: text("headline2"),
  headline3: text("headline3"),
  description1: text("description1"),
  description2: text("description2"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  ctr: numeric("ctr", { precision: 8, scale: 4 }),
  avgCpc: numeric("avg_cpc", { precision: 10, scale: 2 }),
  conversions: numeric("conversions", { precision: 10, scale: 2 }).default("0"),
  cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default("0"),
  roas: numeric("roas", { precision: 10, scale: 2 }),
  qualityScore: integer("quality_score"),
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull(),
  rawJson: jsonb("raw_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ad_snapshots_campaign").on(table.campaignId),
  index("idx_ad_snapshots_date").on(table.snapshotDate),
  index("idx_ad_snapshots_ad").on(table.adId),
]);

// ── Google Ads: AI Reviews ──────────────────────────────────────────
// Claude/Grok analysis of ad performance, copy quality, landing page.

export const adReviews = pgTable("ad_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull(),
  reviewType: adReviewTypeEnum("review_type").notNull(),
  summary: text("summary").notNull(),
  findings: jsonb("findings").notNull().default([]),
  suggestions: jsonb("suggestions").notNull().default([]),
  aiEngine: varchar("ai_engine", { length: 20 }).notNull(),
  modelUsed: varchar("model_used", { length: 50 }),
  tokensUsed: integer("tokens_used"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ad_reviews_date").on(table.snapshotDate),
  index("idx_ad_reviews_type").on(table.reviewType),
]);

// ── Google Ads: Actions ─────────────────────────────────────────────
// Concrete actions (approve/reject) — bid changes, copy edits, etc.

export const adActions = pgTable("ad_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewId: uuid("review_id").references(() => adReviews.id, { onDelete: "cascade" }),
  actionType: adActionTypeEnum("action_type").notNull(),
  targetEntity: varchar("target_entity", { length: 50 }).notNull(),
  targetId: varchar("target_id", { length: 100 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  status: adActionStatusEnum("status").notNull().default("suggested"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_ad_actions_review").on(table.reviewId),
  index("idx_ad_actions_status").on(table.status),
]);

// ── User Profiles ───────────────────────────────────────────────────
// Links to Supabase auth.users. Stores dashboard layout as JSONB.

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("agent"),
  avatarUrl: text("avatar_url"),
  phone: varchar("phone", { length: 20 }),
  personalCell: varchar("personal_cell", { length: 20 }),
  isActive: boolean("is_active").notNull().default(true),
  savedDashboardLayout: jsonb("saved_dashboard_layout"),
  preferences: jsonb("preferences").notNull().default({}),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_user_profiles_email").on(table.email),
  index("idx_user_profiles_role").on(table.role),
]);
