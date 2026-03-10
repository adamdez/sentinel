import {
  Sparkles,
  Phone,
  MapPin,
  Newspaper,
  Activity,
  Zap,
  TrendingUp,
  Mail,
  DollarSign,
  MessageCircle,
  PhoneCall,
  Brain,
  Flame,
  AlertTriangle,
  PhoneOutgoing,
  CalendarClock,
  ShieldCheck,
  Target,
  GitBranch,
  Gauge,
  type LucideIcon,
} from "lucide-react";

export type WidgetId =
  | "my-top-prospects"
  | "my-top-leads"
  | "live-map"
  | "breaking-leads-ticker"
  | "activity-feed"
  | "next-best-action"
  | "funnel-value"
  | "active-drips"
  | "revenue-impact"
  | "team-chat-preview"
  | "quick-dial"
  | "grok-insights"
  | "heat-score-distribution"
  | "distress-signals"
  | "calls-today"
  | "tasks-due"
  | "compliance-status"
  | "cost-per-lead"
  | "conversion-rates"
  | "lead-velocity";

export type WidgetSize = "1x1" | "2x1" | "1x2" | "2x2";

export interface WidgetDefinition {
  id: WidgetId;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  category: "intelligence" | "workflow" | "communication" | "analytics";
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
  "live-map": {
    id: "live-map",
    label: "Live Map",
    description: "Geographic view of active prospects and leads",
    icon: MapPin,
    defaultSize: "2x2",
    minSize: "1x1",
    category: "intelligence",
  },
  "breaking-leads-ticker": {
    id: "breaking-leads-ticker",
    label: "Breaking Leads Ticker",
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
  "active-drips": {
    id: "active-drips",
    label: "Active Drips",
    description: "Running drip campaigns and engagement metrics",
    icon: Mail,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "communication",
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
  "team-chat-preview": {
    id: "team-chat-preview",
    label: "Team Chat Preview",
    description: "Latest team messages at a glance",
    icon: MessageCircle,
    defaultSize: "1x1",
    minSize: "1x1",
    category: "communication",
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
    description: "8-priority work queue: inbound, offers, follow-ups, qualification, comps, escalations",
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
  "cost-per-lead": {
    id: "cost-per-lead",
    label: "Cost per Lead",
    description: "Blended and per-source CPL vs $40 target",
    icon: Target,
    defaultSize: "2x1",
    minSize: "1x1",
    category: "analytics",
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
};

export const MAX_DASHBOARD_TILES = 12;

export const DEFAULT_LAYOUT: DashboardLayout = {
  tiles: [
    { widgetId: "my-top-prospects", size: "2x1", order: 0 },
    { widgetId: "my-top-leads", size: "2x1", order: 1 },
    { widgetId: "tasks-due", size: "2x1", order: 2 },
    { widgetId: "next-best-action", size: "1x1", order: 3 },
    { widgetId: "quick-dial", size: "1x1", order: 4 },
    { widgetId: "funnel-value", size: "2x1", order: 5 },
    { widgetId: "grok-insights", size: "2x1", order: 6 },
  ],
  updatedAt: new Date().toISOString(),
};

export const ALL_WIDGET_IDS = Object.keys(WIDGET_REGISTRY) as WidgetId[];

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
