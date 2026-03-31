import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const envLocalPath = path.join(repoRoot, ".env.local");
const remoteBackupPath = path.join(repoRoot, ".env.local.remote.backup");
const canonicalRemotePaths = [
  path.join(repoRoot, ".env.vercel.production"),
  path.join(repoRoot, ".env.vercel"),
  remoteBackupPath,
];

const mode = process.argv[2];
if (!["local", "remote"].includes(mode)) {
  console.error("Usage: node scripts/switch-supabase-env.mjs <local|remote>");
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

function stripQuotes(value) {
  return value.replace(/^"(.*)"$/s, "$1");
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

function readEnvObject(filePath) {
  return Object.fromEntries(
    parseEnvFile(readEnvOrEmpty(filePath)).map((entry) => [entry.key, stripQuotes(entry.value)]),
  );
}

function isLocalSupabaseUrl(url) {
  return typeof url === "string" && /127\.0\.0\.1|localhost/.test(url);
}

function isMeaningfulValue(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !trimmed.includes("[YOUR_") && !trimmed.includes("your-project") && !trimmed.includes("your-remote");
}

function pickSupabaseEnvValues(env) {
  const updates = {};
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
  ]) {
    if (isMeaningfulValue(env[key])) {
      updates[key] = env[key];
    }
  }
  return updates;
}

function readCanonicalRemoteValues() {
  for (const candidate of canonicalRemotePaths) {
    if (!existsSync(candidate)) continue;
    const env = readEnvObject(candidate);
    const values = pickSupabaseEnvValues(env);
    if (
      values.NEXT_PUBLIC_SUPABASE_URL
      && !isLocalSupabaseUrl(values.NEXT_PUBLIC_SUPABASE_URL)
      && values.NEXT_PUBLIC_SUPABASE_ANON_KEY
      && values.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return values;
    }
  }
  return null;
}

function maybeWriteRemoteBackupFromCurrentEnv() {
  const current = readEnvObject(envLocalPath);
  if (!current.NEXT_PUBLIC_SUPABASE_URL || isLocalSupabaseUrl(current.NEXT_PUBLIC_SUPABASE_URL)) {
    return false;
  }

  const values = pickSupabaseEnvValues(current);
  const keys = Object.keys(values);
  if (keys.length === 0) return false;

  const backupContent = keys.map((key) => `${key}=${quoteEnvValue(values[key])}`).join("\n");
  writeFileSync(remoteBackupPath, `${backupContent}\n`);
  return true;
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
  const backedUp = maybeWriteRemoteBackupFromCurrentEnv();
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
  if (backedUp) {
    console.log(`Backed up remote Supabase values to ${remoteBackupPath}.`);
  } else {
    console.log("Current env already looked local; remote backup left unchanged.");
  }
  process.exit(0);
}

const remoteValues = readCanonicalRemoteValues();
if (!remoteValues) {
  console.error("Could not find a canonical remote Supabase configuration.");
  console.error("Expected valid values in .env.vercel.production, .env.vercel, or .env.local.remote.backup.");
  process.exit(1);
}

const current = readEnvOrEmpty(envLocalPath);
const restored = upsertEnvValues(current, remoteValues);
writeFileSync(envLocalPath, restored);
console.log(`Updated ${envLocalPath} to use remote Supabase values.`);
if (!remoteValues.DATABASE_URL) {
  console.log("Remote DATABASE_URL was not updated because no non-placeholder value was available.");
}
