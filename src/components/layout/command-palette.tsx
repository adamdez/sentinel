"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Phone,
  Users,
  Contact,
  BarChart3,
  Settings,
  UserPlus,
  Search,
  Zap,
  FileSignature,
  Home,
  MapPin,
  ArrowRight,
  Flame,
  User,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useSentinelStore } from "@/lib/store";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useModal } from "@/providers/modal-provider";
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
  scoreLabel?: "platinum" | "gold" | "silver" | "bronze";
  status?: string;
  source?: string;
}

interface BrickedResult {
  kind: "bricked";
  address: string;
  ownerNames: string | null;
  arv: number | null;
  cmv: number | null;
  totalRepairCost: number | null;
  equityEstimate: number | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  renovationScore: number | null;
  brickedId: string;
  shareLink: string | null;
  dashboardLink: string | null;
  compCount: number;
  subjectImages: string[];
  repairs: Array<{ item: string; cost: number }>;
  rawPayload: Record<string, unknown>;
}

function looksLikeAddress(q: string): boolean {
  return /^\d+\s+[a-zA-Z]/.test(q) && q.length >= 6;
}

type SearchResult = NavCommand | DataResult;

const NAV_COMMANDS: NavCommand[] = [
  { kind: "nav", label: "Today", href: "/dashboard", icon: LayoutDashboard, group: "Core" },
  { kind: "nav", label: "Lead Queue", href: "/leads", icon: Users, group: "Core" },
  { kind: "nav", label: "Dialer", href: "/dialer", icon: Phone, group: "Core" },
  { kind: "nav", label: "Dispo", href: "/dispo", icon: FileSignature, group: "Core" },
  { kind: "nav", label: "Active", href: "/pipeline", icon: Zap, group: "Core" },
  { kind: "nav", label: "Property Research", href: "/properties/lookup", icon: MapPin, group: "Tools" },
  { kind: "nav", label: "Buyers", href: "/buyers", icon: Contact, group: "Tools" },
  { kind: "nav", label: "Ads", href: "/ads", icon: Home, group: "Tools" },
  { kind: "nav", label: "Research Review", href: "/dialer/review/dossier-queue", icon: Search, group: "Review" },
  { kind: "nav", label: "Call QA", href: "/dialer/qa", icon: Search, group: "Review" },
  { kind: "nav", label: "Call Review", href: "/dialer/war-room", icon: Phone, group: "Review" },
  { kind: "nav", label: "Review Console", href: "/dialer/review", icon: BarChart3, group: "Review" },
  { kind: "nav", label: "AI Evals", href: "/dialer/review/eval", icon: Search, group: "Review" },
  { kind: "nav", label: "Analytics", href: "/analytics", icon: BarChart3, group: "Admin" },
  { kind: "nav", label: "Settings", href: "/settings", icon: Settings, group: "Admin" },
  { kind: "nav", label: "Prompt Registry", href: "/settings/prompt-registry", icon: Settings, group: "Admin" },
  { kind: "nav", label: "Voice Registry", href: "/settings/voice-registry", icon: Settings, group: "Admin" },
  { kind: "nav", label: "Source Policies", href: "/settings/source-policies", icon: Settings, group: "Admin" },
  { kind: "nav", label: "Agent Controls", href: "/settings/agent-controls", icon: Settings, group: "Admin" },
  { kind: "nav", label: "Import", href: "/admin/import", icon: Upload, group: "Admin" },
];


function matchesQuery(text: string, query: string): boolean {
  const lower = query.toLowerCase();
  return text.toLowerCase().includes(lower);
}

const SCORE_COLORS: Record<string, string> = {
  platinum: "text-primary-300 bg-primary-400/15 border-primary-400/30",
  gold: "text-foreground bg-muted/15 border-border/30",
  silver: "text-foreground bg-muted/15 border-border/30",
  bronze: "text-foreground bg-muted/15 border-border/30",
};

const STATUS_LABELS: Record<string, string> = {
  prospect: "New",
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
  const { openModal } = useModal();
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

  const handleCreateFromBricked = useCallback((bricked: BrickedResult) => {
    setCommandPaletteOpen(false);
    setQuery("");
    openModal("new-prospect", { brickedData: bricked });
  }, [setCommandPaletteOpen, openModal]);

  const [dataResults, setDataResults] = useState<DataResult[]>([]);
  const [brickedResult, setBrickedResult] = useState<BrickedResult | null>(null);
  const [brickedLoading, setBrickedLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brickedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          const label = score >= 85 ? "platinum" : score >= 65 ? "gold" : score >= 40 ? "silver" : "bronze";

          results.push({
            kind: isProspect ? "prospect" : "lead",
            id: lead?.id ?? p.id,
            primary: p.owner_name ?? "Unknown",
            secondary: [p.address, p.city, p.state, p.apn].filter(Boolean).join(", "),
            href: lead?.id ? `/leads?open=${lead.id}` : "/leads",
            score: score > 0 ? score : undefined,
            scoreLabel: score > 0 ? label as DataResult["scoreLabel"] : undefined,
            status: lead?.status ?? "prospect",
            source: lead?.source,
          });
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contactRows } = await (supabase.from("contacts") as any)
        .select("id, first_name, last_name, phone, email, contact_type")
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`)
        .limit(5);

      if (contactRows && contactRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const c of contactRows as any[]) {
          results.push({
            kind: "contact",
            id: c.id,
            primary: `${c.first_name} ${c.last_name}`.trim(),
            secondary: [c.phone, c.email, c.contact_type].filter(Boolean).join(" — "),
            href: "/contacts",
          });
        }
      }

      setDataResults(results.slice(0, 12));
    }, 250);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Bricked search — fires on address-like queries (longer debounce since API is slower)
  useEffect(() => {
    if (brickedDebounceRef.current) clearTimeout(brickedDebounceRef.current);
    if (!looksLikeAddress(query)) { setBrickedResult(null); setBrickedLoading(false); return; }

    setBrickedLoading(true);
    brickedDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/bricked/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: query }),
        });
        if (!res.ok) { setBrickedResult(null); setBrickedLoading(false); return; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await res.json() as any;
        if (!data?.address) { setBrickedResult(null); setBrickedLoading(false); return; }

        const subject = data.subject ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const repairItems = (data.repairs ?? []).map((r: any) => ({
          item: r.name ?? r.item ?? "Unknown",
          cost: r.cost ?? r.estimatedCost ?? 0,
        }));

        setBrickedResult({
          kind: "bricked",
          address: data.address ?? query,
          ownerNames: subject.ownerNames?.join(", ") ?? data.ownerNames ?? null,
          arv: data.arv ?? null,
          cmv: data.cmv ?? subject.estimatedValue ?? null,
          totalRepairCost: data.totalRepairCost ?? null,
          equityEstimate: subject.estimatedEquity ?? null,
          propertyType: subject.propertyType ?? subject.landUse ?? null,
          bedrooms: subject.bedrooms ?? null,
          bathrooms: subject.bathrooms ?? null,
          sqft: subject.squareFeet ?? null,
          yearBuilt: subject.yearBuilt ?? null,
          renovationScore: data.renovationScore ?? null,
          brickedId: data.id ?? "",
          shareLink: data.shareLink ?? null,
          dashboardLink: data.dashboardLink ?? null,
          compCount: data.comps?.length ?? 0,
          subjectImages: data.subjectImages ?? [],
          repairs: repairItems,
          rawPayload: data,
        });
      } catch {
        setBrickedResult(null);
      } finally {
        setBrickedLoading(false);
      }
    }, 800);

    return () => { if (brickedDebounceRef.current) clearTimeout(brickedDebounceRef.current); };
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
              className="rounded-[14px] glass-strong border border-glass-border shadow-2xl overflow-hidden"
              shouldFilter={false}
            >
              <div className="flex items-center border-b border-glass-border px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 text-primary/70" />
                <Command.Input
                  placeholder="Find lead, address, APN, or phone..."
                  className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                  value={query}
                  onValueChange={setQuery}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-overlay-6"
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
                    heading="Leads"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-primary/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {prospects.map((r) => (
                      <DataResultItem key={r.id} result={r} onSelect={handleSelect} />
                    ))}
                  </Command.Group>
                )}

                {leads.length > 0 && (
                  <Command.Group
                    heading="Leads"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-primary/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {leads.map((r) => (
                      <DataResultItem key={r.id} result={r} onSelect={handleSelect} />
                    ))}
                  </Command.Group>
                )}

                {contacts.length > 0 && (
                  <Command.Group
                    heading="Contacts"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-primary/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {contacts.map((r) => (
                      <DataResultItem key={r.id} result={r} onSelect={handleSelect} />
                    ))}
                  </Command.Group>
                )}

                {/* Bricked Property Lookup */}
                {(brickedResult || brickedLoading) && (
                  <Command.Group
                    heading="Property Lookup"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-primary/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {brickedLoading && !brickedResult && (
                      <div className="flex items-center gap-3 px-2 py-3 text-sm text-muted-foreground">
                        <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <span>Searching Bricked AI...</span>
                      </div>
                    )}
                    {brickedResult && (
                      <Command.Item
                        value={`bricked-${brickedResult.address}`}
                        onSelect={() => handleCreateFromBricked(brickedResult)}
                        className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors group"
                      >
                        <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 border bg-primary/8 border-primary/15 text-primary">
                          <Home className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate text-foreground" style={{ WebkitFontSmoothing: "antialiased" }}>
                            {brickedResult.address}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {[
                              brickedResult.ownerNames,
                              brickedResult.arv ? `ARV $${Number(brickedResult.arv).toLocaleString()}` : null,
                              brickedResult.cmv ? `CMV $${Number(brickedResult.cmv).toLocaleString()}` : null,
                              brickedResult.totalRepairCost ? `Repairs $${Number(brickedResult.totalRepairCost).toLocaleString()}` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 font-semibold shrink-0">
                          + Create Lead
                        </span>
                      </Command.Item>
                    )}
                  </Command.Group>
                )}

                {navResults.length > 0 && (
                  <Command.Group
                    heading="Pages"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
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
              <div className="border-t border-overlay-6 px-3 py-2 flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-overlay-6">↑↓</kbd>{" "}
                  Navigate
                </span>
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-overlay-6">↵</kbd>{" "}
                  Open
                </span>
                <span>
                  <kbd className="font-mono bg-background/50 px-1 py-0.5 rounded border border-overlay-6">Esc</kbd>{" "}
                  Close
                </span>
                {hasData && (
                  <span className="ml-auto text-primary/60">
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
        result.kind === "prospect" ? "bg-primary/8 border-primary/15 text-primary" :
        result.kind === "lead" ? "bg-muted/10 border-border/20 text-foreground" :
        "bg-overlay-4 border-overlay-6 text-muted-foreground"
      )}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate text-foreground"
          style={{
            WebkitFontSmoothing: "antialiased",
          }}
        >
          {result.primary}
        </p>
        <p className="text-sm text-muted-foreground truncate">{result.secondary}</p>
      </div>
      {result.score != null && result.scoreLabel && (
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded border font-bold shrink-0",
          SCORE_COLORS[result.scoreLabel]
        )}>
          {result.scoreLabel === "platinum" && <Flame className="h-2 w-2 inline mr-0.5" />}
          {result.score}
        </span>
      )}
      {result.status && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-overlay-8 text-muted-foreground border border-overlay-6 shrink-0">
          {STATUS_LABELS[result.status] ?? result.status}
        </span>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-aria-selected:text-primary/50 shrink-0" />
    </Command.Item>
  );
}
