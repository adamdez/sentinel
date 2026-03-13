/**
 * Sync log tracking for ads_sync_logs.
 * Every sync run is logged with status, counts, timing, and error info.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export async function startSyncLog(
  supabase: SupabaseClient,
  syncType: string,
  dateRangeStart: string,
  dateRangeEnd: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("ads_sync_logs")
    .insert({
      sync_type: syncType,
      status: "running",
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`startSyncLog failed: ${error.message}`);
  return data.id;
}

export async function completeSyncLog(
  supabase: SupabaseClient,
  logId: number,
  result: {
    records_fetched: number;
    records_upserted: number;
    duration_ms: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from("ads_sync_logs")
    .update({
      status: "completed",
      records_fetched: result.records_fetched,
      records_upserted: result.records_upserted,
      duration_ms: result.duration_ms,
      completed_at: new Date().toISOString(),
    })
    .eq("id", logId);
  if (error) throw new Error(`completeSyncLog failed: ${error.message}`);
}

export async function failSyncLog(
  supabase: SupabaseClient,
  logId: number,
  errorMessage: string,
  durationMs: number,
): Promise<void> {
  const { error } = await supabase
    .from("ads_sync_logs")
    .update({
      status: "failed",
      error_message: errorMessage.slice(0, 1000),
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq("id", logId);
  if (error) console.error("[SyncLog] Failed to update log:", error.message);
}

/**
 * Check if a sync is currently running (prevents concurrent syncs).
 */
export async function isSyncRunning(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("ads_sync_logs")
    .select("id")
    .eq("status", "running")
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
