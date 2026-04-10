// Shared contact types used by ContactTab and OverviewTab.
// Extracted from master-client-file-modal.tsx.

export interface PhoneDetail {
  number: string;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  confidence: number;
  dnc: boolean;
  carrier?: string;
  source: "propertyradar" | "batchdata" | `openclaw_${string}` | string;
}

export interface EmailDetail {
  email: string;
  deliverable: boolean;
  source: "propertyradar" | "batchdata" | `openclaw_${string}` | string;
}

export interface SkipTraceOverlay {
  phones: string[];
  emails: string[];
  persons: Record<string, unknown>[];
  primaryPhone: string | null;
  primaryEmail: string | null;
  phoneDetails: PhoneDetail[];
  emailDetails: EmailDetail[];
  providers: string[];
  isLitigator: boolean;
  hasDncNumbers: boolean;
}

export interface SkipTraceError {
  error: string;
  reason?: string;
  suggestion?: string;
  tier_reached?: string;
  address_issues?: string[];
}

export interface RelatedContactAttachment {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  kind: "image" | "file";
  created_at: string;
}

export interface RelatedContactAttachmentView extends RelatedContactAttachment {
  signed_url?: string | null;
}

export interface RelatedContact {
  id: string;
  name: string;
  relation: string;
  phone: string | null;
  email: string | null;
  note: string;
  source: "manual" | string;
  attachments: RelatedContactAttachment[];
  created_at: string;
  updated_at: string;
}
