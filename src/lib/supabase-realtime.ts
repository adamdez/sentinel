import { supabase } from "./supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type ChangeHandler<T extends { [key: string]: unknown } = { [key: string]: unknown }> = (
  payload: RealtimePostgresChangesPayload<T>
) => void;

/**
 * Subscribe to INSERT events on a Supabase table.
 * Returns an unsubscribe function.
 */
export function onInsert(
  table: string,
  handler: ChangeHandler,
  filter?: string
): () => void {
  const channel = supabase
    .channel(`${table}_inserts`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table,
        filter,
      },
      handler
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to UPDATE events on a Supabase table.
 */
export function onUpdate(
  table: string,
  handler: ChangeHandler,
  filter?: string
): () => void {
  const channel = supabase
    .channel(`${table}_updates`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table,
        filter,
      },
      handler
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to all changes (INSERT, UPDATE, DELETE) on a table.
 */
export function onAllChanges(
  table: string,
  handler: ChangeHandler,
  filter?: string
): () => void {
  const channel = supabase
    .channel(`${table}_all`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter,
      },
      handler
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to new high-score leads being promoted.
 * Fires when a new lead with composite_score >= threshold is inserted.
 */
export function onBreakingLead(
  handler: ChangeHandler,
  scoreThreshold = 65
): () => void {
  return onInsert("leads", (payload) => {
    // TODO: Join with scoring_records to filter by threshold
    handler(payload);
  });
}

/**
 * Subscribe to new distress events for real-time ingestion notifications.
 */
export function onNewDistressEvent(handler: ChangeHandler): () => void {
  return onInsert("distress_events", handler);
}

/**
 * Subscribe to deal status changes.
 */
export function onDealChange(handler: ChangeHandler): () => void {
  return onUpdate("deals", handler);
}

/**
 * Presence channel for team online status.
 */
export function joinPresence(
  userId: string,
  userName: string,
  onSync: (state: Record<string, unknown[]>) => void
): RealtimeChannel {
  const channel = supabase.channel("sentinel_presence", {
    config: { presence: { key: userId } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      onSync(channel.presenceState());
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: userId,
          user_name: userName,
          online_at: new Date().toISOString(),
        });
      }
    });

  return channel;
}
