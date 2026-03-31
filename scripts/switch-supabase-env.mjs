import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const envLocalPath = path.join(repoRoot, ".env.local");
const remoteBackupPath = path.join(repoRoot, ".env.local.remote.backup");

const mode = process.argv[2];
if (!["local", "remote"].includes(mode)) {
  console.error('Usage: node scripts/switch-supabase-env.mjs <local|remote>');
  process.exit(1);
}

function parseEnvFile(content) {
  const lines = content.split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    entries.push({ key: match[1], value: match[2] });
  }
  return entries;
}

function quoteEnvValue(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function upsertEnvValues(fileContent, updates) {
  const lines = fileContent.split(/\r?\n/);
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return line;
    const key = match[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${quoteEnvValue(updates[key])}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    nextLines.push(`${key}=${quoteEnvValue(value)}`);
  }

  return `${nextLines.join("\n").replace(/\n+$/g, "")}\n`;
}

function readEnvOrEmpty(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function writeRemoteBackupFromCurrentEnv() {
  const current = readEnvOrEmpty(envLocalPath);
  const parsed = parseEnvFile(current);
  const wantedKeys = new Set([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
  ]);

  const backupLines = parsed
    .filter((entry) => wantedKeys.has(entry.key))
    .map((entry) => `${entry.key}=${entry.value}`);

  if (backupLines.length > 0) {
    writeFileSync(remoteBackupPath, `${backupLines.join("\n")}\n`);
  }
}

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

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Could not parse `supabase status -o json` output.");
    console.error(output);
    process.exit(1);
  }
}

if (mode === "local") {
  writeRemoteBackupFromCurrentEnv();
  const status = getLocalSupabaseStatusJson();
  const current = readEnvOrEmpty(envLocalPath);

  const next = upsertEnvValues(current, {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    DATABASE_URL: status.DB_URL,
  });

  writeFileSync(envLocalPath, next);
  console.log(`Updated ${envLocalPath} to use local Supabase.`);
  console.log(`Remote Supabase values were backed up to ${remoteBackupPath}.`);
  process.exit(0);
}

if (!existsSync(remoteBackupPath)) {
  console.error(`Remote backup not found at ${remoteBackupPath}.`);
  console.error("Switch to local once first so the current remote values can be captured.");
  process.exit(1);
}

const current = readEnvOrEmpty(envLocalPath);
const backupEntries = Object.fromEntries(parseEnvFile(readEnvOrEmpty(remoteBackupPath)).map((entry) => [entry.key, entry.value.replace(/^"|"$/g, "")]));
const restored = upsertEnvValues(current, backupEntries);
writeFileSync(envLocalPath, restored);
console.log(`Restored Supabase variables in ${envLocalPath} from ${remoteBackupPath}.`);
