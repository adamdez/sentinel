# Sentinel System Test Checklist

> Complete end-to-end test of every user-facing feature.
> Test as both Adam (admin) and Logan (operator/caller).
> Mark each item: PASS / FAIL / PARTIAL / N/A

---

## 1. AUTHENTICATION & SESSION

- [ ] Login with email/password works
- [ ] Session persists across page refresh
- [ ] Unauthorized access redirects to login
- [ ] User avatar + name shows in top-right corner
- [ ] Logout works (avatar dropdown)

---

## 2. GLOBAL NAVIGATION

### Sidebar
- [ ] "Today" (Dashboard) link works
- [ ] "Lead Queue" link works
- [ ] "Dialer" link works
- [ ] "Dispo" link works
- [ ] "Pipeline" link works
- [ ] TOOLS section expands: Property Research, Buyers, Contacts, Ads, Campaigns
- [ ] REVIEW section expands: Research Review, Call QA, Call Review, Review Console
- [ ] ADMIN section expands: Analytics, Settings, Gmail, Import, Grok
- [ ] Active page is highlighted in sidebar
- [ ] Badge on "Ads" shows unread alert count (if any)
- [ ] Badge on "Research Review" shows pending review count (if any)

### Global Search (Ctrl+K / Cmd+K)
- [ ] Search bar opens on keyboard shortcut
- [ ] Search by address returns matching leads
- [ ] Search by owner name returns matching leads
- [ ] Search by phone number (partial) returns matches
- [ ] Search by email returns matching contacts
- [ ] Clicking a result navigates to the correct lead/contact
- [ ] Empty search shows placeholder text
- [ ] Escape closes search

### Theme
- [ ] Light mode renders correctly (no invisible text, proper contrast)
- [ ] Dark mode renders correctly
- [ ] Theme toggle works (avatar dropdown or settings)
- [ ] Theme persists across sessions

---

## 3. DASHBOARD (Today)

### Layout
- [ ] Page loads without errors
- [ ] "Today" title with date shown
- [ ] "+ New Seller Lead" button visible in top-right

### Stat Cards
- [ ] Active pipeline count shows (excludes staging/prospect)
- [ ] Pipeline value shows (sum of ARVs for active leads)
- [ ] Overdue follow-ups count shows (red if > 0)
- [ ] Speed to lead metric shows

### Daily Brief Widget
- [ ] Priority leads list renders (top 10 by score)
- [ ] Each lead shows address, score, urgency
- [ ] Clicking a lead opens the Master Client File modal

### Missed Opportunity Queue
- [ ] Shows leads with no contact attempt > X days
- [ ] Each row shows address, age, score
- [ ] Clicking navigates to lead

### KPI Summary Row
- [ ] Source attribution metrics render
- [ ] Period matches selected timeframe

### Live Map Widget
- [ ] Map renders with lead pins
- [ ] Shows active pipeline leads (not staging/prospect)
- [ ] Pins are clickable or show tooltips

### Stalled Deals
- [ ] Shows leads stuck in a stage > X days
- [ ] Displays property address (not lead ID)
- [ ] Clicking navigates to lead

---

## 4. LEAD QUEUE

### Lead List
- [ ] Page loads showing leads in a table
- [ ] Columns visible: Property/Owner, Score, Next Action, Last Contact
- [ ] Score badges show correct colors (green=TOP, blue=HIGH, amber=MED, red=LOW)
- [ ] Next action text shows with overdue warning (red) if past due
- [ ] "No contact attempt" warning shows for untouched leads
- [ ] Lead count badge shows total in view

### Tabs
- [ ] "My Leads" tab shows only leads assigned to current user
- [ ] "Team Leads" tab shows all leads across team
- [ ] "Logan's Leads" tab shows leads assigned to Logan
- [ ] Tab counts are accurate

### Filters
- [ ] Market filter (Spokane / Kootenai / All) works
- [ ] Focus filters work: Overdue, Qualify, Slow Response
- [ ] Search box filters by name, address, phone, email, zip
- [ ] Filters apply immediately (no page reload needed)

### Lead Actions
- [ ] Clicking a lead row opens the Master Client File modal
- [ ] Phone icon initiates a call (or shows phone number)
- [ ] Trash icon shows confirmation dialog
- [ ] Confirming delete removes the lead
- [ ] Delete success shows toast: "Deleted: [owner name]"
- [ ] Deleted lead disappears from list without page refresh
- [ ] Bulk select (checkbox) selects multiple leads
- [ ] Bulk delete works for selected leads

### Create New Lead
- [ ] "+ New Seller Lead" button opens NewProspectModal
- [ ] Required fields: Address, Owner Name
- [ ] Optional fields: Phone, Email, Source, Notes
- [ ] Saving creates the lead and shows success toast
- [ ] New lead appears in list after creation
- [ ] Duplicate detection warns if address already exists

---

## 5. MASTER CLIENT FILE (MCF) MODAL

### Opening & Navigation
- [ ] Opens when clicking any lead in Lead Queue, Pipeline, or Dashboard
- [ ] Header shows: address, owner name, score badge
- [ ] Close button (X) closes modal
- [ ] Tab navigation works: Overview, Comps, Contact, PSA, History, Calculator, Documents

### Overview Tab
- [ ] Seller snapshot: name, phone, score, qualification status
- [ ] MAO/Valuation section shows ARV, MAO, confidence level
- [ ] Bricked AI data shows: Est. Repairs, CMV, "View Bricked Report" link
- [ ] County GIS data shows: assessed value, land/improvement split, last sale
- [ ] Tax exemption flag shows in amber (if present)
- [ ] Vacant lot flag shows in amber (if present)
- [ ] Mortgage detail table renders (position, lender, amount, rate, maturity)
- [ ] Sale history timeline renders (date, amount, method, buyer)
- [ ] MLS listing history renders (date, status, price, DOM, agent)
- [ ] Monetizability score shows (if Adam has rated it)
- [ ] Dispo friction level shows (if set)
- [ ] Qualification section shows gaps (motivation, timeline, condition, etc.)
- [ ] Score breakdown shows AI factor weights
- [ ] Contradiction flags highlighted (if facts conflict)
- [ ] Next action card is visible and editable
- [ ] Stage selector works (dropdown to change lead status)
- [ ] Stage change enforces next_action requirement

### Comps & ARV Tab
- [ ] Subject property header shows: address, beds/baths/sqft/year, AVM, equity
- [ ] Photo carousel shows property images (Bricked + PropertyRadar + Google)
- [ ] Decision Summary shows ARV, MAO, confidence badge, comp count
- [ ] "View Bricked Report" link opens Bricked dashboard in new tab
- [ ] Repair Estimate panel expands showing itemized repair costs + total
- [ ] Bricked comp cards show when no manual comps selected (address, price, sqft)
- [ ] Map renders with subject (orange) and comp pins (cyan) — if coords available
- [ ] No-coords banner shows with "Retry Geocode" button if address can't be located
- [ ] Research Mode auto-expanded (no extra click needed)
- [ ] Comp search returns results within radius
- [ ] Adding a comp updates the ARV calculation
- [ ] Removing a comp updates the ARV calculation
- [ ] Condition adjustment slider changes ARV
- [ ] Comp quality labels colored correctly (Strong=green, Usable=amber, Weak=red)
- [ ] Offer % slider adjusts MAO in real-time
- [ ] Warnings show for low comp count, high spread, missing condition

### Contact Tab
- [ ] Primary phone number displayed
- [ ] Call button works (or shows number)
- [ ] Copy phone to clipboard works
- [ ] Email address displayed (if available)
- [ ] Skip-trace status badge shows
- [ ] Contact info hides "Unknown 0% confidence" entries

### PSA (Property & Seller Assessment) Tab
- [ ] Seller names title-cased properly
- [ ] County names title-cased properly
- [ ] Synthetic APNs filtered out
- [ ] Property details section renders (beds, baths, sqft, year, lot)
- [ ] Ownership section renders (owner type, length, occupancy)

### History Tab
- [ ] Activity timeline shows calls, notes, stage changes, events
- [ ] Each entry has timestamp, action type, details
- [ ] Distress events show with severity badge (not just type)
- [ ] Call entries show duration and outcome
- [ ] Stage change entries show from → to

### Calculator Tab
- [ ] ARV auto-fills from comps (or estimated value or manual)
- [ ] Source label shows: "Auto-filled from comps" or "from estimated value" or "Enter manually"
- [ ] Bricked repair cost pre-fills Estimated Repairs field
- [ ] Purchase % slider works (50-90%)
- [ ] MAO calculates correctly: (ARV x %) - Repairs
- [ ] Large MAO number displays prominently
- [ ] Assignment fee explanation text shows

### Documents Tab
- [ ] Document list renders (if any attached)
- [ ] Upload button works
- [ ] Download/view links work

### Delete from MCF
- [ ] Delete button available somewhere in MCF
- [ ] Confirmation modal appears
- [ ] Confirming deletes the lead and closes modal
- [ ] Lead disappears from all views after deletion

---

## 6. PIPELINE BOARD

### Layout
- [ ] Page loads showing Kanban columns
- [ ] Columns: Active, Negotiation, Disposition, Nurture, Closed, Dead
- [ ] "Active" column does NOT show staging or prospect leads
- [ ] Column headers show card count badges
- [ ] Empty columns show "Empty" placeholder

### Cards
- [ ] Each card shows: address, owner name, score badge
- [ ] Overdue indicator shows in red if follow-up past due
- [ ] Phone icon on card initiates call
- [ ] Clicking card opens MCF modal

### Drag & Drop
- [ ] Dragging a card to another column works
- [ ] Stage change persists after page refresh
- [ ] Moving to negotiation/disposition requires next_action (modal prompt appears)
- [ ] Next action modal has input field, Enter/Escape keyboard support
- [ ] Cancel drag restores card to original column
- [ ] Failed stage change shows error toast with reason
- [ ] Successful stage change shows success toast

### Filter
- [ ] "Filter by name or address" input filters visible cards
- [ ] Refresh button reloads pipeline data

---

## 7. DIALER

### Dialer Page Load
- [ ] Page loads without errors
- [ ] VoIP status badge shows: "Online" (green) or "Offline" (gray)
- [ ] If offline, "Reconnect" button appears
- [ ] KPI cards show: Outbound, Inbound, Answered, Avg Talk Time, Team stats
- [ ] Period selector works: Today, This Week, This Month, All Time

### Call Queue
- [ ] Next lead in queue shows with full context
- [ ] Lead address, owner name, phone number visible
- [ ] Score badge and relationship indicator show
- [ ] Previous call context shows (if returning caller)

### Making a Call
- [ ] Click "Call" initiates VoIP call via Twilio
- [ ] Call timer starts counting
- [ ] Mute button toggles mic
- [ ] Hold button works
- [ ] Hang up button ends call
- [ ] Call recording indicator shows (if recording enabled)

### During Call
- [ ] Live notes panel available for typing
- [ ] Seller memory panel shows previous call context
- [ ] Pre-call brief shows lead summary and history
- [ ] AI suggestions appear (if enabled)

### Post-Call Flow
- [ ] Post-call panel appears after hang up
- [ ] Call outcome selector: Appointment, Follow-up, Dead, Voicemail, Wrong #, DNC
- [ ] Structured notes capture fields appear
- [ ] Next action is REQUIRED before saving (enforced)
- [ ] "Publish" button saves call data
- [ ] Success toast shows after publish
- [ ] Warning toasts show if seller memory or post-call structure failed
- [ ] Published data appears in lead's History tab

### Seller Memory Panel (Right Side)
- [ ] Deal temperature badge shows (Hot/Warm/Cool/Cold) with correct colors
- [ ] Decision maker note shows with "Confirmed" or "AI-derived" badge
- [ ] Callback timing hint shows
- [ ] Last call promises shows
- [ ] Last call objection shows
- [ ] Last call next action shows
- [ ] Recent call history list shows
- [ ] "First contact" message shows for new leads (no prior calls)
- [ ] "Structured memory will populate after next call" hint shows when appropriate

### Lead Dossier Panel (Right Side)
- [ ] Dossier summary shows (if research agent has run)
- [ ] Empty state shows property basics when no dossier exists
- [ ] "Request Research" button works
- [ ] Distress event badges show

---

## 8. DISPO (Disposition)

### Dispo Page
- [ ] Outreach funnel visualization renders
- [ ] Deal cards show: address, buyer count, status, days in dispo
- [ ] Funnel stats are accurate

### Per-Deal Actions
- [ ] Assign buyer button opens BuyerSearchModal
- [ ] Mark buyer status: Interested, Offered, Selected, Passed
- [ ] Log call to buyer works
- [ ] Move to next stage works
- [ ] Days-in-dispo counter is accurate

---

## 9. BUYERS

### Buyer List
- [ ] Page loads with buyer cards/table
- [ ] Search by name, market, strategy works
- [ ] Filters: Market, Asset type, Strategy, POF status, Tags
- [ ] Buyer count shown

### Per-Buyer Actions
- [ ] Click buyer opens detail modal
- [ ] Edit name, strategy, markets, contact info
- [ ] POF status badge shows correct color
- [ ] Deal history visible
- [ ] Stale buyer warning shows (90+ days no contact)

### Create Buyer
- [ ] Plus button opens create form
- [ ] Required: Name, Strategy, Market
- [ ] Save creates buyer, shows toast

---

## 10. PROPERTY RESEARCH

### Lookup Tool
- [ ] Address autocomplete works (type and suggestions appear)
- [ ] Selecting suggestion auto-fills address
- [ ] Submit triggers provider lookups
- [ ] Results show grouped by provider (Bricked, PropertyRadar, County GIS)
- [ ] Each fact shows field name, value, confidence badge
- [ ] Cached indicator shows if result from cache
- [ ] "Create Lead" button available if property not already in system
- [ ] Error handling: provider failure shows message with retry option

---

## 11. CONTACTS

- [ ] Contact list loads with pagination
- [ ] Search by name, phone, email works
- [ ] Stats show: total contacts, with phone, with email
- [ ] Click contact opens detail view
- [ ] Contact type badges show (Seller, Buyer, Vendor)

---

## 12. ADS COMMAND CENTER

### Tabs
- [ ] Dashboard tab: campaign metrics render (impressions, clicks, cost, conversions)
- [ ] Ad Groups tab: active groups with bids and status
- [ ] Approvals tab: pending items with approve/reject buttons
- [ ] Intelligence tab: AI recommendations render
- [ ] Copy Lab tab: AI-generated ad copy with copy-to-clipboard
- [ ] Landing Page tab: editor renders
- [ ] Chat tab: AI chat interface works
- [ ] System Prompt tab: prompt text visible

### Actions
- [ ] Approve ad works (toast confirmation)
- [ ] Reject ad works (toast confirmation)
- [ ] Market filter (Spokane/Kootenai/All) filters data
- [ ] Pause/Resume campaign toggle works

---

## 13. GMAIL INTEGRATION

- [ ] Gmail page loads
- [ ] Connection status shows (Connected/Disconnected)
- [ ] If disconnected: "Connect Gmail" button starts OAuth flow
- [ ] If connected: shows email address
- [ ] Inbox folder shows messages with unread count
- [ ] Sent folder shows sent messages
- [ ] Click message opens detail view
- [ ] Reply/compose form works
- [ ] Send email delivers successfully
- [ ] Email templates dropdown works
- [ ] Refresh button syncs new messages

---

## 14. IMPORT (CSV Upload)

### Step 1: Upload
- [ ] Drag-and-drop file upload works
- [ ] File picker works
- [ ] CSV and Excel files accepted
- [ ] File size shown after upload

### Step 2: Preview & Mapping
- [ ] Sheet selector appears for multi-sheet workbooks
- [ ] Header row auto-detected
- [ ] Field mappings auto-suggested with confidence scores
- [ ] Manual mapping editor allows changing mappings
- [ ] Source Channel, Niche Tag, Batch ID configurable

### Step 3: Configure
- [ ] Default values settable (Source Channel, Outreach Type, etc.)
- [ ] Preview counts shown (total, duplicates, skipped, errors)
- [ ] Approval button to proceed

### Step 4: Importing
- [ ] Progress bar shows during import
- [ ] Status updates: "Importing X of Y"

### Step 5: Results
- [ ] Summary stats: imported, updated, duplicates, skipped, errors
- [ ] Error log shows (if errors)
- [ ] Imported leads appear in Lead Queue
- [ ] Imported leads go to staging status (NOT pipeline)
- [ ] Imported leads do NOT appear in Pipeline board

---

## 15. ANALYTICS

- [ ] Period selector works: Today, This Week, This Month, All Time
- [ ] Market scoreboard shows per-county stats (Spokane vs Kootenai)
- [ ] Source performance table renders
- [ ] Pipeline health metrics render
- [ ] Watch-out alerts show (red/yellow flags)
- [ ] Clicking alerts navigates to relevant page

---

## 16. SETTINGS

### Main Settings
- [ ] Theme selector works
- [ ] Personal cell phone input saves
- [ ] Save confirmation toast shows

### Agent Controls
- [ ] Feature flags grid renders
- [ ] Toggle switches work (enable/disable)
- [ ] Mode selector works (Off, Shadow, Review Required, Auto)
- [ ] Changes persist after page refresh

### Prompt Registry
- [ ] Workflow sections expandable
- [ ] Version history visible per workflow
- [ ] Status badges show (active, deprecated, etc.)

### Other Settings Subpages
- [ ] Voice Registry page loads
- [ ] Trust Language page loads
- [ ] Source Policies page loads
- [ ] Outbound Pilot page loads

---

## 17. GROK (Debug Tool)

- [ ] Chat interface loads
- [ ] Suggested prompts clickable
- [ ] Typing a question and submitting gets AI response
- [ ] Action blocks in responses are clickable
- [ ] Delete history button works
- [ ] Copy button on code blocks works

---

## 18. SCHEDULED AUTOMATIONS

- [ ] DB integrity audit runs at 2am (check Supabase logs)
- [ ] Morning brief runs at 7am Mon-Sat (check n8n or cron logs)
- [ ] Weekly health runs Monday 9am (check logs)
- [ ] Overdue follow-up notifications fire correctly

---

## 19. DATA INTEGRITY

### Lead Lifecycle
- [ ] New lead created → status = staging or prospect
- [ ] Lead assigned → shows in assignee's "My Leads"
- [ ] Lead promoted to "lead" status → appears in Pipeline "Active" column
- [ ] Lead moved to negotiation → appears in Negotiation column
- [ ] Lead moved to disposition → appears in Dispo page
- [ ] Lead moved to closed → appears in Closed column
- [ ] Lead moved to dead → appears in Dead column
- [ ] Lead moved to nurture → appears in Nurture column
- [ ] Deleted lead disappears from ALL views (queue, pipeline, dispo, search)

### Next Action Enforcement
- [ ] Cannot advance lead without setting next_action
- [ ] Next action due date creates a visible follow-up
- [ ] Overdue next actions show red in Lead Queue
- [ ] Overdue count updates on dashboard

### Scoring
- [ ] New leads get scored automatically
- [ ] Score updates when enrichment data arrives
- [ ] Score badge reflects current score tier (TOP/HIGH/MED/LOW)
- [ ] Score is consistent across all views (queue, pipeline, MCF, dialer)

### Provider Data Flow
- [ ] Bricked AI data flows: API → raw_artifacts → fact_assertions → ownerFlags → UI
- [ ] County GIS data flows: ArcGIS → raw_artifacts → fact_assertions → ownerFlags → UI
- [ ] PropertyRadar data flows correctly through pipeline
- [ ] No provider field names visible in UI (canonical names only)

---

## 20. EDGE CASES & ERROR HANDLING

### Empty States
- [ ] Dashboard with no leads shows appropriate empty message
- [ ] Pipeline with no active leads shows "Empty" in columns
- [ ] Lead Queue with no results shows empty state
- [ ] MCF Comps tab with no comps shows "No comps selected" message
- [ ] Seller Memory with no calls shows "First contact" message
- [ ] Dossier panel with no research shows property basics fallback

### Error States
- [ ] Network timeout shows error toast with retry option
- [ ] API 500 error shows "Something went wrong" (not raw error)
- [ ] Supabase auth expiry prompts re-login
- [ ] VoIP disconnection shows "Offline" badge (not error toast spam)
- [ ] Geocoding failure shows "Retry Geocode" (doesn't block tab)

### Performance
- [ ] Dashboard loads in < 3 seconds
- [ ] Lead Queue loads in < 3 seconds
- [ ] Pipeline loads in < 3 seconds
- [ ] MCF modal opens in < 2 seconds
- [ ] Search results appear in < 1 second
- [ ] No visible layout shift after data loads

---

## 21. MOBILE / RESPONSIVE (if applicable)

- [ ] Sidebar collapses on small screens
- [ ] Lead Queue table scrolls horizontally
- [ ] MCF modal is usable on tablet-width screens
- [ ] Buttons are tap-target size (min 44px)

---

## 22. FULL WORKFLOW END-TO-END

### Workflow A: New Lead → First Call → Follow-Up → Close

1. [ ] Create new lead via "+ New Seller Lead"
2. [ ] Lead appears in Lead Queue under "My Leads"
3. [ ] Open MCF, verify Overview tab shows basic info
4. [ ] Navigate to Dialer, find lead in queue
5. [ ] Initiate call via VoIP
6. [ ] During call: type live notes
7. [ ] End call, complete post-call flow:
   - [ ] Select outcome (e.g., "Follow-up")
   - [ ] Set next action (e.g., "Callback in 2 days")
   - [ ] Publish
8. [ ] Verify: call appears in History tab of MCF
9. [ ] Verify: seller memory populated with call context
10. [ ] Verify: next action shows in Lead Queue with due date
11. [ ] Wait for due date → verify overdue warning appears
12. [ ] Make second call, reference seller memory
13. [ ] Move lead to "Negotiation" (requires next action)
14. [ ] Verify lead appears in Pipeline "Negotiation" column
15. [ ] Open Comps tab, run comps, calculate ARV
16. [ ] Open Calculator tab, verify MAO calculation
17. [ ] Move to "Disposition"
18. [ ] Assign buyer in Dispo page
19. [ ] Move to "Closed"
20. [ ] Verify lead appears in Closed column
21. [ ] Verify analytics update with the closed deal

### Workflow B: CSV Import → Enrich → Qualify → Dead

1. [ ] Navigate to Import page
2. [ ] Upload CSV with 5 test addresses
3. [ ] Map fields correctly
4. [ ] Import succeeds
5. [ ] Verify: 5 leads appear in Lead Queue (staging status)
6. [ ] Verify: 5 leads do NOT appear in Pipeline board
7. [ ] Open one lead's MCF, trigger enrichment/research
8. [ ] Verify: Bricked data populates (ARV, repairs, comps)
9. [ ] Verify: County GIS data populates (assessed value, if Spokane)
10. [ ] Promote lead to "prospect" then "lead" status
11. [ ] Verify: lead now appears in Pipeline "Active" column
12. [ ] Call lead, get rejected ("not interested")
13. [ ] Mark as "Dead" with reason
14. [ ] Verify: lead appears in Dead column
15. [ ] Verify: lead no longer in Active column
16. [ ] Delete dead lead
17. [ ] Verify: lead gone from everywhere

### Workflow C: Inbound Lead → Research → Offer Prep

1. [ ] Receive inbound lead (via form submission or manual create)
2. [ ] Lead appears with score and distress signals
3. [ ] Open MCF → Overview shows initial data
4. [ ] Request Research Agent (dossier button)
5. [ ] Verify: research runs, dossier populates
6. [ ] Verify: Bricked comps, county data, PR data all visible
7. [ ] Open Comps tab → select 3 best comps
8. [ ] ARV calculates from selected comps
9. [ ] Open Calculator → MAO shows based on ARV
10. [ ] Verify: "View Bricked Report" link works (opens Bricked dashboard)
11. [ ] Verify: repair breakdown shows itemized costs
12. [ ] Save offer prep snapshot

---

## Test Execution Log

| Date | Tester | Sections Tested | Pass | Fail | Notes |
|------|--------|----------------|------|------|-------|
|      |        |                |      |      |       |

---

*Generated 2026-03-22. Covers all 17 sidebar pages, 6 MCF tabs, 3 end-to-end workflows, and ~200 individual test cases.*
