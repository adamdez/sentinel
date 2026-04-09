import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const envLocalPath = path.join(repoRoot, ".env.local");

function parseEnvFile(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((match) => ({ key: match[1], value: match[2].replace(/^"(.*)"$/s, "$1") }));
}

function readEnv(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(parseEnvFile(readFileSync(filePath, "utf8")).map((entry) => [entry.key, entry.value]));
}

const env = {
  ...readEnv(envLocalPath),
  ...process.env,
};

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = 500;
const CALL_TASK_TYPES = new Set(["callback", "call_back", "follow_up", "drive_by"]);
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

function inferTaskType(lead) {
  const nextAction = typeof lead.next_action === "string" ? lead.next_action.trim().toLowerCase() : "";
  if (nextAction.startsWith("drive by")) return "drive_by";
  if (lead.next_call_scheduled_at) return "callback";
  if (lead.next_follow_up_at || lead.next_action_due_at || nextAction) return "follow_up";
  return null;
}

function inferDueAt(lead) {
  return lead.next_action_due_at ?? lead.next_call_scheduled_at ?? lead.next_follow_up_at ?? null;
}

function inferTitle(lead) {
  const raw = typeof lead.next_action === "string" ? lead.next_action.trim() : "";
  if (raw) return raw;
  if (lead.next_call_scheduled_at) return "Callback scheduled";
  if (lead.next_follow_up_at || lead.next_action_due_at) return "Follow up";
  return null;
}

function projectionForTask(taskType, dueAt, title) {
  return {
    next_action: title,
    next_action_due_at: dueAt,
    next_call_scheduled_at: taskType === "callback" ? dueAt : null,
    next_follow_up_at: taskType === "follow_up" || taskType === "drive_by" ? dueAt : null,
  };
}

async function fetchLeadsPage(from, to) {
  const { data, error } = await sb
    .from("leads")
    .select("id, assigned_to, status, next_action, next_action_due_at, next_call_scheduled_at, next_follow_up_at")
    .not("status", "in", '("dead","closed")')
    .order("created_at", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function main() {
  let page = 0;
  let scanned = 0;
  let created = 0;
  let normalized = 0;
  let skippedExisting = 0;
  let skippedEmpty = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const leads = await fetchLeadsPage(from, to);
    if (leads.length === 0) break;
    scanned += leads.length;

    const candidateLeads = leads.filter((lead) => inferTaskType(lead) && inferTitle(lead));
    if (candidateLeads.length === 0) {
      page += 1;
      continue;
    }

    const leadIds = candidateLeads.map((lead) => lead.id);
    const { data: pendingTasks, error: pendingError } = await sb
      .from("tasks")
      .select("id, lead_id, task_type, status")
      .in("lead_id", leadIds)
      .eq("status", "pending");

    if (pendingError) throw pendingError;

    const openCallTaskLeadIds = new Set(
      (pendingTasks ?? [])
        .filter((task) => typeof task.lead_id === "string" && CALL_TASK_TYPES.has(String(task.task_type ?? "").toLowerCase()))
        .map((task) => task.lead_id),
    );

    const inserts = [];
    const leadProjectionUpdates = [];

    for (const lead of candidateLeads) {
      const taskType = inferTaskType(lead);
      const title = inferTitle(lead);
      const dueAt = inferDueAt(lead);

      if (!taskType || !title) {
        skippedEmpty += 1;
        continue;
      }

      const projection = projectionForTask(taskType, dueAt, title);

      if (openCallTaskLeadIds.has(lead.id)) {
        skippedExisting += 1;
        leadProjectionUpdates.push({ id: lead.id, ...projection });
        continue;
      }

      inserts.push({
        title,
        lead_id: lead.id,
        assigned_to: lead.assigned_to ?? SYSTEM_USER_ID,
        due_at: dueAt,
        task_type: taskType,
        status: "pending",
        priority: taskType === "callback" ? 1 : 2,
        source_type: "lead_follow_up",
        source_key: `lead:${lead.id}:primary_call`,
        notes: "Backfilled from legacy lead next-action fields.",
      });
      leadProjectionUpdates.push({ id: lead.id, ...projection });
    }

    if (inserts.length > 0) {
      const { error: insertError } = await sb.from("tasks").insert(inserts);
      if (insertError) throw insertError;
      created += inserts.length;
    }

    for (const update of leadProjectionUpdates) {
      const { error: updateError } = await sb
        .from("leads")
        .update({
          next_action: update.next_action,
          next_action_due_at: update.next_action_due_at,
          next_call_scheduled_at: update.next_call_scheduled_at,
          next_follow_up_at: update.next_follow_up_at,
        })
        .eq("id", update.id);
      if (updateError) throw updateError;
      normalized += 1;
    }

    page += 1;
  }

  console.log(JSON.stringify({
    scanned,
    created,
    normalized,
    skippedExisting,
    skippedEmpty,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
