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
import { supabase } from "@/lib/supabase";
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
      const apn = form.apn.trim() || `MANUAL-${Date.now()}`;
      const county = form.county.trim().toLowerCase();

      // Step 1: Upsert property
      const toInt = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
      const toFloat = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: property, error: propErr } = await (supabase.from("properties") as any)
        .upsert({
          apn,
          county,
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim().toUpperCase(),
          zip: form.zip.trim(),
          owner_name: form.owner_name.trim() || null,
          owner_phone: form.phone.trim() || null,
          owner_email: form.email.trim() || null,
          estimated_value: toInt(form.estimated_value),
          equity_percent: toFloat(form.equity_percent),
          property_type: form.property_type || null,
          bedrooms: toInt(form.bedrooms),
          bathrooms: toFloat(form.bathrooms),
          sqft: toInt(form.sqft),
          year_built: toInt(form.year_built),
          lot_size: toFloat(form.lot_size),
          owner_flags: { manual_entry: true },
          updated_at: new Date().toISOString(),
        }, { onConflict: "apn,county" })
        .select("id")
        .single();

      if (propErr || !property) {
        console.error("[NewProspect] Property upsert failed:", propErr);
        toast.error("Failed to save property: " + (propErr?.message ?? "Unknown error"));
        setSaving(false);
        return;
      }

      // Step 2: Compute simple score from distress tags
      const baseScore = Math.min(30 + form.distress_tags.length * 12, 100);
      const equityBonus = toFloat(form.equity_percent) ?? 0;
      const compositeScore = Math.min(Math.round(baseScore + equityBonus * 0.2), 100);

      // Step 3: Determine status and assignment
      const isAssigned = assignTo !== "unassigned";
      const assignedMember = TEAM_MEMBERS.find((m) => m.id === assignTo);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadInsert: any = {
        property_id: property.id,
        status: isAssigned ? "my_lead" : "prospect",
        priority: compositeScore,
        source: "manual",
        tags: form.distress_tags,
        notes: form.notes.trim() || `Manually added prospect`,
        promoted_at: new Date().toISOString(),
      };

      if (isAssigned) {
        leadInsert.assigned_to = currentUser.id;
        leadInsert.claimed_at = new Date().toISOString();
        leadInsert.claim_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lead, error: leadErr } = await (supabase.from("leads") as any)
        .insert(leadInsert)
        .select("id")
        .single();

      if (leadErr || !lead) {
        console.error("[NewProspect] Lead insert failed:", leadErr);
        toast.error("Failed to create lead: " + (leadErr?.message ?? "Unknown error"));
        setSaving(false);
        return;
      }

      // Step 4: Audit log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("event_log") as any).insert({
        entity_type: "lead",
        entity_id: lead.id,
        action: "CREATED",
        actor_id: currentUser.id || null,
        details: {
          source: "manual",
          address: form.address,
          owner: form.owner_name,
          score: compositeScore,
          assigned_to: assignedMember?.label ?? "unassigned",
        },
      });

      setCreatedLeadId(lead.id);
      setStep("confirm");
      toast.success(
        isAssigned
          ? `Prospect created and assigned to ${assignedMember?.label}`
          : "Prospect created in pipeline",
        { description: `${form.address} — Score ${compositeScore}` }
      );
    } catch (err) {
      console.error("[NewProspect] Unexpected error:", err);
      toast.error("Unexpected error — check console");
    } finally {
      setSaving(false);
    }
  };

  // ── Claim after creation ─────────────────────────────────────────────

  const handleClaimAfter = async () => {
    if (!createdLeadId || !currentUser.id) return;
    setSaving(true);

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("leads") as any)
      .update({
        status: "my_lead",
        assigned_to: currentUser.id,
        claimed_at: new Date().toISOString(),
        claim_expires_at: expires,
      })
      .eq("id", createdLeadId);

    if (error) {
      toast.error("Claim failed: " + error.message);
    } else {
      toast.success("Claimed — moved to My Leads");
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
                              ? "bg-neon/20 text-neon border-neon/40"
                              : "hover:bg-neon/10 hover:border-neon/30 hover:text-neon"
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
                        "text-xs px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5",
                        assignTo === member.id
                          ? "text-neon border-neon/40 bg-neon/10"
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
                  placeholder="Any additional info about this prospect..."
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon/40 resize-none"
                />
              </Field>

              {/* ── Footer buttons ────────────────────────── */}
              <div className="flex items-center justify-between pt-2 border-t border-glass-border">
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
                <div className="h-14 w-14 rounded-2xl bg-neon/10 flex items-center justify-center border border-neon/20">
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
                    Claim This Lead
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
