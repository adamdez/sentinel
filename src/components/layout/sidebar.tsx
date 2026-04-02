"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useSentinelStore } from "@/lib/store";
import { useHydrated } from "@/providers/hydration-provider";
import { supabase } from "@/lib/supabase";
import { usePsalm20 } from "@/components/sentinel/psalm20/use-psalm20";
import { ShieldIcon, BannerIcon, GoldDivider } from "@/components/sentinel/psalm20/icons";
import {
  adminSection,
  brandIcon as BrandIcon,
  primaryItems,
  reviewSection,
  toolsSection,
  type NavItem,
  type NavSection,
} from "@/components/layout/sidebar-config";

interface SidebarBadges {
  adsAlerts: number;
  reviewQueue: number;
  intakePending: number;
}

function useSidebarBadges(): SidebarBadges {
  const [badges, setBadges] = useState<SidebarBadges>({ adsAlerts: 0, reviewQueue: 0, intakePending: 0 });

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: intakePending } = await (supabase.from("intake_leads") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review");

      setBadges({
        adsAlerts: adsAlerts ?? 0,
        reviewQueue: reviewPending ?? 0,
        intakePending: intakePending ?? 0,
      });
    };

    fetchCounts();

    const channel = supabase
      .channel("sidebar_badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "ads_alerts" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "review_queue" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "intake_leads" }, () => fetchCounts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return badges;
}

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
            "flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-sm transition-all duration-100 hover:bg-overlay-3 group",
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
              <div className="ml-3 border-l border-overlay-4 pl-2 mt-1 space-y-0.5">
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
          : "text-sidebar-foreground hover:text-foreground hover:bg-overlay-3"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
          style={{ boxShadow: "0 0 1px var(--overlay-80), 0 0 4px var(--overlay-50), 0 0 10px var(--glow-medium), 0 0 18px var(--overlay-10)" }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
      <span>{item.label}</span>
      {(() => {
        if (!item.badge || !badges) return null;
        if (item.badge === "intake-pending" && badges.intakePending > 0) {
          return (
            <div className="ml-auto flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 animate-ping opacity-80" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-xs font-bold text-white">
                {badges.intakePending}
              </span>
            </div>
          );
        }
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
        <div className="flex-1 h-px bg-overlay-3 ml-1" />
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

function SidebarBranding({ isPsalm20 }: { isPsalm20: boolean }) {
  if (isPsalm20) {
    return (
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="h-9 w-9 rounded-[12px] flex items-center justify-center border"
            style={{
              background: "rgba(201,168,76,0.08)",
              borderColor: "rgba(201,168,76,0.18)",
              boxShadow: "0 0 12px rgba(201,168,76,0.10), 0 0 24px rgba(201,168,76,0.04)",
            }}
          >
            <ShieldIcon className="h-5 w-5" color="var(--psalm20-gold)" />
          </div>
          <div>
            <h1
              className="text-base font-bold tracking-[0.08em] uppercase"
              style={{ color: "var(--psalm20-gold)", textShadow: "0 0 20px rgba(201,168,76,0.2)" }}
            >
              SENTINEL
            </h1>
            <p className="text-[10px] tracking-[0.22em] uppercase" style={{ color: "var(--psalm20-gold-dim)" }}>
              Banner of Victory
            </p>
          </div>
        </div>
        <GoldDivider className="mt-1 opacity-50" />
      </div>
    );
  }

  return (
    <div className="p-4 flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-[12px] bg-primary/8 flex items-center justify-center border border-primary/18" style={{ boxShadow: "0 0 1px var(--overlay-80), 0 0 4px var(--overlay-35), 0 0 12px var(--overlay-15), 0 0 20px var(--overlay-6)" }}>
        <BrandIcon className="h-4 w-4 text-primary drop-shadow-[0_0_8px_var(--overlay-60)]" />
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
  );
}

function SidebarFooter({ isPsalm20 }: { isPsalm20: boolean }) {
  if (!isPsalm20) return null;

  return (
    <div className="px-4 py-3 flex flex-col items-center gap-2">
      <GoldDivider className="opacity-40" />
      <div className="flex items-center gap-2">
        <BannerIcon className="h-3 w-3" color="var(--psalm20-gold-dim)" />
        <span
          className="text-[9px] tracking-[0.25em] uppercase font-medium"
          style={{ color: "var(--psalm20-gold-dim)", opacity: 0.5 }}
        >
          Psalm 20
        </span>
        <BannerIcon className="h-3 w-3" color="var(--psalm20-gold-dim)" />
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, sidebarWidth, setSidebarWidth, currentUser } = useSentinelStore();
  const badges = useSidebarBadges();
  const hydrated = useHydrated();
  const [isResizing, setIsResizing] = useState(false);
  const isPsalm20 = usePsalm20();
  const showReviewSection = currentUser.role === "admin";

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
          className={cn(
            "h-screen bg-sidebar flex flex-col overflow-hidden shrink-0 sidebar-glass relative z-20",
            isPsalm20 && "psalm20-sidebar"
          )}
        >
          {/* Psalm 20 — gold edge glow on right border */}
          {isPsalm20 && (
            <div
              className="absolute top-0 right-0 w-px h-full pointer-events-none z-20"
              style={{
                background: "linear-gradient(to bottom, rgba(201,168,76,0.3), rgba(201,168,76,0.08), rgba(201,168,76,0.3))",
                boxShadow: "0 0 8px rgba(201,168,76,0.12)",
              }}
            />
          )}

          {/* Drag-to-resize handle */}
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

          <SidebarBranding isPsalm20={isPsalm20} />

          {!isPsalm20 && <Separator className="bg-overlay-4" />}

          <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-1 scrollbar-thin scrollbar-thumb-overlay-10 scrollbar-track-transparent">
            <div className="space-y-0.5 pt-2">
              {primaryItems.map((item) => (
                <NavLink key={item.href} item={item} badges={badges} />
              ))}
            </div>
            <SidebarSection section={toolsSection} badges={badges} defaultCollapsed />
            {showReviewSection && <SidebarSection section={reviewSection} badges={badges} defaultCollapsed />}
            <SidebarSection section={adminSection} badges={badges} defaultCollapsed />
          </nav>

          <SidebarFooter isPsalm20={isPsalm20} />

          {!isPsalm20 && <Separator className="mt-auto bg-overlay-4 shrink-0" />}

        </motion.aside>
      )}
    </AnimatePresence>
  );
}
