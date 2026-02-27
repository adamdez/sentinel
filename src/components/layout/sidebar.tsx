"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Phone,
  Mail,
  Calendar,
  CalendarDays,
  UserPlus,
  Users,
  Handshake,
  FileCheck,
  Heart,
  Skull,
  Contact,
  FileSignature,
  Megaphone,
  BarChart3,
  Settings,
  DollarSign,
  Share2,
  ChevronRight,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";

interface SidebarBadges {
  prospects: number;
  fbCraigslist: number;
  ppl: number;
}

function useSidebarBadges(): SidebarBadges {
  const [badges, setBadges] = useState<SidebarBadges>({ prospects: 0, fbCraigslist: 0, ppl: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: prospects } = await (supabase.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "prospect");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: fbCl } = await (supabase.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .in("source", ["facebook", "craigslist", "fb", "fb_craigslist"]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: ppl } = await (supabase.from("leads") as any)
        .select("id", { count: "exact", head: true })
        .eq("source", "ppl");

      setBadges({
        prospects: prospects ?? 0,
        fbCraigslist: fbCl ?? 0,
        ppl: ppl ?? 0,
      });
    };

    fetchCounts();

    const channel = supabase
      .channel("sidebar_badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchCounts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return badges;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavItem[];
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Dialer", href: "/dialer", icon: Phone },
      { label: "Gmail", href: "/gmail", icon: Mail },
      { label: "Team Calendar", href: "/team-calendar", icon: Calendar },
      { label: "My Calendar", href: "/my-calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Deal Funnel",
    items: [
      { label: "Prospects", href: "/sales-funnel/prospects", icon: UserPlus, badge: "prospect-dot" },
      { label: "Leads", href: "/leads", icon: Users },
      { label: "Negotiation", href: "/sales-funnel/negotiation", icon: Handshake },
      { label: "Disposition", href: "/sales-funnel/disposition", icon: FileCheck },
      { label: "Nurture", href: "/sales-funnel/nurture", icon: Heart },
      { label: "Dead", href: "/sales-funnel/dead", icon: Skull },
    ],
  },
  {
    title: "Marketing Sources",
    items: [
      { label: "Facebook/Craigslist", href: "/sales-funnel/facebook-craigslist", icon: Share2, badge: "fb-dot" },
      { label: "PPL", href: "/sales-funnel/ppl", icon: DollarSign, badge: "ppl-dot" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Contacts", href: "/contacts", icon: Contact },
      { label: "DocuSign", href: "/docusign", icon: FileSignature },
      { label: "Campaigns", href: "/campaigns", icon: Megaphone },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

function NavLink({ item, depth = 0, badges }: { item: NavItem; depth?: number; badges?: SidebarBadges }) {
  const pathname = usePathname();
  const hasActiveChild = item.children?.some(
    (c) => pathname === c.href || pathname.startsWith(c.href + "/")
  );
  const [expanded, setExpanded] = useState(hasActiveChild ?? false);
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:bg-sidebar-accent group",
            isActive && "text-sidebar-accent-foreground"
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-neon")} />
          <span className="flex-1 text-left">{item.label}</span>
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="ml-auto"
          >
            <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          </motion.div>
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="ml-3 border-l border-sidebar-border pl-2 mt-1 space-y-0.5">
                {item.children.map((child) => (
                  <NavLink key={child.href} item={child} depth={depth + 1} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:bg-sidebar-accent group relative",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-neon shadow-[0_0_10px_rgba(0,255,136,0.5)]"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-neon")} />
      <span>{item.label}</span>
      {item.badge && badges && (
        (item.badge === "prospect-dot" && badges.prospects > 0) ||
        (item.badge === "fb-dot" && badges.fbCraigslist > 0) ||
        (item.badge === "ppl-dot" && badges.ppl > 0)
      ) && (
        <span className="relative flex h-2.5 w-2.5 ml-auto">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 animate-ping opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
      )}
    </Link>
  );
}

function SidebarSection({ section, badges }: { section: NavSection; badges?: SidebarBadges }) {
  const pathname = usePathname();
  const hasActiveItem = section.items.some(
    (item) =>
      pathname === item.href ||
      pathname.startsWith(item.href + "/") ||
      item.children?.some(
        (c) => pathname === c.href || pathname.startsWith(c.href + "/")
      )
  );
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  return (
    <div>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 pt-4 pb-1.5 group cursor-pointer"
      >
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors duration-200",
            hasActiveItem
              ? "text-neon/80"
              : "text-muted-foreground/60 group-hover:text-muted-foreground"
          )}
        >
          {section.title}
        </span>
        <div className="flex-1 h-px bg-sidebar-border/50 ml-1" />
        <motion.div
          animate={{ rotate: collapsed ? 0 : 90 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} badges={badges} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen } = useSentinelStore();
  const badges = useSidebarBadges();

  return (
    <AnimatePresence mode="wait">
      {sidebarOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden shrink-0"
        >
          <div className="p-4 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-neon/10 flex items-center justify-center border border-neon/20">
              <Zap className="h-4 w-4 text-neon" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground">
                SENTINEL
              </h1>
              <p className="text-[10px] text-muted-foreground tracking-widest uppercase">
                Unified ERP
              </p>
            </div>
          </div>

          <Separator className="bg-sidebar-border" />

          <ScrollArea className="flex-1 px-3 py-1">
            <nav>
              {sections.map((section) => (
                <SidebarSection key={section.title} section={section} badges={badges} />
              ))}
            </nav>
          </ScrollArea>

          <Separator className="bg-sidebar-border" />

          <div className="p-3">
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-neon/5 border border-neon/10">
              <div className="h-2 w-2 rounded-full bg-neon animate-pulse" />
              <span className="text-[11px] text-muted-foreground">
                System Online
              </span>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
