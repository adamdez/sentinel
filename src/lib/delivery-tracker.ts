/**
 * Delivery run tracking — replaces fire-and-forget .catch(() => {}) pattern
 *
 * Every webhook dispatch, Slack notification, and n8n event gets a
 * delivery_runs row with queued → sent/failed lifecycle.
 */
import { createServerClient } from "@/lib/supabase";

interface DeliveryOptions {
  channel: string;       // "slack" | "n8n" | "sms" | "email"
  eventType: string;     // e.g. "call.completed", "deal.stale_dispo"
  payload?: unknown;
  entityType?: string;   // "lead" | "call" | "deal"
  entityId?: string;
}

/**
 * Track a delivery attempt. Returns functions to mark sent/failed.
 */
export async function trackDelivery(options: DeliveryOptions) {
  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("delivery_runs")
    .insert({
      channel: options.channel,
      event_type: options.eventType,
      payload: options.payload ? JSON.parse(JSON.stringify(options.payload)) : null,
      status: "queued",
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`[DeliveryTracker] Failed to create delivery record:`, error?.message);
    return {
      markSent: async () => {},
      markFailed: async (_err: string) => {},
    };
  }

  const deliveryId = (data as { id: string }).id;

  return {
    markSent: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("delivery_runs")
        .update({
          status: "sent",
          completed_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);
    },
    markFailed: async (errorMessage: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("delivery_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: errorMessage.substring(0, 1000),
        })
        .eq("id", deliveryId);
    },
  };
}

/**
 * Convenience: track + execute a delivery in one call.
 * Replaces the fire-and-forget pattern.
 */
export async function trackedDelivery(
  options: DeliveryOptions,
  deliveryFn: () => Promise<unknown>
): Promise<void> {
  const tracker = await trackDelivery(options);
  try {
    await deliveryFn();
    await tracker.markSent();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await tracker.markFailed(message);
    // Don't rethrow — this replaces fire-and-forget, caller already moved on
    console.warn(`[DeliveryTracker] ${options.channel}/${options.eventType} failed:`, message);
  }
}
