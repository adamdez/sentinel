"use client";

import { motion } from "framer-motion";
import {
  Ghost,
  PanelLeftClose,
  PanelLeft,
  Bell,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { supabase } from "@/lib/supabase";
import { GlobalSearch } from "./global-search";

export function TopBar() {
  const {
    sidebarOpen,
    toggleSidebar,
    ghostMode,
    setGhostMode,
    currentUser,
  } = useSentinelStore();
  const { connected } = useRealtime();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/dashboard";
  };

  return (
    <motion.header
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="h-14 border-b border-glass-border glass-strong flex items-center justify-between px-4 shrink-0 z-30"
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

        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              {connected ? (
                <Wifi className="h-3.5 w-3.5 text-neon" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-destructive" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {connected ? "Connected" : "Reconnecting..."}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-secondary/30">
              <Ghost
                className={`h-3.5 w-3.5 transition-colors ${
                  ghostMode ? "text-neon" : "text-muted-foreground"
                }`}
              />
              <span className="text-xs text-muted-foreground">Ghost</span>
              <Switch
                checked={ghostMode}
                onCheckedChange={setGhostMode}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Ghost Mode — Browse without logging activity
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-neon border-2 border-background text-[8px] flex items-center justify-center text-primary-foreground font-bold">
                3
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notifications</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 gap-2 px-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px] bg-neon/10 text-neon">
                  {currentUser.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{currentUser.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {currentUser.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Audit Log</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>
  );
}
