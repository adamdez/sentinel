"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface IntakeLead {
  id: string;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  county: string | null;
  apn: string | null;
  review_notes: string | null;
}

interface IntakeEditModalProps {
  lead: IntakeLead;
  onClose: () => void;
  onSuccess: () => void;
}

export function IntakeEditModal({
  lead,
  onClose,
  onSuccess,
}: IntakeEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    owner_name: lead.owner_name || "",
    owner_phone: lead.owner_phone || "",
    owner_email: lead.owner_email || "",
    property_address: lead.property_address || "",
    property_city: lead.property_city || "",
    property_state: lead.property_state || "WA",
    property_zip: lead.property_zip || "",
    county: lead.county || "",
    apn: lead.apn || "",
    review_notes: lead.review_notes || "",
  });

  useEffect(() => {
    setFormData({
      owner_name: lead.owner_name || "",
      owner_phone: lead.owner_phone || "",
      owner_email: lead.owner_email || "",
      property_address: lead.property_address || "",
      property_city: lead.property_city || "",
      property_state: lead.property_state || "WA",
      property_zip: lead.property_zip || "",
      county: lead.county || "",
      apn: lead.apn || "",
      review_notes: lead.review_notes || "",
    });
  }, [lead]);

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch("/api/intake/queue", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          intake_lead_id: lead.id,
          ...formData,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to update intake lead");
      }

      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[IntakeEditModal] Update failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !loading) onClose();
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Intake Lead</DialogTitle>
          <DialogDescription>
            Update the PPL lead details before claiming it into Sentinel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {error ? (
            <div className="rounded-[12px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Owner Name</label>
              <Input
                value={formData.owner_name}
                onChange={(event) => setFormData((current) => ({ ...current, owner_name: event.target.value }))}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Phone</label>
              <Input
                value={formData.owner_phone}
                onChange={(event) => setFormData((current) => ({ ...current, owner_phone: event.target.value }))}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                value={formData.owner_email}
                onChange={(event) => setFormData((current) => ({ ...current, owner_email: event.target.value }))}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">County</label>
              <Input
                value={formData.county}
                onChange={(event) => setFormData((current) => ({ ...current, county: event.target.value }))}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">Property Address</label>
            <Input
              value={formData.property_address}
              onChange={(event) => setFormData((current) => ({ ...current, property_address: event.target.value }))}
              disabled={loading}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">City</label>
              <Input
                value={formData.property_city}
                onChange={(event) => setFormData((current) => ({ ...current, property_city: event.target.value }))}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">State</label>
              <Input
                maxLength={2}
                value={formData.property_state}
                onChange={(event) => setFormData((current) => ({ ...current, property_state: event.target.value.toUpperCase() }))}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Zip</label>
              <Input
                value={formData.property_zip}
                onChange={(event) => setFormData((current) => ({ ...current, property_zip: event.target.value }))}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">APN</label>
              <Input
                value={formData.apn}
                onChange={(event) => setFormData((current) => ({ ...current, apn: event.target.value }))}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Notes</label>
              <Textarea
                value={formData.review_notes}
                onChange={(event) => setFormData((current) => ({ ...current, review_notes: event.target.value }))}
                disabled={loading}
                className="min-h-[92px]"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
