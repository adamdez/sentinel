import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const { Client } = pg;

const DEV_USERS = [
  {
    email: "adam@dominionhomedeals.com",
    password: "Dominion2026!",
    role: "admin",
  },
  {
    email: "logan@dominionhomedeals.com",
    password: "Dominion2026!",
    role: "admin",
  },
  {
    email: "nathan@dominionhomedeals.com",
    password: "Dominion2026!",
    role: "agent",
  },
];

const DEMO_LEADS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    label: "Overdue callback",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    label: "Fresh untouched lead",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    label: "Negotiation sample",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    label: "Disposition sample",
  },
];

function runNodeScript(scriptPath, extraArgs = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getLocalSupabaseStatusJson() {
  const result = spawnSync("npx", ["--yes", "supabase", "status", "-o", "json"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "").trim();
    throw new Error(
      [
        "Local Supabase is not available.",
        "Run `npm run db:start` first, or use `npm run ux:access:reset` to rebuild the local demo data.",
        details,
      ].filter(Boolean).join("\n"),
    );
  }

  const output = (result.stdout ?? "").trim();
  const jsonEnd = output.lastIndexOf("}");
  const jsonText = jsonEnd >= 0 ? output.slice(0, jsonEnd + 1) : output;
  return JSON.parse(jsonText);
}

async function loadDemoLeadSummary(dbUrl) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const { rows } = await client.query(
      `
        select
          l.id,
          l.status,
          l.priority,
          l.assigned_to,
          l.next_call_scheduled_at,
          l.next_follow_up_at,
          l.last_contact_at,
          p.address,
          p.city,
          p.owner_name
        from public.leads l
        join public.properties p on p.id = l.property_id
        where l.id = any($1::uuid[])
        order by array_position($1::uuid[], l.id)
      `,
      [DEMO_LEADS.map((lead) => lead.id)],
    );

    return rows;
  } finally {
    await client.end();
  }
}

function printSummary(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = DEMO_LEADS.filter((lead) => !byId.has(lead.id));

  if (missing.length > 0) {
    const missingList = missing.map((lead) => `${lead.label} (${lead.id})`).join("\n- ");
    throw new Error(
      [
        "Local demo leads are missing.",
        "Run `npm run db:reset` to reload deterministic seed data, then re-run `npm run ux:access:local`.",
        `Missing:\n- ${missingList}`,
      ].join("\n"),
    );
  }

  console.log("\nLocal UX access is ready.\n");
  console.log("Login route: http://localhost:3000/login");
  console.log("Shared demo password: Dominion2026!");
  console.log("Seeded users:");
  for (const user of DEV_USERS) {
    console.log(`- ${user.email} (${user.role})`);
  }

  console.log("\nStable demo leads:");
  for (const demoLead of DEMO_LEADS) {
    const row = byId.get(demoLead.id);
    const dueAt = row.next_call_scheduled_at ?? row.next_follow_up_at;
    const dueLabel = dueAt ? new Date(dueAt).toISOString() : "none";
    const lastContactLabel = row.last_contact_at ? new Date(row.last_contact_at).toISOString() : "never";
    console.log(
      `- ${demoLead.label}: ${row.address}${row.city ? `, ${row.city}` : ""} | ${row.owner_name} | status=${row.status} | priority=${row.priority} | due=${dueLabel} | last_contact=${lastContactLabel}`,
    );
  }

  console.log("\nRecommended UX review order:");
  console.log("- Start in My Leads as Adam to inspect the overdue callback and fresh untouched lead.");
  console.log("- Open the negotiation and disposition samples from the client file to review stage confidence and downstream actions.");
}

async function main() {
  const shouldResetDb = process.argv.includes("--reset-db");

  if (shouldResetDb) {
    console.log("Resetting local Supabase database to deterministic seed data...");
    runNodeScript(path.join(repoRoot, "scripts", "supabase-cli.mjs"), ["db", "reset"]);
  }

  console.log("Ensuring local auth users and ownership mapping...");
  runNodeScript(path.join(repoRoot, "scripts", "seed-local-auth-users.mjs"));

  const status = getLocalSupabaseStatusJson();
  const rows = await loadDemoLeadSummary(status.DB_URL);
  printSummary(rows);
}

main().catch((error) => {
  console.error(`\n[ux-access] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
