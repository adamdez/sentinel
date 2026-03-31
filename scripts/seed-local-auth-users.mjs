import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function getLocalSupabaseStatusJson() {
  const result = spawnSync("npx", ["--yes", "supabase", "status", "-o", "json"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "Failed to read local Supabase status.");
    process.exit(result.status ?? 1);
  }

  const output = (result.stdout ?? "").trim();
  const jsonEnd = output.lastIndexOf("}");
  const jsonText = jsonEnd >= 0 ? output.slice(0, jsonEnd + 1) : output;
  return JSON.parse(jsonText);
}

const status = getLocalSupabaseStatusJson();
const supabase = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { Client } = pg;

const DEV_USERS = [
  {
    email: "adam@dominionhomedeals.com",
    password: "Dominion2026!",
    full_name: "Adam DesJardin",
    role: "admin",
    personal_cell: "+15095907091",
    twilio_phone_number: "+15099921136",
  },
  {
    email: "logan@dominionhomedeals.com",
    password: "Dominion2026!",
    full_name: "Logan D.",
    role: "admin",
    personal_cell: "+15096669518",
    twilio_phone_number: "+15098225460",
  },
  {
    email: "nathan@dominionhomedeals.com",
    password: "Dominion2026!",
    full_name: "user 1",
    role: "agent",
    personal_cell: "+12087589246",
    twilio_phone_number: "+12087589246",
  },
];

async function ensureUser(user) {
  const listed = await withRetries(() => supabase.auth.admin.listUsers({ page: 1, perPage: 200 }));
  if (listed.error) throw listed.error;
  const existing = listed.data.users.find((candidate) => candidate.email?.toLowerCase() === user.email.toLowerCase());

  if (existing) {
    const { error: updateError } = await withRetries(() => supabase.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password: user.password,
      user_metadata: {
        full_name: user.full_name,
      },
    }));
    if (updateError) throw updateError;
    return existing.id;
  }

  const created = await withRetries(() => supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      full_name: user.full_name,
    },
  }));

  if (created.error || !created.data.user) {
    throw created.error ?? new Error(`Failed to create ${user.email}`);
  }

  return created.data.user.id;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(fn, attempts = 6, delayMs = 2500) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    const result = await fn();
    if (!result?.error) return result;
    lastError = result.error;
    await sleep(delayMs);
  }
  return { data: null, error: lastError };
}

async function main() {
  await sleep(8000);
  const userIdsByEmail = {};

  for (const user of DEV_USERS) {
    const id = await ensureUser(user);
    userIdsByEmail[user.email] = id;
  }

  const profiles = DEV_USERS.map((user) => ({
    id: userIdsByEmail[user.email],
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    is_active: true,
    preferences: {},
    personal_cell: user.personal_cell,
    twilio_phone_number: user.twilio_phone_number,
  }));

  const db = new Client({ connectionString: status.DB_URL });
  await db.connect();
  try {
    for (const profile of profiles) {
      await db.query(
        `
          insert into public.user_profiles (
            id, email, full_name, role, is_active, preferences, personal_cell, twilio_phone_number
          ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
          on conflict (id) do update set
            email = excluded.email,
            full_name = excluded.full_name,
            role = excluded.role,
            is_active = excluded.is_active,
            preferences = excluded.preferences,
            personal_cell = excluded.personal_cell,
            twilio_phone_number = excluded.twilio_phone_number
        `,
        [
          profile.id,
          profile.email,
          profile.full_name,
          profile.role,
          profile.is_active,
          JSON.stringify(profile.preferences),
          profile.personal_cell,
          profile.twilio_phone_number,
        ],
      );
    }

    const assignments = [
      { leadId: "11111111-1111-1111-1111-111111111111", assignee: userIdsByEmail["adam@dominionhomedeals.com"] },
      { leadId: "22222222-2222-2222-2222-222222222222", assignee: userIdsByEmail["adam@dominionhomedeals.com"] },
      { leadId: "44444444-4444-4444-4444-444444444444", assignee: userIdsByEmail["logan@dominionhomedeals.com"] },
    ];

    for (const assignment of assignments) {
      await db.query(
        "update public.leads set assigned_to = $1 where id = $2",
        [assignment.assignee, assignment.leadId],
      );
    }
  } finally {
    await db.end();
  }

  console.log("Seeded local auth users and aligned lead ownership.");
  console.log("Login password for seeded users: Dominion2026!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
