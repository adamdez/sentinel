"use client";

import { useCallback, useState } from "react";
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
}

const EMPTY_FORM: FormData = {
  owner_name: "", phone: "", email: "",
  address: "", city: "", state: "", zip: "",
  apn: "", county: "",
  estimated_value: "", equity_percent: "",
  property_type: "SFR",
  bedrooms: "", bathrooms: "", sqft: "", year_built: "", lot_size: "",
  distress_tags: [], notes: "", source: "manual",
};

const DISTRESS_OPTIONS = [
  "probate", "pre_foreclosure", "tax_lien", "code_violation",
  "vacant", "divorce", "bankruptcy", "fsbo", "absentee", "inherited",
];

const DISTRESS_LABELS: Record<string, string> = {
  probate: "Probate", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee", inherited: "Inherited",
};

const PROPERTY_TYPES = ["SFR", "Multi-Family", "Condo", "Townhome", "Mobile", "Land", "Commercial"];

const TEAM_MEMBERS = [
  { id: "unassigned", label: "Unassigned (Prospect)" },
  { id: "adam", label: "Adam D.", email: "adam@dominionhomedeals.com" },
  { id: "nathan", label: "Nathan J.", email: "nathan@dominionhomedeals.com" },
  { id: "logan", label: "Logan D.", email: "logan@dominionhomedeals.com" },
];

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
  const { activeModal, closeModal } = useModal();
  const { currentUser } = useSentinelStore();
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [step, setStep] = useState<Step>("form");
  const [saving, setSaving] = useState(false);
  const [assignTo, setAssignTo] = useState("unassigned");
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);

  const isOpen = activeModal === "new-prospect";

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
    if (!canSubmit) return;
    setSaving(true);

    try {
      const assignedMember = TEAM_MEMBERS.find((m) => m.id === assignTo);

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
        source: "manual",
        assign_to: assignTo === "unassigned" ? null : currentUser.id,
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
          ? `Prospect created and assigned to ${assignedMember?.label}`
          : "Prospect created in pipeline",
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
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: createdLeadId,
          status: "my_lead",
          assigned_to: currentUser.id,
          actor_id: currentUser.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error("Claim failed: " + (data.error ?? "Unknown error"));
      } else {
        toast.success("Claimed — moved to My Leads. Check Pipeline to see it.");
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
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-neon" />
            {step === "form" ? "Add New Prospect" : "Prospect Created"}
          </DialogTitle>
          <DialogDescription>
            {step === "form"
              ? "Fill in the property and owner details. Tab through fields. Required fields are marked."
              : "Your prospect has been saved. Claim it or close to leave in the pipeline."}
          </DialogDescription>
        </DialogHeader>

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
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neon/70 mb-3">
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
                        placeholder="Phoenix"
                        value={form.city}
                        onChange={(e) => update("city", e.target.value)}
                      />
                    </Field>
                    <Field label="State">
                      <Input
                        placeholder="AZ"
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
                        placeholder="Maricopa"
                        value={form.county}
                        onChange={(e) => update("county", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              {/* ── Section: Owner Info ───────────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neon/70 mb-3">
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
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neon/70 mb-3">
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
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-neon/40"
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
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neon/70 mb-3">
                  Distress Signals
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DISTRESS_OPTIONS.map((tag) => {
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
                              ? "bg-cyan/[0.08] text-neon border-cyan/20"
                              : "hover:bg-cyan/[0.08] hover:border-cyan/20 hover:text-neon"
                          )}
                        >
                          {active && <Check className="h-2.5 w-2.5 mr-1" />}
                          {DISTRESS_LABELS[tag]}
                        </Badge>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* ── Section: Assignment ───────────────────── */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neon/70 mb-3">
                  Assignment
                </p>
                <div className="flex flex-wrap gap-2">
                  {TEAM_MEMBERS.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setAssignTo(member.id)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-[10px] border transition-all flex items-center gap-1.5",
                        assignTo === member.id
                          ? "text-neon border-cyan/20 bg-cyan/[0.08]"
                          : "text-muted-foreground border-white/[0.06] hover:border-white/20 hover:text-foreground"
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
                  placeholder="Any additional info about this prospect..."
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon/40 resize-none"
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
                  {saving ? "Saving..." : "Save Prospect"}
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
                <div className="h-14 w-14 rounded-2xl bg-cyan/[0.08] flex items-center justify-center border border-cyan/15">
                  <Check className="h-7 w-7 text-neon" />
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
                          {DISTRESS_LABELS[t]}
                        </Badge>
                      ))}
                    </div>
                  )}
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
                    Claim This Prospect
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
