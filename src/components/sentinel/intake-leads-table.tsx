"use client";

import { Phone, MapPin, Calendar, AlertCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  received_at: string;
  status: "pending_review" | "claimed" | "rejected" | "duplicate";
  duplicate_of_lead_id: string | null;
  duplicate_confidence: number | null;
  review_notes: string | null;
}

interface IntakeLeadsTableProps {
  leads: IntakeLead[];
  onClaim: (lead: IntakeLead) => void;
  onEdit: (lead: IntakeLead) => void;
  onDelete: (lead: IntakeLead) => void;
  isLoading?: boolean;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function IntakeLeadsTable({
  leads,
  onClaim,
  onEdit,
  onDelete,
  isLoading,
}: IntakeLeadsTableProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 p-4 bg-muted border-b border-border font-semibold text-sm text-foreground">
        <div className="col-span-2">Owner</div>
        <div className="col-span-2">Phone</div>
        <div className="col-span-3">Property Address</div>
        <div className="col-span-2">Source</div>
        <div className="col-span-1">Received</div>
        <div className="col-span-2">Actions</div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-border">
        {leads.map((lead) => (
          <div
            key={lead.id}
            className="grid grid-cols-12 gap-4 p-4 hover:bg-muted/50 transition-colors items-center"
          >
            {/* Owner Name */}
            <div className="col-span-2">
              <p className="font-medium text-foreground truncate">
                {lead.owner_name || "Unknown"}
              </p>
              {lead.owner_email && (
                <p className="text-xs text-muted-foreground truncate">
                  {lead.owner_email}
                </p>
              )}
            </div>

            {/* Phone */}
            <div className="col-span-2">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-mono">
                  {formatPhone(lead.owner_phone)}
                </span>
              </div>
            </div>

            {/* Property Address */}
            <div className="col-span-3">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="text-sm truncate">
                  <p className="font-medium text-foreground truncate">
                    {lead.property_address || "—"}
                  </p>
                  {lead.property_city && (
                    <p className="text-xs text-muted-foreground">
                      {lead.property_city}, {lead.property_state}{" "}
                      {lead.property_state && ""}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Source Category */}
            <div className="col-span-2">
              <div className="flex items-center gap-2">
                {lead.duplicate_confidence && lead.duplicate_confidence > 60 ? (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                ) : null}
                <span className="text-sm font-medium text-foreground">
                  {lead.source_category || "Unknown"}
                </span>
              </div>
              {lead.duplicate_confidence && lead.duplicate_confidence > 60 && (
                <p className="text-xs text-amber-600 mt-1">
                  Possible duplicate ({lead.duplicate_confidence}%)
                </p>
              )}
            </div>

            {/* Received Date */}
            <div className="col-span-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                {formatDate(lead.received_at)}
              </div>
            </div>

            {/* Actions */}
            <div className="col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEdit(lead)}
                disabled={isLoading}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDelete(lead)}
                disabled={isLoading}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
              <Button
                type="button"
                onClick={() => onClaim(lead)}
                disabled={isLoading}
              >
                Claim
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
