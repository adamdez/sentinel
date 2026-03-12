# Phase 5C: Dispo Reporting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add buyer performance visibility, deal dispo metrics, stalled-deal awareness, and assignment-cycle visibility to existing Sentinel surfaces.

**Architecture:** Server-side stats endpoints compute aggregates from `deal_buyers` and `deals` tables. Client displays compact text/number summaries on existing pages (dispo board, buyer detail modal). One new DB column (`entered_dispo_at`) provides timing foundation. No charts, no new pages.

**Tech Stack:** Next.js API routes, Supabase PostgreSQL, React client components, existing glass morphism UI patterns.

---

### Task 1: Database Migration — Add `entered_dispo_at` to deals

**Files:**
- Migration via Supabase MCP (project: `imusghlptroddfeycpei`)

**Step 1: Apply migration**

Use Supabase MCP `apply_migration` with:
```sql
ALTER TABLE deals ADD COLUMN IF NOT EXISTS entered_dispo_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill: set entered_dispo_at = deals.created_at for existing disposition deals
-- (best approximation for historical data)
UPDATE deals d
SET entered_dispo_at = d.created_at
FROM leads l
WHERE d.lead_id = l.id
  AND l.status = 'disposition'
  AND d.entered_dispo_at IS NULL;
```

**Step 2: Verify column exists**

Use Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'deals' AND column_name = 'entered_dispo_at';
```

Expected: 1 row with `entered_dispo_at | timestamp with time zone`

**Step 3: Commit design doc**

```bash
git add docs/plans/2026-03-11-dispo-reporting-design.md docs/plans/2026-03-11-dispo-reporting-implementation.md
git commit -m "docs: Phase 5C design and implementation plan"
```

---

### Task 2: Update DispoDeal type and dispo API to include `entered_dispo_at`

**Files:**
- Modify: `src/hooks/use-buyers.ts` (DispoDeal interface)
- Modify: `src/app/api/dispo/route.ts` (add entered_dispo_at to response)

**Step 1: Add `entered_dispo_at` to DispoDeal interface**

In `src/hooks/use-buyers.ts`, add to the `DispoDeal` interface after `buyer_id`:
```typescript
entered_dispo_at: string | null;
```

**Step 2: Add `entered_dispo_at` to dispo API response assembly**

In `src/app/api/dispo/route.ts`, in Step 2 where deals are fetched, ensure `*` already includes it (it does since we SELECT *).

In Step 6 response assembly, add after `dispo_prep`:
```typescript
entered_dispo_at: deal.entered_dispo_at ?? null,
```

**Step 3: Verify build**

```bash
npx next build 2>&1 | tail -5
```

Expected: Build succeeds.

---

### Task 3: Create `GET /api/buyers/[id]/stats` endpoint

**Files:**
- Create: `src/app/api/buyers/[id]/stats/route.ts`

**Step 1: Write the stats endpoint**

Create `src/app/api/buyers/[id]/stats/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/buyers/[id]/stats — buyer performance summary
 *
 * Computes aggregate stats from deal_buyers for this buyer:
 * - times linked, contacted, responded, interested, offered, selected
 * - response rate
 * - recent deal activity (last 5)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Fetch all deal_buyers for this buyer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: links, error } = await (sb.from("deal_buyers") as any)
      .select("id, deal_id, status, date_contacted, responded_at, offer_amount, created_at, updated_at")
      .eq("buyer_id", id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const all = links ?? [];
    const total = all.length;

    // Status counts
    const contacted = all.filter((r: { status: string }) =>
      !["not_contacted", "queued"].includes(r.status)
    ).length;
    const responded = all.filter((r: { status: string }) =>
      ["interested", "offered", "follow_up", "selected", "passed"].includes(r.status)
    ).length;
    const interested = all.filter((r: { status: string }) =>
      ["interested", "offered", "selected"].includes(r.status)
    ).length;
    const offered = all.filter((r: { status: string }) => r.status === "offered").length;
    const selected = all.filter((r: { status: string }) => r.status === "selected").length;

    // Response rate
    const responseRate = contacted > 0 ? Math.round((responded / contacted) * 100) : null;

    // Avg response time (days) — only where both dates exist
    const responseTimes = all
      .filter((r: { date_contacted: string | null; responded_at: string | null }) => r.date_contacted && r.responded_at)
      .map((r: { date_contacted: string; responded_at: string }) => {
        const diff = new Date(r.responded_at).getTime() - new Date(r.date_contacted).getTime();
        return diff / (1000 * 60 * 60 * 24); // days
      })
      .filter((d: number) => d >= 0); // filter invalid (responded before contacted)

    const avgResponseDays = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length * 10) / 10
      : null;

    // Recent deals — fetch deal context for last 5
    const recentIds = all.slice(0, 5).map((r: { deal_id: string }) => r.deal_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dealMap: Record<string, any> = {};
    if (recentIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: deals } = await (sb.from("deals") as any)
        .select("id, lead_id, contract_price")
        .in("id", recentIds);

      if (deals) {
        const leadIds = deals.map((d: { lead_id: string }) => d.lead_id).filter(Boolean);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let leadMap: Record<string, any> = {};
        if (leadIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: leads } = await (sb.from("leads") as any)
            .select("id, property_id")
            .in("id", leadIds);
          if (leads) {
            const propIds = leads.map((l: { property_id: string }) => l.property_id).filter(Boolean);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let propMap: Record<string, any> = {};
            if (propIds.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: props } = await (sb.from("properties") as any)
                .select("id, address, city")
                .in("id", propIds);
              if (props) propMap = Object.fromEntries(props.map((p: { id: string }) => [p.id, p]));
            }
            leadMap = Object.fromEntries(leads.map((l: { id: string; property_id: string }) => [l.id, { ...l, property: propMap[l.property_id] }]));
          }
        }
        dealMap = Object.fromEntries(deals.map((d: { id: string; lead_id: string }) => [d.id, { ...d, lead: leadMap[d.lead_id] }]));
      }
    }

    const recentDeals = all.slice(0, 5).map((r: { deal_id: string; status: string; offer_amount: number | null; date_contacted: string | null; created_at: string }) => {
      const deal = dealMap[r.deal_id];
      const prop = deal?.lead?.property;
      return {
        deal_buyer_status: r.status,
        offer_amount: r.offer_amount,
        date_contacted: r.date_contacted,
        linked_at: r.created_at,
        property_address: prop ? [prop.address, prop.city].filter(Boolean).join(", ") : null,
        contract_price: deal?.contract_price ?? null,
      };
    });

    return NextResponse.json({
      stats: {
        total_linked: total,
        contacted,
        responded,
        interested,
        offered,
        selected,
        response_rate: responseRate,
        avg_response_days: avgResponseDays,
        recent_deals: recentDeals,
      },
    });
  } catch (err) {
    console.error("[API/buyers/id/stats] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**Step 2: Verify build**

```bash
npx next build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/app/api/buyers/[id]/stats/route.ts
git commit -m "feat: add buyer performance stats endpoint"
```

---

### Task 4: Create `useBuyerStats` hook

**Files:**
- Modify: `src/hooks/use-buyers.ts`

**Step 1: Add the hook and types**

At the end of `src/hooks/use-buyers.ts`, add:

```typescript
// ── Buyer stats ──

export interface BuyerStats {
  total_linked: number;
  contacted: number;
  responded: number;
  interested: number;
  offered: number;
  selected: number;
  response_rate: number | null;
  avg_response_days: number | null;
  recent_deals: {
    deal_buyer_status: string;
    offer_amount: number | null;
    date_contacted: string | null;
    linked_at: string;
    property_address: string | null;
    contract_price: number | null;
  }[];
}

export function useBuyerStats(buyerId: string | null) {
  const [stats, setStats] = useState<BuyerStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!buyerId) { setStats(null); return; }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/buyers/${buyerId}/stats`, { headers });
      if (!res.ok) throw new Error("Failed to fetch buyer stats");
      const { stats: data } = await res.json();
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [buyerId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { stats, loading, refetch: fetch };
}
```

**Step 2: Verify build**

```bash
npx next build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/hooks/use-buyers.ts
git commit -m "feat: add useBuyerStats hook"
```

---

### Task 5: Add Buyer Performance section to Buyer Detail Modal

**Files:**
- Modify: `src/components/sentinel/buyer-detail-modal.tsx`

**Step 1: Add imports**

Add to existing imports:
```typescript
import { BarChart3 } from "lucide-react";
import { useBuyerStats } from "@/hooks/use-buyers";
import { dealBuyerStatusLabel } from "@/lib/buyer-types";
```

Note: `dealBuyerStatusLabel` may already be imported — check before adding.

**Step 2: Add the useBuyerStats call**

Inside the `BuyerDetailModal` component, after the existing `useBuyerDeals` call, add:
```typescript
const { stats, loading: statsLoading } = useBuyerStats(!isCreate ? buyer?.id ?? null : null);
```

Also add `"performance"` to the `collapsedSections` initial state (it should start expanded, so set it to `false` or omit it — the section shows when `!collapsedSections.performance`).

**Step 3: Add the Performance section**

Insert a new section between the Outreach History section and the Notes section. The section follows the existing `SectionHeader` + `AnimatePresence` pattern:

```tsx
{/* ── Performance ── */}
{!isCreate && buyer?.id && (
  <div>
    <SectionHeader icon={BarChart3} label="Performance" collapsed={!!collapsedSections.performance} onToggle={() => toggleSection("performance")} />
    <AnimatePresence initial={false}>
      {!collapsedSections.performance && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div className="mt-2 space-y-3">
            {statsLoading ? (
              <div className="text-xs text-muted-foreground/50 py-3 text-center">Loading stats...</div>
            ) : !stats ? (
              <div className="text-xs text-muted-foreground/50 py-3 text-center">No data</div>
            ) : (
              <>
                {/* Counts grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Linked", value: stats.total_linked },
                    { label: "Contacted", value: stats.contacted },
                    { label: "Responded", value: stats.responded },
                    { label: "Interested", value: stats.interested },
                    { label: "Offered", value: stats.offered },
                    { label: "Selected", value: stats.selected },
                  ].map((s) => (
                    <div key={s.label} className="px-2.5 py-2 rounded-[6px] bg-white/[0.02] border border-white/[0.04] text-center">
                      <div className="text-sm font-semibold text-foreground">{s.value}</div>
                      <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Rates */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
                  {stats.response_rate != null && (
                    <span>Response rate: <span className="text-foreground/80 font-medium">{stats.response_rate}%</span></span>
                  )}
                  {stats.avg_response_days != null && (
                    <span>Avg response: <span className="text-foreground/80 font-medium">~{stats.avg_response_days}d</span></span>
                  )}
                </div>

                {/* Recent deals */}
                {stats.recent_deals.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Recent Deals</div>
                    {stats.recent_deals.map((rd, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] bg-white/[0.015] border border-white/[0.04] text-xs">
                        <span className="flex-1 truncate text-foreground/70">{rd.property_address ?? "Unknown"}</span>
                        <Badge
                          variant={rd.deal_buyer_status === "selected" ? "neon" : rd.deal_buyer_status === "interested" ? "cyan" : rd.deal_buyer_status === "passed" ? "secondary" : "outline"}
                          className="text-[9px] shrink-0"
                        >
                          {dealBuyerStatusLabel(rd.deal_buyer_status)}
                        </Badge>
                        {rd.offer_amount != null && (
                          <span className="text-cyan/70 font-medium shrink-0">${(rd.offer_amount / 1000).toFixed(0)}k</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
)}
```

**Step 4: Verify build**

```bash
npx next build 2>&1 | tail -5
```

**Step 5: Commit**

```bash
git add src/components/sentinel/buyer-detail-modal.tsx
git commit -m "feat: add buyer performance section to detail modal"
```

---

### Task 6: Enhance Dispo Board — timing badges, stalled deals panel, enriched funnel

**Files:**
- Modify: `src/app/(sentinel)/dispo/page.tsx`

**Step 1: Add stall detection helpers**

Add after the existing helper functions (after `PRE_RESPONSE_STATUSES`):

```typescript
// ── Stall detection ──

type StallReason = "no_outreach" | "no_response" | "needs_followup" | "stalled_selection";

interface StalledDeal {
  deal: DispoDeal;
  reasons: StallReason[];
}

const STALL_LABELS: Record<StallReason, string> = {
  no_outreach: "No outreach started",
  no_response: "No responses",
  needs_followup: "Needs follow-up",
  stalled_selection: "Stalled selection",
};

function detectStalls(deals: DispoDeal[]): StalledDeal[] {
  const now = Date.now();
  const DAY = 86400000;
  const stalled: StalledDeal[] = [];

  for (const deal of deals) {
    const reasons: StallReason[] = [];
    const dbs = deal.deal_buyers;

    if (dbs.length === 0) {
      // No buyers linked at all — if deal is >1 day old
      const enteredAt = deal.entered_dispo_at ? new Date(deal.entered_dispo_at).getTime() : null;
      if (enteredAt && now - enteredAt > DAY) {
        reasons.push("no_outreach");
      }
    } else {
      // All not_contacted/queued and oldest link >1 day
      const allPreContact = dbs.every((db) => db.status === "not_contacted" || db.status === "queued");
      if (allPreContact) {
        const oldest = Math.min(...dbs.map((db) => new Date(db.created_at).getTime()));
        if (now - oldest > DAY) reasons.push("no_outreach");
      }

      // All sent, oldest sent >3 days
      const sentBuyers = dbs.filter((db) => db.status === "sent");
      const nonSentActive = dbs.filter((db) => !["not_contacted", "queued", "sent", "passed"].includes(db.status));
      if (sentBuyers.length > 0 && nonSentActive.length === 0) {
        const oldestSent = Math.min(...sentBuyers.map((db) => new Date(db.date_contacted || db.updated_at).getTime()));
        if (now - oldestSent > 3 * DAY) reasons.push("no_response");
      }

      // Interested/offered but no follow-up logged
      const activeResponders = dbs.filter((db) => db.status === "interested" || db.status === "offered");
      if (activeResponders.length > 0) {
        const noFollowUp = activeResponders.some((db) => !db.follow_up_needed && !db.follow_up_at);
        if (noFollowUp) reasons.push("needs_followup");
      }

      // Selected buyer but no activity >5 days
      const selectedBuyer = dbs.find((db) => db.status === "selected");
      if (selectedBuyer) {
        const lastUpdate = new Date(selectedBuyer.updated_at).getTime();
        if (now - lastUpdate > 5 * DAY) reasons.push("stalled_selection");
      }
    }

    if (reasons.length > 0) stalled.push({ deal, reasons });
  }

  return stalled;
}

function daysAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function lastActivityDate(deal: DispoDeal): string | null {
  const dates = deal.deal_buyers
    .flatMap((db) => [db.updated_at, db.date_contacted, db.responded_at])
    .filter(Boolean) as string[];
  if (dates.length === 0) return null;
  return dates.sort().reverse()[0];
}
```

**Step 2: Add StalledDealsPanel component**

Add after the stall helpers:

```tsx
function StalledDealsPanel({ deals }: { deals: DispoDeal[] }) {
  const stalled = useMemo(() => detectStalls(deals), [deals]);
  const [open, setOpen] = useState(true);

  if (stalled.length === 0) return null;

  return (
    <GlassCard hover={false} delay={0} className="p-0 overflow-hidden border-amber-500/15">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/[0.01] transition-colors"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400/70" />
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400/80">
          Needs Attention
        </span>
        <Badge variant="gold" className="text-[9px]">{stalled.length}</Badge>
        <div className="flex-1" />
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-3 w-3 text-muted-foreground/30" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1.5">
              {stalled.map((s) => (
                <div key={s.deal.id} className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-amber-500/[0.03] border border-amber-500/10">
                  <MapPin className="h-3 w-3 text-amber-400/50 shrink-0" />
                  <span className="text-xs text-foreground/70 truncate flex-1">
                    {s.deal.property_address || "No address"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    {s.reasons.map((r) => (
                      <span key={r} className="text-[9px] text-amber-400/60 bg-amber-500/[0.06] px-1.5 py-0.5 rounded">
                        {STALL_LABELS[r]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
```

**Step 3: Add `AlertTriangle` to lucide-react imports**

Add `AlertTriangle` to the icon imports at the top of the file.

**Step 4: Add `Badge` import**

Add `import { Badge } from "@/components/ui/badge";` to the imports.

**Step 5: Enhance OutreachFunnel to include avg days-in-dispo**

Replace the `OutreachFunnel` component with an enhanced version:

```tsx
function OutreachFunnel({ deals }: { deals: DispoDeal[] }) {
  const stats = useMemo(() => {
    const allBuyers = deals.flatMap((d) => d.deal_buyers);
    const linked = allBuyers.length;
    const contacted = allBuyers.filter((b) => b.status !== "not_contacted" && b.status !== "queued").length;
    const responded = allBuyers.filter((b) => RESPONDED_STATUSES.has(b.status) || b.status === "passed").length;
    const interested = allBuyers.filter((b) => b.status === "interested" || b.status === "offered" || b.status === "selected").length;
    const selected = allBuyers.filter((b) => b.status === "selected").length;

    // Avg days in dispo
    const dispoAges = deals
      .map((d) => daysAgo(d.entered_dispo_at))
      .filter((d): d is number => d != null);
    const avgDaysInDispo = dispoAges.length > 0
      ? Math.round(dispoAges.reduce((a, b) => a + b, 0) / dispoAges.length)
      : null;

    return { deals: deals.length, linked, contacted, responded, interested, selected, avgDaysInDispo };
  }, [deals]);

  const steps = [
    { label: "deals", count: stats.deals },
    { label: "linked", count: stats.linked },
    { label: "contacted", count: stats.contacted },
    { label: "responded", count: stats.responded },
    { label: "interested", count: stats.interested },
    { label: "selected", count: stats.selected },
  ];

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground/60 flex-wrap">
      {steps.map((step, i) => (
        <span key={step.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/20" />}
          <span className="text-foreground/70 font-medium">{step.count}</span>
          <span>{step.label}</span>
        </span>
      ))}
      {stats.avgDaysInDispo != null && (
        <>
          <span className="text-muted-foreground/20 mx-1">|</span>
          <span>avg <span className="text-foreground/70 font-medium">~{stats.avgDaysInDispo}d</span> in dispo</span>
        </>
      )}
    </div>
  );
}
```

**Step 6: Add timing badges to DealCard header**

In the `DealCard` component, add timing indicators to the card header's right column (the `flex flex-col items-end` div). Add after the Users count div and before the ChevronDown:

```tsx
{/* Timing indicators */}
{(() => {
  const age = daysAgo(deal.entered_dispo_at);
  const lastAct = daysAgo(lastActivityDate(deal));
  return (
    <div className="flex items-center gap-2">
      {age != null && (
        <span className={cn(
          "text-[10px]",
          age > 14 ? "text-amber-400/60" : "text-muted-foreground/40"
        )}>
          {age}d in dispo
        </span>
      )}
      {lastAct != null && lastAct > 2 && (
        <span className="text-[10px] text-amber-400/50">
          {lastAct}d idle
        </span>
      )}
    </div>
  );
})()}
```

**Step 7: Insert StalledDealsPanel in the page**

In the `DispoPage` component, insert `<StalledDealsPanel deals={deals} />` right after the opening of the deals list block, before the OutreachFunnel:

```tsx
{/* Stalled deals panel */}
<StalledDealsPanel deals={deals} />

{/* Outreach funnel bar */}
<OutreachFunnel deals={deals} />
```

**Step 8: Verify build**

```bash
npx next build 2>&1 | tail -5
```

**Step 9: Commit**

```bash
git add src/app/(sentinel)/dispo/page.tsx
git commit -m "feat: add stalled deals panel, timing badges, enriched funnel"
```

---

### Task 7: Build verification and deploy

**Step 1: Full build check**

```bash
cd C:/Users/adamd/Desktop/Sentinel && npx next build
```

Expected: Clean build with no TypeScript errors.

**Step 2: Final commit (if any linter changes)**

```bash
git status
```

If files were auto-modified by linter, stage and commit.

**Step 3: Push to deploy**

```bash
git push origin main
```

Expected: Triggers Vercel deployment.

---

## QA Checklist

1. `/buyers` page loads — click a buyer → detail modal → Performance section shows stats grid
2. Performance section shows: linked/contacted/responded/interested/offered/selected counts
3. Performance section shows response rate and avg response days (if data exists)
4. Performance section shows recent deals with property addresses and status badges
5. `/dispo` page loads — funnel bar shows "avg ~Xd in dispo" when entered_dispo_at exists
6. Deal cards show "Xd in dispo" and "Xd idle" badges on the right side
7. Stalled deals panel appears at top when stall conditions are met
8. Stalled deals panel shows correct reason labels
9. Stalled deals panel is collapsible
10. `npm run build` passes clean

---

## Deferred to Later Phases

- Status-change audit log for exact transition timing
- Visual funnel charts (recharts)
- Dedicated /dispo/reporting page
- Assignment-fee analytics by buyer/market
- Buyer reliability scoring algorithm
- Time-series trend analysis
- Contact method effectiveness reporting
