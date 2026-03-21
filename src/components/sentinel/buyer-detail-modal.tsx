"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Phone, Mail, MessageSquare, Shield,
  Tag, StickyNote, Building2, MapPin,
  ChevronDown, Trash2, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useBuyerStats, updateBuyer, createBuyer } from "@/hooks/use-buyers";
import type { BuyerRow } from "@/lib/buyer-types";
import { fmtPrice } from "@/lib/display-helpers";
import {
  MARKET_OPTIONS, ASSET_TYPE_OPTIONS, FUNDING_TYPE_OPTIONS,
  POF_STATUS_OPTIONS, REHAB_OPTIONS, STRATEGY_OPTIONS,
  OCCUPANCY_OPTIONS, BUYER_TAG_OPTIONS,
  marketLabel, assetTypeLabel, strategyLabel, fundingLabel,
  pofLabel, rehabLabel, tagLabel, formatPriceRange,
  dealBuyerStatusLabel,
} from "@/lib/buyer-types";
import type {
  ContactMethod, FundingType, POFStatus, RehabTolerance,
  BuyerStrategy, OccupancyPref, BuyerStatus,
} from "@/lib/buyer-types";

// ── Types ──

interface BuyerDetailModalProps {
  buyer: BuyerRow | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (buyer: BuyerRow) => void;
  isCreate?: boolean;
}

// ── Helpers ──

const CONTACT_METHOD_ICONS: Record<ContactMethod, typeof Phone> = {
  phone: Phone,
  email: Mail,
  text: MessageSquare,
};

function SectionHeader({ icon: Icon, label, collapsed, onToggle }: {
  icon: typeof Phone; label: string; collapsed: boolean; onToggle: () => void;
}) {
  return (
    <button onClick={onToggle} className="flex items-center gap-2 w-full group py-1">
      <Icon className="h-3.5 w-3.5 text-primary/70" />
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 group-hover:text-foreground/90 transition-colors">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/[0.04]" />
      <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.15 }}>
        <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
      </motion.div>
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm text-muted-foreground/70 font-medium uppercase tracking-wider">{children}</label>;
}

function GlassInput({ value, onChange, placeholder, type = "text", className }: {
  value: string | number | null;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full bg-white/[0.03] border border-white/[0.06] rounded-[8px] px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20 transition-all",
        className
      )}
    />
  );
}

function GlassSelect({ value, onChange, options, placeholder }: {
  value: string | null;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-[8px] px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20 transition-all appearance-none cursor-pointer"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function PillToggle({ value, selected, onToggle, label }: {
  value: string; selected: boolean; onToggle: (v: string) => void; label: string;
}) {
  return (
    <button
      onClick={() => onToggle(value)}
      className={cn(
        "px-2.5 py-1 rounded-full text-sm font-medium border transition-all",
        selected
          ? "bg-primary/15 border-primary/30 text-primary"
          : "bg-white/[0.02] border-white/[0.06] text-muted-foreground/60 hover:border-white/[0.12] hover:text-muted-foreground"
      )}
    >
      {label}
    </button>
  );
}

// ── Component ──

export function BuyerDetailModal({ buyer, open, onClose, onSaved, isCreate }: BuyerDetailModalProps) {
  // Form state
  const [form, setForm] = useState<Partial<BuyerRow>>({});
  const [saving, setSaving] = useState(false);
  // Default: Contact, Buy Box, and Performance expanded; others collapsed
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    pof: true,
    tags: true,
    notes: true,
  });

  // Performance stats (includes outreach history via recent_deals)
  const { stats, loading: statsLoading, error: statsError } = useBuyerStats(!isCreate ? buyer?.id ?? null : null);

  // Initialize form from buyer
  useEffect(() => {
    if (buyer) {
      setForm({ ...buyer });
    } else if (isCreate) {
      setForm({
        contact_name: "",
        company_name: null,
        phone: null,
        email: null,
        preferred_contact_method: "phone" as ContactMethod,
        markets: [],
        asset_types: [],
        price_range_low: null,
        price_range_high: null,
        funding_type: null,
        proof_of_funds: "not_submitted" as POFStatus,
        rehab_tolerance: null,
        buyer_strategy: null,
        occupancy_pref: "either" as OccupancyPref,
        tags: [],
        notes: null,
        status: "active" as BuyerStatus,
      });
    }
  }, [buyer, isCreate]);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const updateField = useCallback((key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleArrayItem = useCallback((key: string, value: string) => {
    setForm((prev) => {
      const arr = (prev[key as keyof BuyerRow] as string[]) ?? [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.contact_name?.trim()) {
      toast.error("Contact name is required");
      return;
    }

    setSaving(true);
    try {
      let saved: BuyerRow;
      if (isCreate) {
        saved = await createBuyer(form);
        toast.success("Buyer created");
      } else if (buyer?.id) {
        saved = await updateBuyer(buyer.id, form);
        toast.success("Buyer updated");
      } else {
        return;
      }
      onSaved?.(saved);
      if (isCreate) onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [form, buyer?.id, isCreate, onSaved, onClose]);

  const handleDeactivate = useCallback(async () => {
    if (!buyer?.id) return;
    setSaving(true);
    try {
      const saved = await updateBuyer(buyer.id, { status: "inactive" as BuyerStatus });
      toast.success("Buyer deactivated");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate");
    } finally {
      setSaving(false);
    }
  }, [buyer?.id, onSaved, onClose]);

  if (!open) return null;

  const markets = (form.markets as string[]) ?? [];
  const assetTypes = (form.asset_types as string[]) ?? [];
  const tags = (form.tags as string[]) ?? [];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="relative z-50 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[16px] modal-glass p-6 space-y-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
            style={{ boxShadow: "inset 0 0 4px rgba(255,255,255,0.18), inset 0 0 14px rgba(0,0,0,0.12), 0 8px 26px rgba(0,0,0,0.16), 0 32px 80px rgba(0,0,0,0.08)" }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-[8px] opacity-60 hover:opacity-100 hover:bg-primary/5 p-1 transition-all z-10"
            >
              <X className="h-4 w-4" />
            </button>

            {/* ── Header ── */}
            <div className="flex items-start gap-3 pr-8">
              <div className="h-10 w-10 rounded-[12px] bg-primary/8 border border-primary/18 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary/70" />
              </div>
              <div className="flex-1 min-w-0">
                <GlassInput
                  value={form.contact_name ?? ""}
                  onChange={(v) => updateField("contact_name", v)}
                  placeholder="Contact Name"
                  className="text-lg font-semibold bg-transparent border-transparent hover:border-white/[0.06] focus:border-primary/30 px-1 py-0"
                />
                <GlassInput
                  value={form.company_name ?? ""}
                  onChange={(v) => updateField("company_name", v || null)}
                  placeholder="Company (optional)"
                  className="text-sm text-muted-foreground bg-transparent border-transparent hover:border-white/[0.06] focus:border-primary/30 px-1 py-0 mt-0.5"
                />
              </div>
              <Badge variant={form.status === "active" ? "neon" : "secondary"} className="shrink-0 mt-1">
                {form.status === "active" ? "Active" : "Inactive"}
              </Badge>
            </div>

            {/* ── Contact Info ── */}
            <div>
              <SectionHeader icon={Phone} label="Contact Info" collapsed={!!collapsedSections.contact} onToggle={() => toggleSection("contact")} />
              <AnimatePresence initial={false}>
                {!collapsedSections.contact && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="space-y-1">
                        <FieldLabel>Phone</FieldLabel>
                        <GlassInput value={form.phone ?? ""} onChange={(v) => updateField("phone", v || null)} placeholder="(509) 555-1234" />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel>Email</FieldLabel>
                        <GlassInput value={form.email ?? ""} onChange={(v) => updateField("email", v || null)} placeholder="buyer@email.com" />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <FieldLabel>Preferred Contact</FieldLabel>
                        <div className="flex gap-2">
                          {(["phone", "email", "text"] as ContactMethod[]).map((m) => {
                            const Icon = CONTACT_METHOD_ICONS[m];
                            return (
                              <button
                                key={m}
                                onClick={() => updateField("preferred_contact_method", m)}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium border transition-all",
                                  form.preferred_contact_method === m
                                    ? "bg-primary/12 border-primary/25 text-primary"
                                    : "bg-white/[0.02] border-white/[0.06] text-muted-foreground/60 hover:border-white/[0.12]"
                                )}
                              >
                                <Icon className="h-3 w-3" />
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Buy Box ── */}
            <div>
              <SectionHeader icon={MapPin} label="Buy Box" collapsed={!!collapsedSections.buybox} onToggle={() => toggleSection("buybox")} />
              <AnimatePresence initial={false}>
                {!collapsedSections.buybox && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="space-y-3 mt-2">
                      {/* Markets */}
                      <div className="space-y-1.5">
                        <FieldLabel>Markets</FieldLabel>
                        <div className="flex flex-wrap gap-1.5">
                          {MARKET_OPTIONS.map((o) => (
                            <PillToggle key={o.value} value={o.value} selected={markets.includes(o.value)} onToggle={(v) => toggleArrayItem("markets", v)} label={o.label} />
                          ))}
                        </div>
                      </div>

                      {/* Asset Types */}
                      <div className="space-y-1.5">
                        <FieldLabel>Asset Types</FieldLabel>
                        <div className="flex flex-wrap gap-1.5">
                          {ASSET_TYPE_OPTIONS.map((o) => (
                            <PillToggle key={o.value} value={o.value} selected={assetTypes.includes(o.value)} onToggle={(v) => toggleArrayItem("asset_types", v)} label={o.label} />
                          ))}
                        </div>
                      </div>

                      {/* Price Range */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <FieldLabel>Min Price</FieldLabel>
                          <GlassInput
                            type="number"
                            value={form.price_range_low ?? ""}
                            onChange={(v) => updateField("price_range_low", v ? parseInt(v) : null)}
                            placeholder="$50,000"
                          />
                        </div>
                        <div className="space-y-1">
                          <FieldLabel>Max Price</FieldLabel>
                          <GlassInput
                            type="number"
                            value={form.price_range_high ?? ""}
                            onChange={(v) => updateField("price_range_high", v ? parseInt(v) : null)}
                            placeholder="$300,000"
                          />
                        </div>
                      </div>

                      {/* Selects row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <FieldLabel>Funding Type</FieldLabel>
                          <GlassSelect
                            value={form.funding_type ?? null}
                            onChange={(v) => updateField("funding_type", v || null)}
                            options={FUNDING_TYPE_OPTIONS as unknown as { value: string; label: string }[]}
                            placeholder="Select..."
                          />
                        </div>
                        <div className="space-y-1">
                          <FieldLabel>Rehab Tolerance</FieldLabel>
                          <GlassSelect
                            value={form.rehab_tolerance ?? null}
                            onChange={(v) => updateField("rehab_tolerance", v || null)}
                            options={REHAB_OPTIONS as unknown as { value: string; label: string }[]}
                            placeholder="Select..."
                          />
                        </div>
                        <div className="space-y-1">
                          <FieldLabel>Strategy</FieldLabel>
                          <GlassSelect
                            value={form.buyer_strategy ?? null}
                            onChange={(v) => updateField("buyer_strategy", v || null)}
                            options={STRATEGY_OPTIONS as unknown as { value: string; label: string }[]}
                            placeholder="Select..."
                          />
                        </div>
                        <div className="space-y-1">
                          <FieldLabel>Occupancy Pref</FieldLabel>
                          <GlassSelect
                            value={form.occupancy_pref ?? null}
                            onChange={(v) => updateField("occupancy_pref", v as OccupancyPref)}
                            options={OCCUPANCY_OPTIONS as unknown as { value: string; label: string }[]}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Proof of Funds ── */}
            <div>
              <SectionHeader icon={Shield} label="Proof of Funds" collapsed={!!collapsedSections.pof} onToggle={() => toggleSection("pof")} />
              <AnimatePresence initial={false}>
                {!collapsedSections.pof && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="space-y-1">
                        <FieldLabel>Status</FieldLabel>
                        <GlassSelect
                          value={form.proof_of_funds ?? "not_submitted"}
                          onChange={(v) => updateField("proof_of_funds", v)}
                          options={POF_STATUS_OPTIONS as unknown as { value: string; label: string }[]}
                        />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel>Verified At</FieldLabel>
                        <div className="text-sm text-muted-foreground/60 px-3 py-1.5">
                          {form.pof_verified_at
                            ? new Date(form.pof_verified_at).toLocaleDateString()
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Tags ── */}
            <div>
              <SectionHeader icon={Tag} label="Tags" collapsed={!!collapsedSections.tags} onToggle={() => toggleSection("tags")} />
              <AnimatePresence initial={false}>
                {!collapsedSections.tags && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {BUYER_TAG_OPTIONS.map((o) => (
                        <PillToggle key={o.value} value={o.value} selected={tags.includes(o.value)} onToggle={(v) => toggleArrayItem("tags", v)} label={o.label} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Performance & Deal History (existing buyers only) ── */}
            {!isCreate && buyer?.id && (
              <div>
                <SectionHeader icon={BarChart3} label="Performance & Deals" collapsed={!!collapsedSections.performance} onToggle={() => toggleSection("performance")} />
                <AnimatePresence initial={false}>
                  {!collapsedSections.performance && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-2 space-y-3">
                        {statsLoading && (
                          <div className="text-xs text-muted-foreground/50 py-3 text-center">Loading...</div>
                        )}
                        {!statsLoading && statsError && (
                          <div className="text-xs text-foreground/60 py-3 text-center">Failed to load stats</div>
                        )}
                        {!statsLoading && !statsError && !stats && (
                          <div className="text-xs text-muted-foreground/50 py-3 text-center">No performance data</div>
                        )}
                        {!statsLoading && stats && (
                          <>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { label: "Linked", value: stats.total_linked },
                                { label: "Contacted", value: stats.contacted },
                                { label: "Responded", value: stats.responded },
                                { label: "Interested", value: stats.interested },
                                { label: "Offered", value: stats.offered },
                                { label: "Selected", value: stats.selected },
                              ].map((s) => (
                                <div key={s.label} className="px-2.5 py-2 rounded-[6px] bg-white/[0.02] border border-white/[0.04] text-center">
                                  <div className="text-sm font-semibold text-foreground">{s.value}</div>
                                  <div className="text-xs text-muted-foreground/50 uppercase tracking-wider mt-0.5">{s.label}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
                              {stats.response_rate != null && (
                                <span>Response rate: <span className="text-foreground/80 font-medium">{stats.response_rate}%</span></span>
                              )}
                              {stats.avg_response_days != null && (
                                <span>Avg response: <span className="text-foreground/80 font-medium">~{stats.avg_response_days}d</span></span>
                              )}
                            </div>
                            {stats.recent_deals.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="text-sm text-muted-foreground/50 uppercase tracking-wider font-semibold">Recent Deals</div>
                                {stats.recent_deals.map((rd, i) => (
                                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] bg-white/[0.015] border border-white/[0.04] text-xs">
                                    <span className="flex-1 truncate text-foreground/70">{rd.property_address ?? "Unknown"}</span>
                                    <Badge
                                      variant={rd.deal_buyer_status === "selected" ? "neon" : rd.deal_buyer_status === "interested" ? "cyan" : rd.deal_buyer_status === "passed" ? "secondary" : "outline"}
                                      className="text-xs shrink-0"
                                    >
                                      {dealBuyerStatusLabel(rd.deal_buyer_status)}
                                    </Badge>
                                    {rd.offer_amount != null && (
                                      <span className="text-primary/70 font-medium shrink-0">{fmtPrice(rd.offer_amount)}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── Notes ── */}
            <div>
              <SectionHeader icon={StickyNote} label="Notes" collapsed={!!collapsedSections.notes} onToggle={() => toggleSection("notes")} />
              <AnimatePresence initial={false}>
                {!collapsedSections.notes && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <textarea
                      value={form.notes ?? ""}
                      onChange={(e) => updateField("notes", e.target.value || null)}
                      placeholder="Notes about this buyer..."
                      rows={3}
                      className="w-full mt-2 bg-white/[0.03] border border-white/[0.06] rounded-[8px] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20 transition-all resize-none"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center gap-3 pt-2 border-t border-white/[0.04]">
              {!isCreate && (
                <button
                  onClick={handleDeactivate}
                  disabled={saving || form.status === "inactive"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground/80 hover:text-foreground hover:bg-muted/10 rounded-[8px] border border-transparent hover:border-border/20 transition-all disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                  Deactivate
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-[8px] border border-white/[0.06] hover:border-white/[0.12] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-[8px] border border-primary/25 hover:border-primary/40 transition-all disabled:opacity-50"
              >
                {saving ? "Saving..." : isCreate ? "Create Buyer" : "Save Changes"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
