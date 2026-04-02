import type { LeadRow } from "@/lib/leads-data";

export interface LeadQueueResponse {
  leads: LeadRow[];
  fetchedAt: string;
  total: number;
}

export interface BulkDeleteFailure {
  leadId: string;
  error: string;
}

export type DeleteLeadBatchResult =
  | {
      ok: true;
      deletedLeadIds: string[];
      skippedLeadIds: string[];
      deletedProperties: number;
      failed: BulkDeleteFailure[];
    }
  | {
      ok: false;
      status: number;
      error: string;
    };
