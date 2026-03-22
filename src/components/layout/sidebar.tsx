"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarCheck,
  Phone,
  Users,
  BarChart3,
  Settings,
  ChevronRight,
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
  Contact,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useSentinelStore } from "@/lib/store";
import { useHydrated } from "@/providers/hydration-provider";
import { supabase } from "@/lib/supabase";

interface SidebarBadges {
  adsAlerts: number;
  reviewQueue: number;
}

function useSidebarBadges(): SidebarBadges {
  const [badges, setBadges] = useState<SidebarBadges>({ adsAlerts: 0, reviewQueue: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: adsAlerts } = await (supabase.from("ads_alerts") as any)
        .select("id", { count: "exact", head: true })
        .eq("read", false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: reviewPending } = await (supabase.from("review_queue") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      setBadges({
        adsAlerts: adsAlerts ?? 0,
        reviewQueue: reviewPending ?? 0,
      });
    };

    fetchCounts();

    const channel = supabase
      .channel("sidebar_badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "ads_alerts" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "review_queue" }, () => fetchCounts())
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

const primaryItems: NavItem[] = [
  { label: "Today", href: "/dashboard", icon: CalendarCheck },
  { label: "Lead Queue", href: "/leads", icon: Users },
  { label: "Dialer", href: "/dialer", icon: Phone },
  { label: "Dispo", href: "/dispo", icon: Handshake },
  { label: "Pipeline", href: "/pipeline", icon: KanbanSquare },
];

const toolsSection: NavSection = {
  title: "Tools",
  items: [
    { label: "Property Research", href: "/properties/lookup", icon: MapPin },
    { label: "Buyers", href: "/buyers", icon: Handshake },
    { label: "Contacts", href: "/contacts", icon: Contact },
    { label: "Ads", href: "/ads", icon: Target, badge: "ads-alerts" },
    { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  ],
};

const reviewSection: NavSection = {
  title: "Review",
  items: [
    { label: "Research Review", href: "/dialer/review/dossier-queue", icon: ShieldCheck, badge: "review-queue" },
    { label: "Call QA", href: "/dialer/qa", icon: ShieldCheck },
    { label: "Call Review", href: "/dialer/war-room", icon: Phone },
    { label: "Review Console", href: "/dialer/review", icon: BarChart3 },
  ],
};

const adminSection: NavSection = {
  title: "Admin",
  items: [
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "Gmail", href: "/gmail", icon: Mail },
    { label: "Import", href: "/admin/import", icon: Upload },
    { label: "Grok", href: "/grok", icon: Bug },
  ],
};

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
            "flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-sm transition-all duration-100 hover:bg-white/[0.03] group",
            isActive && "text-sidebar-accent-foreground"
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
          <span className="flex-1 text-left">{item.label}</span>
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="ml-auto"
          >
            <ChevronRight className="h-3.5 w-3.5 opacity-40" />
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
              <div className="ml-3 border-l border-white/[0.04] pl-2 mt-1 space-y-0.5">
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
        "flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm transition-all duration-100 group relative",
        isActive
          ? "sidebar-active-item text-primary font-medium"
          : "text-sidebar-foreground hover:text-foreground hover:bg-white/[0.03]"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
          style={{ boxShadow: "0 0 1px rgba(255,255,255,1), 0 0 4px rgba(255,255,255,0.5), 0 0 10px rgba(255,255,255,0.25), 0 0 18px rgba(255,255,255,0.1)" }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
      <span>{item.label}</span>
      {(() => {
        if (!item.badge || !badges) return null;
        const dot =
          item.badge === "ads-alerts" && badges.adsAlerts > 0 ? "bg-amber-400" :
          item.badge === "review-queue" && badges.reviewQueue > 0 ? "bg-violet-400" :
          null;
        if (!dot) return null;
        return (
          <span className="relative flex h-2.5 w-2.5 ml-auto">
            <span className={`absolute inline-flex h-full w-full rounded-full ${dot} animate-ping opacity-75`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dot}`} />
          </span>
        );
      })()}
    </Link>
  );
}

function SidebarSection({ section, badges, defaultCollapsed = false }: { section: NavSection; badges?: SidebarBadges; defaultCollapsed?: boolean }) {
  const pathname = usePathname();
  const hasActiveItem = section.items.some(
    (item) =>
      pathname === item.href ||
      pathname.startsWith(item.href + "/") ||
      item.children?.some(
        (c) => pathname === c.href || pathname.startsWith(c.href + "/")
      )
  );
  const [collapsed, setCollapsed] = useState(defaultCollapsed && !hasActiveItem);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  return (
    <div>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 pt-4 pb-1.5 group cursor-pointer"
      >
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wide transition-colors duration-100",
            hasActiveItem
              ? "text-primary/80"
              : "text-muted-foreground/60 group-hover:text-muted-foreground"
          )}
        >
          {section.title}
        </span>
        <div className="flex-1 h-px bg-white/[0.03] ml-1" />
        <motion.div
          animate={{ rotate: collapsed ? 0 : 90 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
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
  const { sidebarOpen, sidebarWidth, setSidebarWidth } = useSentinelStore();
  const badges = useSidebarBadges();
  const hydrated = useHydrated();
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = startWidth + (ev.clientX - startX);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth, setSidebarWidth]);

  return (
    <AnimatePresence mode="wait">
      {sidebarOpen && (
        <motion.aside
          initial={hydrated ? { width: 0, opacity: 0 } : false}
          animate={{ width: sidebarWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: "easeInOut" }}
          className="h-screen bg-sidebar flex flex-col overflow-hidden shrink-0 sidebar-glass relative z-20"
        >
          {/* Drag-to-resize handle (double-click resets to 200px) */}
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={() => setSidebarWidth(200)}
            className="absolute top-0 right-0 w-[6px] h-full cursor-col-resize z-30 group"
          >
            <div className={cn(
              "absolute top-0 right-0 w-[2px] h-full transition-opacity duration-150",
              isResizing ? "opacity-100 bg-primary/50" : "opacity-0 group-hover:opacity-100 bg-primary/30"
            )} />
          </div>

          <div className="p-4 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-[12px] bg-primary/8 flex items-center justify-center border border-primary/18" style={{ boxShadow: "0 0 1px rgba(255,255,255,0.8), 0 0 4px rgba(255,255,255,0.35), 0 0 12px rgba(255,255,255,0.15), 0 0 20px rgba(255,255,255,0.06)" }}>
              <Zap className="h-4 w-4 text-primary drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-foreground title-glow">
                SENTINEL
              </h1>
              <p className="text-xs text-muted-foreground tracking-wide uppercase">
                Acquisitions OS
              </p>
            </div>
          </div>

          <Separator className="bg-white/[0.04]" />

          <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="space-y-0.5 pt-2">
              {primaryItems.map((item) => (
                <NavLink key={item.href} item={item} badges={badges} />
              ))}
            </div>
            <SidebarSection section={toolsSection} badges={badges} defaultCollapsed />
            <SidebarSection section={reviewSection} badges={badges} defaultCollapsed />
            <SidebarSection section={adminSection} badges={badges} defaultCollapsed />
          </nav>

          <Separator className="mt-auto bg-white/[0.04] shrink-0" />

        </motion.aside>
      )}
    </AnimatePresence>
  );
}
