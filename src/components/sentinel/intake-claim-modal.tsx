"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
  source_channel: string;
  source_vendor: string | null;
  source_category: string | null;
  status: "pending_review" | "claimed" | "rejected" | "duplicate";
  received_at: string;
  duplicate_of_lead_id: string | null;
  duplicate_confidence: number | null;
  review_notes: string | null;
}

interface Provider {
  id: string;
  name: string;
  description?: string;
}

interface IntakeClaimModalProps {
  lead: IntakeLead;
  onClose: () => void;
  onSuccess: () => void;
  onDelete: (lead: IntakeLead) => Promise<void> | void;
}

export function IntakeClaimModal({
  lead,
  onClose,
  onSuccess,
  onDelete,
}: IntakeClaimModalProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [assignToLogan, setAssignToLogan] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Form state - allow editing
  const [formData, setFormData] = useState({
    owner_name: lead.owner_name || "",
    owner_phone: lead.owner_phone || "",
    property_address: lead.property_address || "",
    property_city: lead.property_city || "",
    property_state: lead.property_state || "WA",
    property_zip: lead.property_zip || "",
    apn: lead.apn || "",
    county: lead.county || "",
  });

  // Fetch providers
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setLoadingProviders(true);
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }
        const response = await fetch("/api/intake/providers", { headers });
        if (response.ok) {
          const data = await response.json();
          setProviders(data.providers || []);
          if (data.providers && data.providers.length > 0) {
            setSelectedProviderId(data.providers[0].id);
          }
        }
      } catch (err) {
        console.error("[ClaimModal] Failed to fetch providers:", err);
        setError("Failed to load providers");
      } finally {
        setLoadingProviders(false);
      }
    };

    fetchProviders();
  }, []);

  const handleClaim = async () => {
    if (!selectedProviderId) {
      setError("Please select a provider");
      return;
    }

    // Accept incomplete data — operators can fill in missing info later
    // Phone and property address are optional

    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/intake/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          intake_lead_id: lead.id,
          provider_id: selectedProviderId,
          owner_name: formData.owner_name,
          owner_phone: formData.owner_phone,
          property_address: formData.property_address,
          property_city: formData.property_city,
          property_state: formData.property_state,
          property_zip: formData.property_zip,
          apn: formData.apn,
          county: formData.county,
          assign_to: assignToLogan ? "logan-id-placeholder" : null,
          notes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to claim lead");
      }

      const data = await response.json();
      console.log("[ClaimModal] Lead claimed successfully:", data);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[ClaimModal] Claim error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Get auth token from Supabase
  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setError(null);
      await onDelete(lead);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  const isDuplicate =
    lead.duplicate_confidence && lead.duplicate_confidence > 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card">
          <div>
            <h2 className="text-xl font-bold text-foreground">Claim Lead</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {lead.owner_name || "Unknown"} — {lead.property_address || "Unknown"}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading || deleting}
            className="p-1 rounded hover:bg-muted disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Duplicate Warning */}
          {isDuplicate && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">Possible Duplicate</p>
                <p className="text-sm text-amber-800 mt-1">
                  This lead appears similar to an existing lead with{" "}
                  {lead.duplicate_confidence}% confidence. Review carefully.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Provider *
            </label>
            <select
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              disabled={loadingProviders || loading || deleting}
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
            >
              <option value="">Select a provider...</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Select which PPL partner this lead came from
            </p>
          </div>

          {/* Owner Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Owner Name
              </label>
              <input
                type="text"
                value={formData.owner_name}
                onChange={(e) =>
                  setFormData({ ...formData, owner_name: e.target.value })
                }
                disabled={loading || deleting}
                className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Phone (optional)
              </label>
              <input
                type="tel"
                value={formData.owner_phone}
                onChange={(e) =>
                  setFormData({ ...formData, owner_phone: e.target.value })
                }
                disabled={loading || deleting}
                className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
              />
            </div>
          </div>

          {/* Property Information */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Property Address (optional)
            </label>
            <input
              type="text"
              value={formData.property_address}
              onChange={(e) =>
                setFormData({ ...formData, property_address: e.target.value })
              }
              disabled={loading || deleting}
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                City
              </label>
              <input
                type="text"
                value={formData.property_city}
                onChange={(e) =>
                  setFormData({ ...formData, property_city: e.target.value })
                }
                disabled={loading || deleting}
                className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                State
              </label>
              <input
                type="text"
                maxLength={2}
                value={formData.property_state}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    property_state: e.target.value.toUpperCase(),
                  })
                }
                disabled={loading || deleting}
                className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Zip
              </label>
              <input
                type="text"
                value={formData.property_zip}
                onChange={(e) =>
                  setFormData({ ...formData, property_zip: e.target.value })
                }
                disabled={loading || deleting}
                className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                County
              </label>
              <input
                type="text"
                value={formData.county}
                onChange={(e) =>
                  setFormData({ ...formData, county: e.target.value })
                }
                disabled={loading || deleting}
                className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                APN
              </label>
              <input
                type="text"
                value={formData.apn}
                onChange={(e) =>
                  setFormData({ ...formData, apn: e.target.value })
                }
                disabled={loading || deleting}
                className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
              />
            </div>
          </div>

          {/* Assign to Logan */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="assignToLogan"
              checked={assignToLogan}
              onChange={(e) => setAssignToLogan(e.target.checked)}
              disabled={loading || deleting}
              className="w-4 h-4 rounded border-border"
            />
            <label
              htmlFor="assignToLogan"
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              Assign to Logan (optional)
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Operator Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading || deleting}
              placeholder="Add any notes about this lead..."
              rows={3}
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
          <button
            onClick={handleDelete}
            disabled={loading || deleting}
            className="mr-auto px-4 py-2 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
          >
            {deleting ? "Deleting..." : "Delete Lead"}
          </button>
          <button
            onClick={onClose}
            disabled={loading || deleting}
            className="px-4 py-2 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleClaim}
            disabled={loading || deleting || !selectedProviderId}
            className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
          >
            {loading ? "Claiming..." : "Claim Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
