"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserPlus, MapPin, Phone, Mail, FileText, DollarSign,
  Percent, Home, Loader2, Check, Users, X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSentinelStore } from "@/lib/store";
import { useModal } from "@/providers/modal-provider";
import { cn } from "@/lib/utils";
import { getAuthenticatedProspectPatchHeaders } from "@/lib/prospect-api-client";
import { supabase } from "@/lib/supabase";
import {
  NICHE_TAG_OPTIONS,
  OUTBOUND_STATUS_OPTIONS,
  OUTREACH_TYPE_OPTIONS,
  PROSPECTING_TAG_OPTIONS,
  SKIP_TRACE_STATUS_OPTIONS,
  SOURCE_CHANNEL_OPTIONS,
  sourceChannelLabel,
  tagLabel,
} from "@/lib/prospecting";

// ── Types ──────────────────────────────────────────────────────────────

interface FormData {
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  apn: string;
  county: string;
  estimated_value: string;
  equity_percent: string;
  property_type: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  year_built: string;
  lot_size: string;
  distress_tags: string[];
  notes: string;
  source: string;
  source_channel: string;
  source_vendor: string;
  source_list_name: string;
  source_pull_date: string;
  niche_tag: string;
  import_batch_id: string;
  outreach_type: string;
  skip_trace_status: string;
  outbound_status: string;
}

const EMPTY_FORM: FormData = {
  owner_name: "", phone: "", email: "",
  address: "", city: "Spokane", state: "WA", zip: "",
  apn: "", county: "Spokane",
  estimated_value: "", equity_percent: "",
  property_type: "SFR",
  bedrooms: "", bathrooms: "", sqft: "", year_built: "", lot_size: "",
  distress_tags: [], notes: "", source: "manual",
  source_channel: "manual",
  source_vendor: "",
  source_list_name: "",
  source_pull_date: "",
  niche_tag: "",
  import_batch_id: "",
  outreach_type: "cold_call",
  skip_trace_status: "not_started",
  outbound_status: "new_import",
};

const PROPERTY_TYPES = ["SFR", "Multi-Family", "Condo", "Townhome", "Mobile", "Land", "Commercial"];

type Step = "form" | "confirm";

// ── Field component ────────────────────────────────────────────────────

function Field({
  label, icon: Icon, required, children, className,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────

export function NewProspectModal() {
  const { activeModal, closeModal, modalData } = useModal();
  const { currentUser } = useSentinelStore();
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [step, setStep] = useState<Step>("form");
  const [saving, setSaving] = useState(false);
  const [assignTo, setAssignTo] = useState("unassigned");
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);
  const [assignmentOptions, setAssignmentOptions] = useState<Array<{ id: string; label: string }>>([
    { id: "unassigned", label: "Unassigned (Prospect)" },
  ]);

  const isOpen = activeModal === "new-prospect";

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("user_profiles") as any)
          .select("id, full_name")
          .order("full_name", { ascending: true });
        if (!active) return;
        const options = [
          { id: "unassigned", label: "Unassigned (Prospect)" },
          ...((data as Array<{ id: string; full_name: string | null }> | null | undefined) ?? []).map((row) => ({
            id: row.id,
            label: row.full_name?.trim() || row.id.slice(0, 8),
          })),
        ];
        setAssignmentOptions(options);
      } catch {
        if (active) {
          setAssignmentOptions([{ id: "unassigned", label: "Unassigned (Prospect)" }]);
        }
      }
    })();
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const initial = (modalData.initialValues as Partial<FormData> | undefined) ?? {};
    if (Object.keys(initial).length === 0) return;
    setForm((prev) => ({ ...prev, ...initial }));
    if (typeof modalData.assignTo === "string" && modalData.assignTo.length > 0) {
      setAssignTo(modalData.assignTo);
    }
  }, [isOpen, modalData]);

  const update = useCallback((field: keyof FormData, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setForm((prev) => ({
      ...prev,
      distress_tags: prev.distress_tags.includes(tag)
        ? prev.distress_tags.filter((t) => t !== tag)
        : [...prev.distress_tags, tag],
    }));
  }, []);

  const assignmentLabel = useMemo(
    () => assignmentOptions.find((member) => member.id === assignTo)?.label ?? "selected owner",
    [assignmentOptions, assignTo],
  );

  const canSubmit = form.address.trim().length > 0 && form.county.trim().length > 0;

  const handleClose = useCallback(() => {
    setForm({ ...EMPTY_FORM });
    setStep("form");
    setSaving(false);
    setAssignTo("unassigned");
    setCreatedLeadId(null);
    closeModal();
  }, [closeModal]);

  // ── Save to Supabase ─────────────────────────────────────────────────

  const handleSave = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);

    try {
      const payload = {
        apn: form.apn,
        county: form.county,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        owner_name: form.owner_name,
        owner_phone: form.phone,
        owner_email: form.email,
        estimated_value: form.estimated_value,
        equity_percent: form.equity_percent,
        property_type: form.property_type,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        sqft: form.sqft,
        year_built: form.year_built,
        lot_size: form.lot_size,
        distress_tags: form.distress_tags,
        notes: form.notes,
        source: form.source_channel,
        source_channel: form.source_channel,
        source_vendor: form.source_vendor,
        source_list_name: form.source_list_name,
        source_pull_date: form.source_pull_date,
        niche_tag: form.niche_tag,
        import_batch_id: form.import_batch_id,
        outreach_type: form.outreach_type,
        skip_trace_status: form.skip_trace_status,
        outbound_status: form.outbound_status,
        assign_to: assignTo === "unassigned" ? null : assignTo,
        actor_id: currentUser.id || null,
      };

      console.log("[NewProspect] Sending POST /api/prospects:", payload);

      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("[NewProspect] Response status:", res.status, res.statusText);

      const rawText = await res.text();
      console.log("[NewProspect] Raw response body:", rawText.slice(0, 2000));

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText);
      } catch {
        console.error("[NewProspect] Response is NOT JSON:", rawText.slice(0, 500));
        toast.error(`Server returned non-JSON (HTTP ${res.status})`, {
          description: rawText.slice(0, 200),
        });
        setSaving(false);
        return;
      }

      if (!res.ok || !data.success) {
        console.error("[NewProspect] API error:", {
          httpStatus: res.status,
          body: data,
          error: data.error,
          detail: data.detail,
        });
        toast.error("Failed to save: " + (data.error ?? `HTTP ${res.status}`), {
          description: (data.detail as string) ?? undefined,
        });
        setSaving(false);
        return;
      }

      setCreatedLeadId(data.lead_id as string);
      setStep("confirm");
      toast.success(
        assignTo !== "unassigned"
          ? `Lead created and assigned to ${assignmentLabel}`
          : "Lead created in pipeline",
        { description: `${form.address} — Score ${data.score}` }
      );
    } catch (err) {
      console.error("[NewProspect] Network error:", err);
      toast.error("Network error — check console");
    } finally {
      setSaving(false);
    }
  };

  // ── Claim after creation ─────────────────────────────────────────────

  const handleClaimAfter = async () => {
    if (!createdLeadId || !currentUser.id) return;
    setSaving(true);

    try {
      const headers = await getAuthenticatedProspectPatchHeaders();
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          lead_id: createdLeadId,
          status: "lead",
          assigned_to: currentUser.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error("Claim failed: " + (data.error ?? "Unknown error"));
      } else {
        toast.success("Claimed - assigned to you. Check Pipeline > My Leads segment.");
      }
    } catch (err) {
      console.error("[NewProspect] Claim error:", err);
      toast.error("Network error during claim");
    }

    setSaving(false);
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-cyan" />
            {step === "form" ? "Add New Lead" : "Lead Created"}
          </DialogTitle>
          <DialogDescription>
            {step === "form"
              ? "Fill in the property and owner details. Tab through fields. Required fields are marked."
              : "Your lead has been saved. Claim it or close to leave in the pipeline."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 pr-1">
        <AnimatePresence mode="wait">
          {step === "form" ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5 py-2"
            >
              {/* ── Section: Property Address ─────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan/70 mb-3">
                  Property Address
                </p>
                <div className="space-y-3">
                  <Field label="Street Address" icon={MapPin} required>
                    <Input
                      placeholder="1423 Oak Valley Dr"
                      value={form.address}
                      onChange={(e) => update("address", e.target.value)}
                      autoFocus
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="City">
                      <Input
                        placeholder="Spokane"
                        value={form.city}
                        onChange={(e) => update("city", e.target.value)}
                      />
                    </Field>
                    <Field label="State">
                      <Input
                        placeholder="WA"
                        maxLength={2}
                        value={form.state}
                        onChange={(e) => update("state", e.target.value)}
                      />
                    </Field>
                    <Field label="ZIP">
                      <Input
                        placeholder="85001"
                        maxLength={10}
                        value={form.zip}
                        onChange={(e) => update("zip", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="APN" icon={FileText}>
                      <Input
                        placeholder="000-00-000 (auto-generated if blank)"
                        value={form.apn}
                        onChange={(e) => update("apn", e.target.value)}
                      />
                    </Field>
                    <Field label="County" required>
                      <Input
                        placeholder="Spokane"
                        value={form.county}
                        onChange={(e) => update("county", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              {/* ── Section: Owner Info ───────────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan/70 mb-3">
                  Owner Information
                </p>
                <div className="space-y-3">
                  <Field label="Owner Name" icon={UserPlus}>
                    <Input
                      placeholder="Full name"
                      value={form.owner_name}
                      onChange={(e) => update("owner_name", e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone" icon={Phone}>
                      <Input
                        placeholder="(555) 000-0000"
                        value={form.phone}
                        onChange={(e) => update("phone", e.target.value)}
                      />
                    </Field>
                    <Field label="Email" icon={Mail}>
                      <Input
                        type="email"
                        placeholder="owner@email.com"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              {/* ── Section: Property Details ─────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan/70 mb-3">
                  Property Details
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="ARV / Estimated Value" icon={DollarSign}>
                      <Input
                        type="number"
                        placeholder="285000"
                        value={form.estimated_value}
                        onChange={(e) => update("estimated_value", e.target.value)}
                      />
                    </Field>
                    <Field label="Equity %" icon={Percent}>
                      <Input
                        type="number"
                        placeholder="42"
                        min={0}
                        max={100}
                        value={form.equity_percent}
                        onChange={(e) => update("equity_percent", e.target.value)}
                      />
                    </Field>
                    <Field label="Property Type" icon={Home}>
                      <select
                        value={form.property_type}
                        onChange={(e) => update("property_type", e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan/40"
                      >
                        {PROPERTY_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    <Field label="Beds">
                      <Input
                        type="number"
                        placeholder="3"
                        value={form.bedrooms}
                        onChange={(e) => update("bedrooms", e.target.value)}
                      />
                    </Field>
                    <Field label="Baths">
                      <Input
                        type="number"
                        placeholder="2"
                        step="0.5"
                        value={form.bathrooms}
                        onChange={(e) => update("bathrooms", e.target.value)}
                      />
                    </Field>
                    <Field label="Sqft">
                      <Input
                        type="number"
                        placeholder="1800"
                        value={form.sqft}
                        onChange={(e) => update("sqft", e.target.value)}
                      />
                    </Field>
                    <Field label="Year Built">
                      <Input
                        type="number"
                        placeholder="1998"
                        value={form.year_built}
                        onChange={(e) => update("year_built", e.target.value)}
                      />
                    </Field>
                    <Field label="Lot (acres)">
                      <Input
                        type="number"
                        placeholder="0.25"
                        step="0.01"
                        value={form.lot_size}
                        onChange={(e) => update("lot_size", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              {/* ── Section: Distress Signals ─────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan/70 mb-3">
                  Prospecting Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PROSPECTING_TAG_OPTIONS.map((tag) => {
                    const active = form.distress_tags.includes(tag);
                    return (
                      <motion.button
                        key={tag}
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleTag(tag)}
                      >
                        <Badge
                          variant={active ? "neon" : "outline"}
                          className={cn(
                            "cursor-pointer transition-colors",
                            active
                              ? "bg-cyan/15 text-cyan border-cyan/20"
                              : "hover:bg-cyan/8 hover:border-cyan/15 hover:text-cyan"
                          )}
                        >
                          {active && <Check className="h-2.5 w-2.5 mr-1" />}
                          {tagLabel(tag)}
                        </Badge>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* ── Section: Assignment ───────────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan/70 mb-3">
                  Prospecting Intake
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Source Channel">
                      <select
                        value={form.source_channel}
                        onChange={(e) => update("source_channel", e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan/40"
                      >
                        {SOURCE_CHANNEL_OPTIONS.map((option) => (
                          <option key={option} value={option}>{sourceChannelLabel(option)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Vendor / Data Source">
                      <Input
                        placeholder="PropertyRadar, county export, skip trace vendor..."
                        value={form.source_vendor}
                        onChange={(e) => update("source_vendor", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="List Name">
                      <Input
                        placeholder="Spokane probate March pull"
                        value={form.source_list_name}
                        onChange={(e) => update("source_list_name", e.target.value)}
                      />
                    </Field>
                    <Field label="Pull Date">
                      <Input
                        type="date"
                        value={form.source_pull_date}
                        onChange={(e) => update("source_pull_date", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Niche Tag">
                      <select
                        value={form.niche_tag}
                        onChange={(e) => update("niche_tag", e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan/40"
                      >
                        <option value="">None</option>
                        {NICHE_TAG_OPTIONS.map((option) => (
                          <option key={option} value={option}>{tagLabel(option)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Import Batch ID">
                      <Input
                        placeholder="2026-03-11-spokane-probate"
                        value={form.import_batch_id}
                        onChange={(e) => update("import_batch_id", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Outreach Type">
                      <select
                        value={form.outreach_type}
                        onChange={(e) => update("outreach_type", e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan/40"
                      >
                        {OUTREACH_TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{tagLabel(option)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Skip Trace Status">
                      <select
                        value={form.skip_trace_status}
                        onChange={(e) => update("skip_trace_status", e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan/40"
                      >
                        {SKIP_TRACE_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>{tagLabel(option)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Outbound Status">
                      <select
                        value={form.outbound_status}
                        onChange={(e) => update("outbound_status", e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan/40"
                      >
                        {OUTBOUND_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>{tagLabel(option)}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan/70 mb-3">
                  Assignment
                </p>
                <div className="flex flex-wrap gap-2">
                  {assignmentOptions.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setAssignTo(member.id)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-[12px] border transition-all flex items-center gap-1.5",
                        assignTo === member.id
                          ? "text-cyan border-cyan/20 bg-cyan/8"
                          : "text-muted-foreground border-glass-border hover:border-white/20 hover:text-foreground"
                      )}
                    >
                      <Users className="h-3 w-3" />
                      {member.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Section: Notes ────────────────────────── */}
              <Field label="Notes">
                <textarea
                  placeholder="Any additional info about this lead..."
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan/40 resize-none"
                />
              </Field>

              {/* ── Footer buttons ────────────────────────── */}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                <Button variant="outline" onClick={handleClose} className="gap-2">
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !canSubmit}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {saving ? "Saving..." : "Save Lead"}
                </Button>
              </div>
            </motion.div>
          ) : (
            /* ── Confirmation step ────────────────────── */
            <motion.div
              key="confirm"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6 space-y-5"
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-14 w-14 rounded-2xl bg-cyan/8 flex items-center justify-center border border-cyan/15">
                  <Check className="h-7 w-7 text-cyan" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {form.address}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.owner_name || "No owner name"} • {form.city} {form.state} {form.zip}
                  </p>
                  {form.distress_tags.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1 mt-2">
                      {form.distress_tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-[9px]">
                          {tagLabel(t)}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 mt-2">
                    {sourceChannelLabel(form.source_channel)}
                    {form.niche_tag ? ` • ${tagLabel(form.niche_tag)}` : ""}
                    {form.import_batch_id ? ` • Batch ${form.import_batch_id}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" onClick={handleClose}>
                  Done
                </Button>
                {assignTo === "unassigned" && (
                  <Button
                    onClick={handleClaimAfter}
                    disabled={saving}
                    className="gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Claim This Lead
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

