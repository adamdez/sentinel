import {
  Sparkles,
  Phone,

  Newspaper,
  Activity,
  Zap,
  TrendingUp,

  DollarSign,

  PhoneCall,
  Brain,
  Flame,
  AlertTriangle,
  PhoneOutgoing,
  CalendarClock,
  ShieldCheck,

  GitBranch,
  Gauge,
  SearchX,
  Crosshair,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export type WidgetId =
  | "my-top-prospects"
  | "my-top-leads"

  | "breaking-leads-ticker"
  | "activity-feed"
  | "next-best-action"
  | "funnel-value"

  | "revenue-impact"

  | "quick-dial"
  | "grok-insights"
  | "heat-score-distribution"
  | "distress-signals"
  | "calls-today"
  | "tasks-due"
  | "compliance-status"

  | "conversion-rates"
  | "lead-velocity"
  | "missed-opportunity-queue"
  | "daily-brief"
  | "call-quality-snapshot";

export type WidgetSize = "1x1" | "2x1" | "1x2" | "2x2";

export interface WidgetDefinition {
  id: WidgetId;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  category: "intelligence" | "workflow" | "communication" | "analytics";
  /** Hidden widgets still render for saved layouts but don't appear in the widget library picker. */
  hidden?: boolean;
}

export interface DashboardTile {
  widgetId: WidgetId;
  size: WidgetSize;
  order: number;
}

export interface DashboardLayout {
  tiles: DashboardTile[];
  updatedAt: string;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  "my-top-prospects": {
    id: "my-top-prospects",
    label: "My Top Prospects",
    description: "AI-scored distress prospects using the full valuation model",
    icon: Sparkles,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "intelligence",
    hidden: true,
  },
  "my-top-leads": {
    id: "my-top-leads",
    label: "My Top Leads",
    description: "3 most important leads to call based on follow-up priority",
    icon: Phone,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "workflow",
  },
  "breaking-leads-ticker": {
    id: "breaking-leads-ticker",
    label: "New Priority Leads Ticker",
    description: "Real-time feed of newly promoted high-score leads",
    icon: Newspaper,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "intelligence",
  },
  "activity-feed": {
    id: "activity-feed",
    label: "Activity Feed",
    description: "Your recent actions and system events",
    icon: Activity,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "workflow",
  },
  "next-best-action": {
    id: "next-best-action",
    label: "Next Best Action",
    description: "AI-recommended action to maximize conversion",
    icon: Zap,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "intelligence",
  },
  "funnel-value": {
    id: "funnel-value",
    label: "Funnel Value",
    description: "Total pipeline value across all funnel stages",
    icon: TrendingUp,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "analytics",
  },
  "revenue-impact": {
    id: "revenue-impact",
    label: "Revenue Impact",
    description: "Closed deals, assignment fees, and ROI tracking",
    icon: DollarSign,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "analytics",
  },
  "quick-dial": {
    id: "quick-dial",
    label: "Quick Dial",
    description: "One-click dialer for your next scheduled call",
    icon: PhoneCall,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "workflow",
  },
  "grok-insights": {
    id: "grok-insights",
    label: "Grok Insights",
    description: "AI-powered proactive insights and recommendations from Grok",
    icon: Brain,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "intelligence",
    hidden: true,
  },

  // ── New widgets ─────────────────────────────────────────────────
  "heat-score-distribution": {
    id: "heat-score-distribution",
    label: "Heat Score Distribution",
    description: "FIRE / HOT / WARM / COLD breakdown across all prospects",
    icon: Flame,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "intelligence",
  },
  "distress-signals": {
    id: "distress-signals",
    label: "Distress Signals",
    description: "Live count of recent distress events by signal type",
    icon: AlertTriangle,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "intelligence",
  },
  "calls-today": {
    id: "calls-today",
    label: "Calls Today",
    description: "Daily call volume, talk time, and connect rate",
    icon: PhoneOutgoing,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "workflow",
  },
  "tasks-due": {
    id: "tasks-due",
    label: "Morning Queue",
    description: "8-priority work queue: inbound, offer-prep updates, follow-ups, qualification, comps, escalations",
    icon: CalendarClock,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "workflow",
  },
  "compliance-status": {
    id: "compliance-status",
    label: "Compliance Status",
    description: "DNC, litigant, and opt-out scrub health at a glance",
    icon: ShieldCheck,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "workflow",
  },
  "conversion-rates": {
    id: "conversion-rates",
    label: "Conversion Rates",
    description: "Stage-to-stage conversion from prospect through close",
    icon: GitBranch,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "analytics",
  },
  "lead-velocity": {
    id: "lead-velocity",
    label: "Lead Velocity",
    description: "Avg days per pipeline stage — how fast deals move",
    icon: Gauge,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "analytics",
  },
  "missed-opportunity-queue": {
    id: "missed-opportunity-queue",
    label: "Missed Opportunity Queue",
    description: "Overdue follow-ups, defaulted callbacks, and flagged AI outputs that need attention",
    icon: SearchX,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "workflow",
  },
  "daily-brief": {
    id: "daily-brief",
    label: "Daily Brief",
    description: "Top callback slippage, overdue follow-up, flagged AI output, and 3 leads needing action now",
    icon: Crosshair,
    defaultSize: "2x2",
    minSize: "2x1",
    category: "workflow",
  },
  "call-quality-snapshot": {
    id: "call-quality-snapshot",
    label: "Call Quality Snapshot",
    description: "AI review queue: flagged traces, unreviewed items, operator correction rate",
    icon: ShieldAlert,
    defaultSize: "2x2",
    minSize: "2x1",
    category: "workflow",
  },
};

export const MAX_DASHBOARD_TILES = 12;

export const DEFAULT_LAYOUT: DashboardLayout = {
  tiles: [
    { widgetId: "tasks-due", size: "2x1", order: 0 },
    { widgetId: "my-top-leads", size: "2x1", order: 1 },
    { widgetId: "calls-today", size: "1x1", order: 2 },
    { widgetId: "quick-dial", size: "1x1", order: 3 },
    { widgetId: "revenue-impact", size: "1x1", order: 4 },
    { widgetId: "next-best-action", size: "1x1", order: 5 },
    { widgetId: "funnel-value", size: "2x1", order: 6 },
  ],
  updatedAt: new Date().toISOString(),
};

export const ALL_WIDGET_IDS = Object.keys(WIDGET_REGISTRY) as WidgetId[];

/** Widget IDs visible in the Add Widget library (excludes hidden widgets). */
export const VISIBLE_WIDGET_IDS = ALL_WIDGET_IDS.filter(
  (id) => !WIDGET_REGISTRY[id].hidden,
);

export function getColSpan(size: WidgetSize): number {
  switch (size) {
    case "2x1":
    case "2x2":
      return 2;
    default:
      return 1;
  }
}

export function getRowSpan(size: WidgetSize): number {
  switch (size) {
    case "1x2":
    case "2x2":
      return 2;
    default:
      return 1;
  }
}
