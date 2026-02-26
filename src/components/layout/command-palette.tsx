"use client";

import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Phone,
  Mail,
  Calendar,
  Users,
  Contact,
  BarChart3,
  Settings,
  UserPlus,
  Search,
  Zap,
  FileSignature,
  Megaphone,
  DollarSign,
  Share2,
} from "lucide-react";
import { useSentinelStore } from "@/lib/store";
import { useCommandPalette } from "@/hooks/use-command-palette";

const commands = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Navigation" },
  { label: "Dialer", href: "/dialer", icon: Phone, group: "Navigation" },
  { label: "Gmail", href: "/gmail", icon: Mail, group: "Navigation" },
  { label: "Team Calendar", href: "/team-calendar", icon: Calendar, group: "Navigation" },
  { label: "Prospects", href: "/sales-funnel/prospects", icon: UserPlus, group: "Deal Funnel" },
  { label: "Leads", href: "/sales-funnel/leads", icon: Users, group: "Deal Funnel" },
  { label: "My Leads", href: "/sales-funnel/leads/my-leads", icon: UserPlus, group: "Deal Funnel" },
  { label: "Negotiation", href: "/sales-funnel/negotiation", icon: Zap, group: "Deal Funnel" },
  { label: "Contacts", href: "/contacts", icon: Contact, group: "Navigation" },
  { label: "DocuSign", href: "/docusign", icon: FileSignature, group: "Navigation" },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone, group: "Navigation" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, group: "Navigation" },
  { label: "Settings", href: "/settings", icon: Settings, group: "Navigation" },
  { label: "PPL", href: "/sales-funnel/ppl", icon: DollarSign, group: "Deal Funnel" },
  { label: "Facebook/Craigslist", href: "/sales-funnel/facebook-craigslist", icon: Share2, group: "Deal Funnel" },
  { label: "New Prospect", href: "#new-prospect", icon: UserPlus, group: "Actions" },
  { label: "Quick Search Contacts", href: "#search-contacts", icon: Search, group: "Actions" },
];

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const { setCommandPaletteOpen } = useSentinelStore();

  const handleSelect = (href: string) => {
    setCommandPaletteOpen(false);
    if (href.startsWith("#")) {
      // TODO: Handle actions
      return;
    }
    router.push(href);
  };

  const groups = Array.from(new Set(commands.map((c) => c.group)));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2"
          >
            <Command className="rounded-xl glass-strong border border-glass-border shadow-2xl overflow-hidden">
              <div className="flex items-center border-b border-glass-border px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  placeholder="Search commands, pages, leads..."
                  className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Command.List className="max-h-[300px] overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                  No results found.
                </Command.Empty>
                {groups.map((group) => (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {commands
                      .filter((c) => c.group === group)
                      .map((cmd) => {
                        const Icon = cmd.icon;
                        return (
                          <Command.Item
                            key={cmd.href}
                            value={cmd.label}
                            onSelect={() => handleSelect(cmd.href)}
                            className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
                          >
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span>{cmd.label}</span>
                          </Command.Item>
                        );
                      })}
                  </Command.Group>
                ))}
              </Command.List>
              <div className="border-t border-glass-border px-3 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-glass-border">
                    ↑↓
                  </kbd>{" "}
                  Navigate
                </span>
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-glass-border">
                    ↵
                  </kbd>{" "}
                  Select
                </span>
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-glass-border">
                    Esc
                  </kbd>{" "}
                  Close
                </span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
