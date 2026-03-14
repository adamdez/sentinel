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
