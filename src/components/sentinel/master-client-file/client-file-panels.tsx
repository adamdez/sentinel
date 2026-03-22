"use client";

// Extracted panel components from master-client-file-modal.tsx.
// These components have no closure over modal state — they receive only props.

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Pencil, X, Save, Loader2, AlertTriangle, Trash2, MapPin, User,
  Brain, ArrowRight, DollarSign, Target, Globe, Search, ShieldAlert,
  Users, Phone, Mail, CheckCircle, Plus, Briefcase, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import Link from "next/link";
import { useDealBuyers } from "@/hooks/use-buyers";
import { dealBuyerStatusLabel } from "@/lib/buyer-types";
import type { ClientFile } from "../master-client-file-helpers";

// ── EditField ─────────────────────────────────────────────────────────────────

export interface EditFields {
  address: string;
  city: string;
  state: string;
  zip: string;
  owner_name: string;
  apn: string;
  property_type: string;
  notes: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  year_built: string;
  lot_size: string;
}

export function EditField({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-muted-foreground uppercase tracking-wider font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground",
          "placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20",
          "transition-all hover:border-white/[0.12]",
          mono && "font-mono",
        )}
      />
    </div>
  );
}

// ── EditDetailsModal ──────────────────────────────────────────────────────────

export function EditDetailsModal({ cf, onClose, onSaved }: { cf: ClientFile; onClose: () => void; onSaved: () => void }) {
  const [fields, setFields] = useState<EditFields>({
    address: cf.address?.split(",")[0]?.trim() ?? "",
    city: cf.city || "",
    state: cf.state || "",
    zip: cf.zip || "",
    owner_name: cf.ownerName || "",
    apn: cf.apn || "",
    property_type: cf.propertyType || "",
    notes: cf.notes || "",
    bedrooms: cf.bedrooms != null ? String(cf.bedrooms) : "",
    bathrooms: cf.bathrooms != null ? String(cf.bathrooms) : "",
    sqft: cf.sqft != null ? String(cf.sqft) : "",
    year_built: cf.yearBuilt != null ? String(cf.yearBuilt) : "",
    lot_size: cf.lotSize != null ? String(cf.lotSize) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof EditFields) => (v: string) => setFields((p) => ({ ...p, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Session expired. Please sign in again.");
        return;
      }

      const fullAddr = [fields.address, fields.city, fields.state, fields.zip].filter(Boolean).join(", ");
      const res = await fetch("/api/properties/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          property_id: cf.propertyId,
          lead_id: cf.id,
          fields: {
            address: fullAddr,
            city: fields.city,
            state: fields.state,
            zip: fields.zip,
            owner_name: fields.owner_name,
            apn: fields.apn,
            property_type: fields.property_type || null,
            notes: fields.notes || null,
            bedrooms: fields.bedrooms ? parseInt(fields.bedrooms) : null,
            bathrooms: fields.bathrooms ? parseFloat(fields.bathrooms) : null,
            sqft: fields.sqft ? parseInt(fields.sqft) : null,
            year_built: fields.year_built ? parseInt(fields.year_built) : null,
            lot_size: fields.lot_size ? parseInt(fields.lot_size) : null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Update failed");
        return;
      }
      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden rounded-[16px] border border-white/[0.08]
            modal-glass flex flex-col"
        >
          {/* Holographic accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-primary/[0.03] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] bg-primary/10 flex items-center justify-center">
                <Pencil className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Edit Property Details</h3>
                <p className="text-sm text-muted-foreground">{cf.fullAddress}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
            <EditField label="Street Address" value={fields.address} onChange={set("address")} placeholder="123 Main St" />
            <div className="grid grid-cols-3 gap-3">
              <EditField label="City" value={fields.city} onChange={set("city")} placeholder="Spokane" />
              <EditField label="State" value={fields.state} onChange={set("state")} placeholder="WA" />
              <EditField label="ZIP" value={fields.zip} onChange={set("zip")} placeholder="99201" mono />
            </div>
            <EditField label="Owner Name" value={fields.owner_name} onChange={set("owner_name")} placeholder="John Smith" />
            <div className="grid grid-cols-2 gap-3">
              <EditField label="APN" value={fields.apn} onChange={set("apn")} placeholder="12345-678-9" mono />
              <EditField label="Property Type" value={fields.property_type} onChange={set("property_type")} placeholder="SFR" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <EditField label="Beds" value={fields.bedrooms} onChange={set("bedrooms")} placeholder="3" mono />
              <EditField label="Baths" value={fields.bathrooms} onChange={set("bathrooms")} placeholder="2" mono />
              <EditField label="Sqft" value={fields.sqft} onChange={set("sqft")} placeholder="1500" mono />
              <EditField label="Year Built" value={fields.year_built} onChange={set("year_built")} placeholder="1985" mono />
            </div>
            <EditField label="Lot Size (sqft)" value={fields.lot_size} onChange={set("lot_size")} placeholder="7500" mono />
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Notes</label>
              <textarea
                value={fields.notes}
                onChange={(e) => set("notes")(e.target.value)}
                rows={3}
                placeholder="Add notes about this property..."
                className="w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground
                  placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20
                  transition-all hover:border-white/[0.12] resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-foreground bg-muted/5 border border-border/20 rounded-[10px] px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <p className="text-xs text-muted-foreground/40 font-mono">
              Property: {cf.propertyId.slice(0, 8)}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onClose} className="text-sm h-8 px-4">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="text-sm h-8 px-4 gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20
                  shadow-[0_0_14px_rgba(0,0,0,0.15)] hover:shadow-[0_0_22px_rgba(0,0,0,0.25)] transition-all"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── DeleteConfirmationModal ───────────────────────────────────────────────────

export function DeleteConfirmationModal({
  cf,
  onClose,
  onDeleted,
}: {
  cf: ClientFile;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toLowerCase() === "yes";

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/prospects", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ lead_id: cf.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.detail ?? data.error ?? "Delete failed");
        return;
      }
      toast.success("Customer file permanently deleted");
      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-md w-full mx-4 overflow-hidden rounded-[16px] border border-border/20
            modal-glass flex flex-col"
        >
          {/* Red accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-muted/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-muted/[0.05] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] bg-muted/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Delete Customer File</h3>
                <p className="text-sm text-muted-foreground">Permanent action</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Lead details */}
            <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.06] p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{cf.fullAddress || cf.address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{cf.ownerName || "Unknown Owner"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-sm border-white/[0.08]">
                  {cf.status}
                </Badge>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-muted/[0.06] border border-border/20">
              <AlertTriangle className="h-4 w-4 text-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/90 leading-relaxed">
                <strong>This action is permanent and cannot be undone.</strong>
                <br />
                The lead, property, distress events, scoring records, predictions, and associated deals will be permanently deleted.
              </div>
            </div>

            {/* Type yes input */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Type <span className="text-foreground font-semibold">&quot;yes&quot;</span> to confirm deletion
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type yes to confirm..."
                autoFocus
                className="w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground
                  placeholder:text-muted-foreground/40 focus:outline-none focus:border-border/30 focus:ring-1 focus:ring-ring/20
                  transition-all hover:border-white/[0.12]"
              />
            </div>

            {error && (
              <p className="text-xs text-foreground">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-white/[0.06]">
            <Button size="sm" variant="outline" onClick={onClose} className="text-sm h-8 px-4">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              className="text-sm h-8 px-4 gap-1.5"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── DeepCrawlPanel ────────────────────────────────────────────────────────────

const URGENCY_COLORS: Record<string, string> = {
  CRITICAL: "text-foreground bg-muted/[0.12] border-border/30",
  HIGH: "text-foreground bg-muted/[0.12] border-border/30",
  MEDIUM: "text-foreground bg-muted/[0.12] border-border/30",
  LOW: "text-foreground bg-muted/[0.12] border-border/30",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DeepCrawlPanel({ result, onRecrawl, isRecrawling }: { result: any; onRecrawl?: () => void; isRecrawling?: boolean }) {
  if (!result) return null;

  const ai = result.aiDossier ?? result.ai_dossier ?? {};
  const crawledAt = result.crawledAt ?? result.crawled_at;
  const crawledAgo = crawledAt
    ? (() => {
        const mins = Math.floor((Date.now() - new Date(crawledAt).getTime()) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
      })()
    : null;

  const urgencyColor = URGENCY_COLORS[ai.urgencyLevel] ?? URGENCY_COLORS.MEDIUM;
  const sources = result.sources ?? [];

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
      {/* Executive Summary */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm text-primary/80 uppercase tracking-wider font-semibold">Executive Summary</p>
          {ai.urgencyLevel && (
            <span className={cn("px-2 py-0.5 rounded-full text-sm font-bold border", urgencyColor)}>
              {ai.urgencyLevel}
            </span>
          )}
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">{ai.summary ?? "No summary available"}</p>
        {ai.urgencyReason && (
          <p className="text-sm text-muted-foreground mt-1">{ai.urgencyReason}</p>
        )}
      </div>

      {/* Signal Analysis */}
      {ai.signalAnalysis && ai.signalAnalysis.length > 0 && (
        <div>
          <p className="text-sm text-foreground/80 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />Signal Analysis
          </p>
          <div className="space-y-2">
            {ai.signalAnalysis.map((s: { headline: string; detail: string; daysUntilCritical: number | null; actionableInsight: string }, i: number) => (
              <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-foreground shrink-0" />
                  {s.headline}
                  {s.daysUntilCritical != null && s.daysUntilCritical <= 60 && (
                    <span className="text-sm text-foreground font-mono ml-auto">{s.daysUntilCritical}d</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed pl-5">{s.detail}</p>
                {s.actionableInsight && (
                  <p className="text-xs text-primary/80 pl-5 flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 shrink-0" />{s.actionableInsight}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Owner Profile */}
      {ai.ownerProfile && (
        <div>
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />Owner Profile
          </p>
          <p className="text-xs text-foreground/80 leading-relaxed">{ai.ownerProfile}</p>
        </div>
      )}

      {/* Financial Snapshot */}
      {ai.financialAnalysis && (
        <div>
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />Financial Snapshot
          </p>
          <p className="text-xs text-foreground/80 leading-relaxed">{ai.financialAnalysis}</p>
          {ai.estimatedMAO && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm text-muted-foreground uppercase">Est. MAO:</span>
              <span className="text-sm font-semibold text-foreground">
                ${ai.estimatedMAO.low?.toLocaleString()} &ndash; ${ai.estimatedMAO.high?.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground/60">{ai.estimatedMAO.basis}</span>
            </div>
          )}
        </div>
      )}

      {/* Approach & Talking Points */}
      {ai.suggestedApproach && (
        <div>
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" />Suggested Approach
          </p>
          <p className="text-xs text-foreground/80 leading-relaxed">{ai.suggestedApproach}</p>
          {ai.talkingPoints && ai.talkingPoints.length > 0 && (
            <ul className="mt-2 space-y-1">
              {ai.talkingPoints.map((tp: string, i: number) => (
                <li key={i} className="text-xs text-primary/80 flex items-start gap-1.5">
                  <span className="text-primary/40 mt-0.5 shrink-0">&#8226;</span>{tp}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Web Findings */}
      {ai.webFindings && ai.webFindings.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />Web Findings
          </p>
          <div className="space-y-1.5">
            {ai.webFindings.map((w: { source: string; finding: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Search className="h-3 w-3 text-primary/50 mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold text-foreground/70">{w.source}:</span>{" "}
                  <span className="text-foreground/60">{w.finding}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Red Flags */}
      {ai.redFlags && ai.redFlags.length > 0 && (
        <div>
          <p className="text-sm text-foreground/80 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />Red Flags
          </p>
          <ul className="space-y-1">
            {ai.redFlags.map((flag: string, i: number) => (
              <li key={i} className="text-xs text-foreground/70 flex items-start gap-1.5">
                <span className="text-foreground mt-0.5 shrink-0">&#9679;</span>{flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-sm text-muted-foreground/50">
        <div className="flex items-center gap-2">
          {crawledAgo && <span>Crawled {crawledAgo}</span>}
          {sources.length > 0 && <span>&#183; Sources: {sources.join(", ")}</span>}
        </div>
        {onRecrawl && (
          <button
            onClick={onRecrawl}
            disabled={isRecrawling}
            className="text-sm text-foreground/70 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isRecrawling ? "Re-crawling…" : "↻ Re-crawl"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── DeepSkipPanel ─────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner: "text-primary bg-primary/10 border-primary/30",
  heir: "text-foreground bg-muted/10 border-border/30",
  executor: "text-foreground bg-muted/10 border-border/30",
  attorney: "text-foreground bg-muted/10 border-border/30",
  beneficial_owner: "text-foreground bg-muted/10 border-border/30",
  spouse: "text-foreground bg-muted/10 border-border/30",
  family: "text-foreground bg-muted/10 border-border/30",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DeepSkipPanel({ result }: { result: any }) {
  if (!result || (!result.people?.length && !result.newPhones?.length && !result.newEmails?.length && !result.employmentSignals?.length)) {
    return null;
  }

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-foreground" />
        <p className="text-sm text-foreground/80 uppercase tracking-wider font-semibold">Deep Skip Report – People Intelligence</p>
        {result.agentMeta && (
          <span className="text-sm text-muted-foreground/50 ml-auto">
            {result.agentMeta.agentsSucceeded?.length ?? 0} agents · {result.people?.length ?? 0} people found
          </span>
        )}
      </div>

      {/* People Cards */}
      {result.people && result.people.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">People Found</p>
          <div className="grid gap-2">
            {result.people.map((person: { name: string; role: string; phones: string[]; emails: string[]; notes: string; source: string; confidence: number; address?: string }, i: number) => (
              <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <User className="h-3 w-3 text-foreground/60" />
                  <span className="text-sm font-semibold text-foreground">{person.name}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-xs font-bold border uppercase",
                    ROLE_COLORS[person.role] ?? "text-muted-foreground bg-white/5 border-white/10",
                  )}>
                    {person.role.replace(/_/g, " ")}
                  </span>
                  {person.confidence >= 0.8 && <CheckCircle className="h-3 w-3 text-foreground" />}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-1.5 pl-5">{person.notes}</p>
                <div className="flex flex-wrap gap-3 pl-5 text-sm">
                  {person.phones.map((p: string, j: number) => (
                    <span key={j} className="flex items-center gap-1 text-foreground/80">
                      <Phone className="h-2.5 w-2.5" />{p}
                    </span>
                  ))}
                  {person.emails.map((e: string, j: number) => (
                    <span key={j} className="flex items-center gap-1 text-primary/80">
                      <Mail className="h-2.5 w-2.5" />{e}
                    </span>
                  ))}
                  {person.address && (
                    <span className="flex items-center gap-1 text-muted-foreground/60">
                      <MapPin className="h-2.5 w-2.5" />{person.address}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 pl-5">
                  <span className="text-xs text-muted-foreground/40">via {person.source.replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Contacts Found */}
      {((result.newPhones?.length > 0) || (result.newEmails?.length > 0)) && (
        <div>
          <p className="text-sm text-foreground/80 uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Plus className="h-3 w-3" />New Contacts Discovered
          </p>
          <div className="flex flex-wrap gap-2">
            {(result.newPhones ?? []).map((p: { number: string; source: string; personName?: string }, i: number) => (
              <span key={`p${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-sm font-medium border border-border/20 bg-muted/[0.06] text-foreground">
                <Phone className="h-2.5 w-2.5" />
                {p.number}
                {p.personName && <span className="text-foreground/50">({p.personName})</span>}
                <span className="text-xs px-1 py-0.5 rounded bg-muted/20 text-foreground font-bold">OC</span>
              </span>
            ))}
            {(result.newEmails ?? []).map((e: { email: string; source: string; personName?: string }, i: number) => (
              <span key={`e${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-sm font-medium border border-primary/20 bg-primary/[0.06] text-primary">
                <Mail className="h-2.5 w-2.5" />
                {e.email}
                {e.personName && <span className="text-primary/50">({e.personName})</span>}
                <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary font-bold">OC</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Employment & Relocation Signals */}
      {result.employmentSignals && result.employmentSignals.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Briefcase className="h-3 w-3" />Employment & Relocation Signals
          </p>
          <div className="space-y-1.5">
            {result.employmentSignals.map((s: { signal: string; source: string; date?: string; url?: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <ArrowRight className="h-3 w-3 text-foreground/60 mt-0.5 shrink-0" />
                <span className="text-foreground/70">{s.signal}</span>
                {s.date && <span className="text-muted-foreground/40 text-sm ml-auto shrink-0">{s.date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] text-sm text-muted-foreground/40">
        {result.crawledAt && <span>Generated {new Date(result.crawledAt).toLocaleString()}</span>}
      </div>
    </div>
  );
}

// ── CrawlProgressIndicator ────────────────────────────────────────────────────

export interface CrawlStep {
  phase: string;
  status: "started" | "complete" | "error";
  detail: string;
  elapsed?: number;
}

export function CrawlProgressIndicator({ steps }: { steps: CrawlStep[] }) {
  if (steps.length === 0) return null;

  const phaseLabels: Record<string, string> = {
    data_gathering: "Data Gathering",
    normalization: "Normalizing Data",
    agents: "Research Agents",
    photos: "Property Photos",
    post_processing: "Contact & People Intel",
    grok_synthesis: "AI Synthesis",
    storage: "Saving Results",
    complete: "Complete",
    error: "Error",
  };

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
        <p className="text-sm text-primary/80 uppercase tracking-wider font-semibold">Deep Crawl in Progress</p>
      </div>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const icon = step.status === "complete"
          ? <CheckCircle className="h-3 w-3 text-foreground shrink-0" />
          : step.status === "error"
            ? <XCircle className="h-3 w-3 text-foreground shrink-0" />
            : <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />;

        return (
          <div key={i} className={cn("flex items-center gap-2 text-sm", isLast && step.status === "started" ? "text-foreground" : "text-muted-foreground")}>
            {icon}
            <span className="font-medium">{phaseLabels[step.phase] ?? step.phase}</span>
            <span className="text-muted-foreground/50">{step.detail}</span>
            {step.elapsed != null && (
              <span className="text-xs text-muted-foreground/30 ml-auto font-mono">{(step.elapsed / 1000).toFixed(1)}s</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── LinkedBuyersSummary ───────────────────────────────────────────────────────

export function LinkedBuyersSummary({ leadId }: { leadId: string }) {
  const [dealId, setDealId] = useState<string | null>(null);
  const [contractPrice, setContractPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("deals") as any)
        .select("id, contract_price")
        .eq("lead_id", leadId)
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) {
        setDealId(data.id);
        setContractPrice(data.contract_price);
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const { dealBuyers, loading } = useDealBuyers(dealId);

  if (!dealId || loading) return null;
  if (dealBuyers.length === 0) return null;

  const bestOffer = dealBuyers.reduce((max, db) => {
    if (db.offer_amount != null && (max === null || db.offer_amount > max)) return db.offer_amount;
    return max;
  }, null as number | null);

  const spread = bestOffer != null && contractPrice != null ? bestOffer - contractPrice : null;

  const statusCounts: Record<string, number> = {};
  for (const db of dealBuyers) {
    statusCounts[db.status] = (statusCounts[db.status] || 0) + 1;
  }
  const statusSummary = Object.entries(statusCounts)
    .map(([s, n]) => `${n} ${dealBuyerStatusLabel(s).toLowerCase()}`)
    .join(", ");

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
            Linked Buyers
          </span>
          <Badge variant="outline" className="text-xs">{dealBuyers.length}</Badge>
        </div>
        <Link
          href="/dispo"
          className="text-sm text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
        >
          Disposition <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground/60">{statusSummary}</span>
        {bestOffer != null && (
          <span className="text-muted-foreground/60">
            Best offer: <span className="text-foreground/80 font-medium">${(bestOffer / 1000).toFixed(0)}k</span>
          </span>
        )}
        {spread != null && (
          <span className={cn("font-medium", spread > 0 ? "text-foreground" : spread < 0 ? "text-foreground" : "text-muted-foreground")}>
            Spread: {spread >= 0 ? "+" : ""}${(spread / 1000).toFixed(0)}k
          </span>
        )}
      </div>
    </div>
  );
}
