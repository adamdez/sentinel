import {
  Activity,
  CalendarCheck,
  Calculator,
  Phone,
  Users,
  BarChart3,
  Settings,
  Zap,
  Target,
  Upload,
  Handshake,
  KanbanSquare,
  MapPin,
  ShieldCheck,
  Mail,
  Bug,
  Megaphone,
  Car,
  FileSearch,
  Contact,
  Inbox,
  Heart,
  CircleCheckBig,
  Skull,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavItem[];
  badge?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const primaryItems: NavItem[] = [
  { label: "Today", href: "/dashboard", icon: CalendarCheck },
  { label: "Lead Queue", href: "/leads", icon: Users },
  { label: "Deep Dive", href: "/deep-dive", icon: FileSearch },
  { label: "PPL Inbox", href: "/intake", icon: Inbox, badge: "intake-pending" },
  { label: "Dialer", href: "/dialer", icon: Phone },
  { label: "Active", href: "/sales-funnel/active", icon: KanbanSquare },
  { label: "Negotiation", href: "/sales-funnel/negotiation", icon: Handshake },
  { label: "Disposition", href: "/sales-funnel/disposition", icon: ShieldCheck },
  { label: "Nurture", href: "/sales-funnel/nurture", icon: Heart },
  { label: "Dead", href: "/sales-funnel/dead", icon: Skull },
  { label: "Closed", href: "/sales-funnel/closed", icon: CircleCheckBig },
  { label: "Drive By", href: "/drive-by", icon: Car },
];

export const toolsSection: NavSection = {
  title: "Tools",
  items: [
    { label: "Property Research", href: "/properties/lookup", icon: MapPin },
    { label: "Tina", href: "/tina", icon: Calculator },
    { label: "Buyers", href: "/buyers", icon: Handshake },
    { label: "Contacts", href: "/contacts", icon: Contact },
    { label: "Ads", href: "/ads", icon: Target, badge: "ads-alerts" },
    { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  ],
};

export const reviewSection: NavSection = {
  title: "Ops Review",
  items: [
    { label: "Research Review", href: "/dialer/review/dossier-queue", icon: ShieldCheck, badge: "review-queue" },
    { label: "Call QA", href: "/dialer/qa", icon: ShieldCheck },
    { label: "Call Review", href: "/dialer/war-room", icon: Phone },
    { label: "Dialer Ops Metrics", href: "/dialer/review", icon: BarChart3 },
  ],
};

export const adminSection: NavSection = {
  title: "Admin",
  items: [
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Jeff Outbound", href: "/settings/jeff-outbound", icon: Phone },
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "Gmail", href: "/gmail", icon: Mail },
    { label: "Import", href: "/admin/import", icon: Upload },
    { label: "System Health", href: "/admin/health", icon: Activity },
    { label: "Grok", href: "/grok", icon: Bug },
  ],
};

export const brandIcon = Zap;
