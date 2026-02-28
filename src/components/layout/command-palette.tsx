"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  MapPin,
  ArrowRight,
  Flame,
  User,
  type LucideIcon,
} from "lucide-react";
import { useSentinelStore } from "@/lib/store";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface NavCommand {
  kind: "nav";
  label: string;
  href: string;
  icon: LucideIcon;
  group: string;
}

interface DataResult {
  kind: "lead" | "prospect" | "contact";
  id: string;
  primary: string;
  secondary: string;
  href: string;
  score?: number;
  scoreLabel?: "fire" | "hot" | "warm" | "cold";
  status?: string;
  source?: string;
}

type SearchResult = NavCommand | DataResult;

const NAV_COMMANDS: NavCommand[] = [
  { kind: "nav", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Pages" },
  { kind: "nav", label: "Dialer", href: "/dialer", icon: Phone, group: "Pages" },
  { kind: "nav", label: "Gmail", href: "/gmail", icon: Mail, group: "Pages" },
  { kind: "nav", label: "Team Calendar", href: "/team-calendar", icon: Calendar, group: "Pages" },
  { kind: "nav", label: "My Calendar", href: "/my-calendar", icon: Calendar, group: "Pages" },
  { kind: "nav", label: "Prospects", href: "/sales-funnel/prospects", icon: UserPlus, group: "Deal Funnel" },
  { kind: "nav", label: "Leads Hub", href: "/leads", icon: Users, group: "Deal Funnel" },
  { kind: "nav", label: "Negotiation", href: "/sales-funnel/negotiation", icon: Zap, group: "Deal Funnel" },
  { kind: "nav", label: "Disposition", href: "/sales-funnel/disposition", icon: Zap, group: "Deal Funnel" },
  { kind: "nav", label: "Contacts", href: "/contacts", icon: Contact, group: "Pages" },
  { kind: "nav", label: "DocuSign", href: "/docusign", icon: FileSignature, group: "Pages" },
  { kind: "nav", label: "Campaigns", href: "/campaigns", icon: Megaphone, group: "Pages" },
  { kind: "nav", label: "Analytics", href: "/analytics", icon: BarChart3, group: "Pages" },
  { kind: "nav", label: "Settings", href: "/settings", icon: Settings, group: "Pages" },
  { kind: "nav", label: "PPL", href: "/sales-funnel/ppl", icon: DollarSign, group: "Deal Funnel" },
  { kind: "nav", label: "Facebook/Craigslist", href: "/sales-funnel/facebook-craigslist", icon: Share2, group: "Deal Funnel" },
];

const CONTACT_DATA = [
  { id: "c1", name: "Sarah Kim", company: "AZ Realty Group", phone: "(602) 555-0100", role: "Title Agent" },
  { id: "c2", name: "Mike Reynolds", company: "Desert Title Co", phone: "(480) 555-0200", role: "Closer" },
  { id: "c3", name: "Jennifer Torres", company: "Pinal County Records", phone: "(520) 555-0300", role: "County Clerk" },
  { id: "c4", name: "Brian Patterson", company: "Phoenix Appraisals", phone: "(602) 555-0400", role: "Appraiser" },
  { id: "c5", name: "Amanda Walsh", company: "Southwest Escrow", phone: "(480) 555-0500", role: "Escrow Officer" },
];

function matchesQuery(text: string, query: string): boolean {
  const lower = query.toLowerCase();
  return text.toLowerCase().includes(lower);
}

const SCORE_COLORS: Record<string, string> = {
  fire: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  hot: "text-red-400 bg-red-500/15 border-red-500/30",
  warm: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  cold: "text-blue-400 bg-blue-500/15 border-blue-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  lead: "Lead",
  negotiation: "Negotiation",
  nurture: "Nurture",
  dead: "Dead",
  closed: "Closed",
};

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const { setCommandPaletteOpen } = useSentinelStore();
  const [query, setQuery] = useState("");

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, [setOpen]);

  const handleSelect = useCallback((href: string) => {
    setCommandPaletteOpen(false);
    setQuery("");
    if (href.startsWith("#")) return;
    router.push(href);
  }, [setCommandPaletteOpen, router]);

  const [dataResults, setDataResults] = useState<DataResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setDataResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      const pattern = `%${query}%`;
      const results: DataResult[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: props } = await (supabase.from("properties") as any)
        .select("id, apn, address, city, state, zip, owner_name")
        .or(`address.ilike.${pattern},owner_name.ilike.${pattern},apn.ilike.${pattern}`)
        .limit(15);

      if (props && props.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const propIds = (props as any[]).map((p) => p.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: leads } = await (supabase.from("leads") as any)
          .select("id, property_id, status, priority, source")
          .in("property_id", propIds);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const leadMap: Record<string, any> = {};
        if (leads) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const l of leads as any[]) leadMap[l.property_id] = l;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of props as any[]) {
          const lead = leadMap[p.id];
          const isProspect = !lead || lead.status === "prospect";
          const score = lead?.priority ?? 0;
          const label = score >= 85 ? "fire" : score >= 65 ? "hot" : score >= 40 ? "warm" : "cold";

          results.push({
            kind: isProspect ? "prospect" : "lead",
            id: lead?.id ?? p.id,
            primary: p.owner_name ?? "Unknown",
            secondary: [p.address, p.city, p.state, p.apn].filter(Boolean).join(", "),
            href: isProspect ? "/sales-funnel/prospects" : "/leads",
            score: score > 0 ? score : undefined,
            scoreLabel: score > 0 ? label as DataResult["scoreLabel"] : undefined,
            status: lead?.status ?? "prospect",
            source: lead?.source,
          });
        }
      }

      for (const contact of CONTACT_DATA) {
        const haystack = [contact.name, contact.company, contact.phone, contact.role].join(" ");
        if (matchesQuery(haystack, query)) {
          results.push({
            kind: "contact",
            id: contact.id,
            primary: contact.name,
            secondary: `${contact.role} — ${contact.company}`,
            href: "/contacts",
          });
        }
      }

      setDataResults(results.slice(0, 12));
    }, 250);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const navResults = useMemo(() => {
    if (!query) return NAV_COMMANDS;
    return NAV_COMMANDS.filter((c) => matchesQuery(c.label, query));
  }, [query]);

  const hasData = dataResults.length > 0;
  const prospects = dataResults.filter((r) => r.kind === "prospect");
  const leads = dataResults.filter((r) => r.kind === "lead");
  const contacts = dataResults.filter((r) => r.kind === "contact");

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-[15%] z-50 w-full max-w-2xl -translate-x-1/2"
          >
            <Command
              className="rounded-[14px] glass-strong border border-white/[0.06] shadow-2xl overflow-hidden"
              shouldFilter={false}
            >
              <div className="flex items-center border-b border-white/[0.06] px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 text-neon/70" />
                <Command.Input
                  placeholder="Search owners, addresses, APNs, contacts, pages..."
                  className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                  value={query}
                  onValueChange={setQuery}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-white/[0.06]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Command.List className="max-h-[420px] overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                  {query.length < 2
                    ? "Type at least 2 characters to search records..."
                    : "No matching records found."}
                </Command.Empty>

                {prospects.length > 0 && (
                  <Command.Group
                    heading="Prospects"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-neon/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {prospects.map((r) => (
                      <DataResultItem key={r.id} result={r} onSelect={handleSelect} />
                    ))}
                  </Command.Group>
                )}

                {leads.length > 0 && (
                  <Command.Group
                    heading="Leads"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-neon/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {leads.map((r) => (
                      <DataResultItem key={r.id} result={r} onSelect={handleSelect} />
                    ))}
                  </Command.Group>
                )}

                {contacts.length > 0 && (
                  <Command.Group
                    heading="Contacts"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-neon/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {contacts.map((r) => (
                      <DataResultItem key={r.id} result={r} onSelect={handleSelect} />
                    ))}
                  </Command.Group>
                )}

                {navResults.length > 0 && (
                  <Command.Group
                    heading="Pages"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {navResults.map((cmd) => {
                      const Icon = cmd.icon;
                      return (
                        <Command.Item
                          key={cmd.href}
                          value={cmd.label}
                          onSelect={() => handleSelect(cmd.href)}
                          className="flex items-center gap-3 rounded-[10px] px-2 py-2 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
                        >
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1">{cmd.label}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}
              </Command.List>
              <div className="border-t border-white/[0.06] px-3 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-white/[0.06]">↑↓</kbd>{" "}
                  Navigate
                </span>
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-white/[0.06]">↵</kbd>{" "}
                  Open
                </span>
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-white/[0.06]">Esc</kbd>{" "}
                  Close
                </span>
                {hasData && (
                  <span className="ml-auto text-neon/60">
                    {dataResults.length} record{dataResults.length !== 1 ? "s" : ""} found
                  </span>
                )}
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DataResultItem({ result, onSelect }: { result: DataResult; onSelect: (href: string) => void }) {
  const kindIcon: Record<string, LucideIcon> = {
    prospect: UserPlus,
    lead: Users,
    contact: User,
  };
  const Icon = kindIcon[result.kind] ?? MapPin;

  return (
    <Command.Item
      value={`${result.primary} ${result.secondary}`}
      onSelect={() => onSelect(result.href)}
      className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors group"
    >
      <div className={cn(
        "h-7 w-7 rounded-md flex items-center justify-center shrink-0 border",
        result.kind === "prospect" ? "bg-cyan/[0.08] border-cyan/15 text-neon" :
        result.kind === "lead" ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
        "bg-white/[0.04] border-white/[0.06] text-muted-foreground"
      )}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate text-foreground"
          style={{
            textShadow: "0 0 8px rgba(0,255,136,0.1)",
            WebkitFontSmoothing: "antialiased",
          }}
        >
          {result.primary}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{result.secondary}</p>
      </div>
      {result.score != null && result.scoreLabel && (
        <span className={cn(
          "text-[9px] px-1.5 py-0.5 rounded border font-bold shrink-0",
          SCORE_COLORS[result.scoreLabel]
        )}>
          {result.scoreLabel === "fire" && <Flame className="h-2 w-2 inline mr-0.5" />}
          {result.score}
        </span>
      )}
      {result.status && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.08] text-muted-foreground border border-white/[0.06] shrink-0">
          {STATUS_LABELS[result.status] ?? result.status}
        </span>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-aria-selected:text-neon/50 shrink-0" />
    </Command.Item>
  );
}
