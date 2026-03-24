/**
 * Bidirectional sync between tasks table and leads.next_action / next_action_due_at.
 *
 * Rule: The tasks table is the source of truth. The lead's next_action fields
 * are a cached projection of the lead's most recent pending task.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * After a task is created or updated with a lead_id, project the task
 * title + due_at onto the lead's next_action fields.
 */
export async function syncTaskToLead(
  sb: SupabaseClient,
  leadId: string,
  title: string,
  dueAt: string | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("leads") as any)
    .update({
      next_action: title,
      next_action_due_at: dueAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    console.error("[task-lead-sync] Failed to sync task→lead:", error.message);
  }
}

/**
 * When a task is completed or deleted, clear the lead's next_action if it
 * still matches this task. Then promote the next pending task if one exists.
 */
export async function clearTaskFromLead(
  sb: SupabaseClient,
  leadId: string,
  completedTaskId: string,
): Promise<void> {
  // Find the next pending task for this lead (excluding the one just completed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nextTask } = await (sb.from("tasks") as any)
    .select("id, title, due_at")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .neq("id", completedTaskId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (nextTask) {
    await syncTaskToLead(sb, leadId, nextTask.title, nextTask.due_at);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("leads") as any)
      .update({
        next_action: null,
        next_action_due_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (error) {
      console.error("[task-lead-sync] Failed to clear lead next_action:", error.message);
    }
  }
}

/**
 * When a lead's next_action is set directly (e.g. post-call closeout),
 * upsert a corresponding task row so the tasks table stays in sync.
 * Returns the task ID.
 *
 * If the title looks generic (no " — " separator with lead identity),
 * we enrich it by querying the lead's property for owner_name + address.
 */
export async function syncLeadToTask(
  sb: SupabaseClient,
  leadId: string,
  title: string,
  dueAt: string | null,
  assignedTo: string,
  taskType: string = "follow_up",
): Promise<string | null> {
  let enrichedTitle = title;

  // Safety net: if the title doesn't already contain lead identity, enrich it
  if (!title.includes(" — ")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lead } = await (sb.from("leads") as any)
        .select("property_id")
        .eq("id", leadId)
        .single();

      if (lead?.property_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: prop } = await (sb.from("properties") as any)
          .select("owner_name, address")
          .eq("id", lead.property_id)
          .single();

        if (prop) {
          const rawOwner = typeof prop.owner_name === "string" ? prop.owner_name.trim() : null;
          const owner = rawOwner && rawOwner !== "Unknown Owner" ? rawOwner : null;
          const addr = typeof prop.address === "string" ? prop.address.trim() || null : null;
          const label = owner
            ? addr ? `${owner}, ${addr}` : owner
            : addr;
          if (label) enrichedTitle = `${title} — ${label}`;
        }
      }
    } catch {
      // Non-fatal — keep the original title
    }
  }

  // Check for an existing pending task on this lead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("tasks") as any)
    .select("id")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("tasks") as any)
      .update({ title: enrichedTitle, due_at: dueAt, updated_at: now })
      .eq("id", existing.id);
    return existing.id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newTask, error } = await (sb.from("tasks") as any)
    .insert({
      title: enrichedTitle,
      lead_id: leadId,
      assigned_to: assignedTo,
      due_at: dueAt,
      task_type: taskType,
      status: "pending",
      priority: 2,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[task-lead-sync] Failed to create task from lead:", error.message);
    return null;
  }
  return newTask?.id ?? null;
}
