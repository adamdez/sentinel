/**
 * Cron run tracking helpers
 *
 * Wraps every cron execution in start/complete/fail lifecycle.
 * Part of silent-failure hardening — ensures every cron run is persisted.
 */
import { createServerClient } from "@/lib/supabase";

interface CronRunResult {
  runId: string;
  complete: (itemsProcessed?: number, metadata?: Record<string, unknown>) => Promise<void>;
  fail: (error: string, itemsFailed?: number) => Promise<void>;
  increment: (count?: number) => void;
}

export async function startCronRun(cronName: string): Promise<CronRunResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createServerClient();
  let itemsProcessed = 0;

  const { data, error } = await supabase
    .from("cron_runs")
    .insert({
      cron_name: cronName,
      status: "running",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`[CronTracker] Failed to start run for ${cronName}:`, error?.message);
    return {
      runId: "untracked",
      complete: async () => {},
      fail: async () => {},
      increment: () => {},
    };
  }

  const runId = (data as { id: string }).id;

  return {
    runId,
    increment: (count = 1) => {
      itemsProcessed += count;
    },
    complete: async (finalCount?: number, metadata?: Record<string, unknown>) => {
      const { error: updateError } = await supabase
        .from("cron_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          items_processed: finalCount ?? itemsProcessed,
          metadata: metadata ?? {},
        })
        .eq("id", runId);

      if (updateError) {
        console.error(`[CronTracker] Failed to complete run ${runId}:`, updateError.message);
      }
    },
    fail: async (errorMessage: string, itemsFailed = 0) => {
      const { error: updateError } = await supabase
        .from("cron_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          items_processed: itemsProcessed,
          items_failed: itemsFailed,
          error_message: errorMessage.substring(0, 1000),
        })
        .eq("id", runId);

      if (updateError) {
        console.error(`[CronTracker] Failed to record failure for run ${runId}:`, updateError.message);
      }
    },
  };
}

/**
 * Convenience wrapper — runs a cron function with automatic tracking
 */
export async function withCronTracking<T>(
  cronName: string,
  fn: (run: CronRunResult) => Promise<T>
): Promise<T> {
  const run = await startCronRun(cronName);
  try {
    const result = await fn(run);
    await run.complete();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await run.fail(message);
    throw error;
  }
}
