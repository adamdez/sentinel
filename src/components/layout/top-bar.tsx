"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSentinelStore } from "@/lib/store";
import { useRealtime } from "@/providers/realtime-provider";
import { useHydrated } from "@/providers/hydration-provider";
import { supabase } from "@/lib/supabase";
import { useSentinelTheme } from "@/providers/theme-provider";
import { GlobalSearch } from "./global-search";

export function TopBar() {
  const router = useRouter();
  const {
    sidebarOpen,
    toggleSidebar,
    currentUser,
  } = useSentinelStore();
  const { connected } = useRealtime();
  const hydrated = useHydrated();
  const { theme, setTheme } = useSentinelTheme();

  const handleLogout = () => {
    supabase.auth.signOut().catch(() => {});
    // Redirect immediately — don't wait for signOut network call
    window.location.href = "/login";
  };

  return (
    <motion.header
      initial={hydrated ? { y: -10, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      className="h-14 border-b border-glass-border topbar-glass flex items-center justify-between px-4 shrink-0 z-30"
    >
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-8 w-8"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle sidebar</TooltipContent>
        </Tooltip>

      </div>

      <div className="flex-1 flex justify-center min-w-0 px-4">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              {connected ? (
                <Wifi className="h-3.5 w-3.5 text-primary" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-destructive" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {connected ? "Connected" : "Reconnecting..."}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 gap-2 px-2 group">
              <Avatar className="h-6 w-6 avatar-holo">
                <AvatarFallback className="text-sm bg-primary/[0.08] text-primary border-0">
                  {currentUser.name
                    ? currentUser.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                    : "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{currentUser.name || "..."}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {currentUser.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/analytics")}>Analytics</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="h-3.5 w-3.5 mr-2" />
              Light Mode
              {theme === "light" && <span className="ml-auto text-primary text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="h-3.5 w-3.5 mr-2" />
              Dark Mode
              {theme === "dark" && <span className="ml-auto text-primary text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("psalm20")}>
              <Crown className="h-3.5 w-3.5 mr-2" style={{ color: theme === "psalm20" ? "var(--psalm20-gold)" : undefined }} />
              Psalm 20
              {theme === "psalm20" && <span className="ml-auto text-xs" style={{ color: "var(--psalm20-gold)" }}>✓</span>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={handleLogout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>
  );
}
