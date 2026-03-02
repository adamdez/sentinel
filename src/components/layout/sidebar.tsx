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
  Brain,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useSentinelStore } from "@/lib/store";
import { useHydrated } from "@/providers/hydration-provider";
import { supabase } from "@/lib/supabase";

interface SidebarBadges {
  prospects: number;
  fbCraigslist: number;
  ppl: number;
  gmailConnected: boolean;
}

function useSidebarBadges(): SidebarBadges {
  const { currentUser } = useSentinelStore();
  const [badges, setBadges] = useState<SidebarBadges>({ prospects: 0, fbCraigslist: 0, ppl: 0, gmailConnected: false });

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

      let gmailConnected = false;
      if (currentUser?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase.from("user_profiles") as any)
          .select("preferences")
          .eq("id", currentUser.id)
          .single();
        const prefs = profile?.preferences as Record<string, unknown> | undefined;
        const gmail = prefs?.gmail as { connected?: boolean } | undefined;
        gmailConnected = gmail?.connected === true;
      }

      setBadges({
        prospects: prospects ?? 0,
        fbCraigslist: fbCl ?? 0,
        ppl: ppl ?? 0,
        gmailConnected,
      });
    };

    fetchCounts();

    const channel = supabase
      .channel("sidebar_badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_profiles" }, () => fetchCounts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id]);

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
      { label: "Grok AI", href: "/grok", icon: Brain },
      { label: "Dialer", href: "/dialer", icon: Phone },
      { label: "Gmail", href: "/gmail", icon: Mail, badge: "gmail-connected" },
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
      { label: "Google Ads", href: "/ads", icon: Target },
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
            "flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-sm transition-all duration-100 hover:bg-white/[0.03] group",
            isActive && "text-sidebar-accent-foreground"
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-cyan")} />
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
          ? "sidebar-active-item text-cyan font-medium"
          : "text-sidebar-foreground hover:text-foreground hover:bg-white/[0.03]"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-cyan"
          style={{ boxShadow: "0 0 1px rgba(0,229,255,1), 0 0 4px rgba(0,229,255,0.5), 0 0 10px rgba(0,229,255,0.25), 0 0 18px rgba(0,229,255,0.1)" }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-cyan")} />
      <span>{item.label}</span>
      {(() => {
        if (!item.badge || !badges) return null;
        const dot =
          item.badge === "gmail-connected" && badges.gmailConnected ? "bg-cyan" :
          item.badge === "prospect-dot" && badges.prospects > 0 ? "bg-red-500" :
          item.badge === "fb-dot" && badges.fbCraigslist > 0 ? "bg-red-500" :
          item.badge === "ppl-dot" && badges.ppl > 0 ? "bg-red-500" :
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
            "text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors duration-100",
            hasActiveItem
              ? "text-cyan/80"
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
          className="h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden shrink-0 sidebar-glass relative z-20"
        >
          {/* Drag-to-resize handle (double-click resets to 200px) */}
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={() => setSidebarWidth(200)}
            className="absolute top-0 right-0 w-[6px] h-full cursor-col-resize z-30 group"
          >
            <div className={cn(
              "absolute top-0 right-0 w-[2px] h-full transition-opacity duration-150",
              isResizing ? "opacity-100 bg-cyan/50" : "opacity-0 group-hover:opacity-100 bg-cyan/30"
            )} />
          </div>

          <div className="p-4 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-[12px] bg-cyan/8 flex items-center justify-center border border-cyan/18" style={{ boxShadow: "0 0 1px rgba(0,229,255,0.8), 0 0 4px rgba(0,229,255,0.35), 0 0 12px rgba(0,229,255,0.15), 0 0 20px rgba(0,229,255,0.06)" }}>
              <Zap className="h-4 w-4 text-cyan drop-shadow-[0_0_8px_rgba(0,229,255,0.6)]" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground title-glow">
                SENTINEL
              </h1>
              <p className="text-[10px] text-muted-foreground/60 tracking-[0.2em] uppercase">
                Unified ERP
              </p>
            </div>
          </div>

          <Separator className="bg-white/[0.04]" />

          <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {sections.map((section) => (
              <SidebarSection key={section.title} section={section} badges={badges} />
            ))}
          </nav>

          <Separator className="mt-auto bg-white/[0.04] shrink-0" />

          <div className="p-3 shrink-0">
            <div className="flex items-center gap-2 rounded-[12px] px-3 py-2 bg-cyan/4 border border-cyan/10" style={{ boxShadow: "inset 0 0 16px rgba(0,229,255,0.03), 0 0 1px rgba(0,229,255,0.3)" }}>
              <div className="h-2 w-2 rounded-full bg-cyan animate-pulse" style={{ boxShadow: "0 0 1px rgba(0,229,255,1), 0 0 4px rgba(0,229,255,0.5), 0 0 8px rgba(0,229,255,0.25)" }} />
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
