import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "imusghlptroddfeycpei";

function fail(message) {
  console.error(`[supabase-remote-push] ${message}`);
  process.exit(1);
}

const validateResult = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "validate-supabase-migrations.mjs")], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (validateResult.status !== 0) {
  process.exit(validateResult.status ?? 1);
}

if (!accessToken) {
  fail("SUPABASE_ACCESS_TOKEN is required.");
}

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .filter((name) => statSync(path.join(migrationsDir, name)).isFile())
  .sort()
  .map((name) => ({
    name,
    version: name.slice(0, 14),
    migrationName: name.slice(15, -4),
    sql: readFileSync(path.join(migrationsDir, name), "utf8").trim(),
  }));

async function runQuery(query, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      read_only: readOnly,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  return response.json();
}

const remoteResult = await runQuery(
  "select version from supabase_migrations.schema_migrations order by version;",
  true,
);

const remoteRows = Array.isArray(remoteResult)
  ? remoteResult
  : Array.isArray(remoteResult?.value)
    ? remoteResult.value
    : [];
const remoteVersions = new Set(remoteRows.map((row) => String(row.version)));
const localVersions = new Set(migrations.map((migration) => migration.version));
const remoteOnly = [...remoteVersions].filter((version) => !localVersions.has(version));

if (remoteOnly.length > 0) {
  fail(`Remote migration history still has versions missing locally: ${remoteOnly.join(", ")}`);
}

const pending = migrations.filter((migration) => !remoteVersions.has(migration.version));

if (pending.length === 0) {
  console.log("[supabase-remote-push] No pending migrations.");
} else {
  for (const migration of pending) {
    console.log(`[supabase-remote-push] Applying ${migration.name}`);
    const escapedName = migration.migrationName.replace(/'/g, "''");
    const escapedSql = migration.sql.replace(/'/g, "''");
    const statementLiteral = `ARRAY[${migration.sql ? `'${escapedSql}'` : "'-- empty migration'"}]::text[]`;
    const query = `
begin;
${migration.sql || "-- empty migration"}
insert into supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback)
values ('${migration.version}', ${statementLiteral}, '${escapedName}', 'codex', '${migration.version}', array[]::text[]);
commit;
`.trim();

    await runQuery(query, false);
  }

  console.log(`[supabase-remote-push] Applied ${pending.length} migration${pending.length === 1 ? "" : "s"}.`);
}
