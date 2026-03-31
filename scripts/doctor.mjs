import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const envLocalPath = path.join(repoRoot, ".env.local");
const canonicalRemotePaths = [
  path.join(repoRoot, ".env.vercel.production"),
  path.join(repoRoot, ".env.vercel"),
  path.join(repoRoot, ".env.local.remote.backup"),
];

const expectedMode = process.argv.find((arg) => arg.startsWith("--expect="))?.split("=")[1] ?? null;

function parseEnvFile(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((match) => ({ key: match[1], value: match[2] }));
}

function stripQuotes(value) {
  return value.replace(/^"(.*)"$/s, "$1");
}

function readEnvObject(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    parseEnvFile(readFileSync(filePath, "utf8")).map((entry) => [entry.key, stripQuotes(entry.value)]),
  );
}

function isLocalSupabaseUrl(url) {
  return typeof url === "string" && /127\.0\.0\.1|localhost/.test(url);
}

function inferMode(url) {
  if (!url) return "unknown";
  return isLocalSupabaseUrl(url) ? "local" : "remote";
}

function decodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function extractSupabaseRef(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const [subdomain] = parsed.hostname.split(".");
    return subdomain || null;
  } catch {
    return null;
  }
}

function findRemoteReferenceEnv() {
  for (const candidate of canonicalRemotePaths) {
    const env = readEnvObject(candidate);
    if (env.NEXT_PUBLIC_SUPABASE_URL && !isLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
      return env;
    }
  }
  return {};
}

async function collectMissingColumns(client, table, columns) {
  const remaining = [...columns];
  const missing = [];

  while (remaining.length > 0) {
    const { error } = await client.from(table).select(remaining.join(", ")).limit(1);
    if (!error) return { missing, error: null };

    const message = String(error.message ?? "");
    const qualifiedMatch = message.match(new RegExp(`column\\s+${table}\\.([a-zA-Z0-9_]+)\\s+does not exist`, "i"));
    const unqualifiedMatch = message.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
    const missingColumn = qualifiedMatch?.[1] ?? unqualifiedMatch?.[1] ?? null;

    if (!missingColumn || !remaining.includes(missingColumn)) {
      return { missing, error };
    }

    missing.push(missingColumn);
    remaining.splice(remaining.indexOf(missingColumn), 1);
  }

  return { missing, error: null };
}

function checkCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  return {
    ok: result.status === 0,
    output: result.stdout || result.stderr || "",
  };
}

const checks = [];

function addCheck(status, title, detail) {
  checks.push({ status, title, detail });
}

const env = readEnvObject(envLocalPath);
if (!Object.keys(env).length) {
  addCheck("fail", ".env.local", "Missing .env.local file.");
} else {
  addCheck("pass", ".env.local", `Loaded ${envLocalPath}.`);
}

const mode = inferMode(env.NEXT_PUBLIC_SUPABASE_URL);
addCheck("pass", "Supabase mode", `Detected ${mode} mode from NEXT_PUBLIC_SUPABASE_URL.`);

if (expectedMode && expectedMode !== mode) {
  addCheck("fail", "Mode mismatch", `Expected ${expectedMode} mode but .env.local is set to ${mode}.`);
}

const requiredEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of requiredEnvKeys) {
  addCheck(env[key] ? "pass" : "fail", key, env[key] ? "Present." : "Missing from .env.local.");
}

const servicePayload = decodeJwtPayload(env.SUPABASE_SERVICE_ROLE_KEY);
if (!servicePayload) {
  addCheck("warn", "Service role JWT", "Could not decode SUPABASE_SERVICE_ROLE_KEY payload.");
} else {
  addCheck(
    servicePayload.role === "service_role" ? "pass" : "fail",
    "Service role JWT",
    `Decoded role=${servicePayload.role ?? "unknown"} ref=${servicePayload.ref ?? "n/a"}.`,
  );
  const urlRef = extractSupabaseRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (servicePayload.ref && urlRef && servicePayload.ref !== urlRef) {
    addCheck("fail", "Supabase ref alignment", `URL ref ${urlRef} does not match service key ref ${servicePayload.ref}.`);
  } else if (urlRef) {
    addCheck("pass", "Supabase ref alignment", `URL ref ${urlRef} matches service key.`);
  }
}

const remoteReferenceEnv = findRemoteReferenceEnv();
if (mode === "remote" && remoteReferenceEnv.SUPABASE_SERVICE_ROLE_KEY) {
  const localKeyMatchesRemote = env.SUPABASE_SERVICE_ROLE_KEY === remoteReferenceEnv.SUPABASE_SERVICE_ROLE_KEY;
  addCheck(
    localKeyMatchesRemote ? "pass" : "warn",
    "Remote key drift",
    localKeyMatchesRemote
      ? "Local remote service role key matches canonical remote env."
      : "Local remote service role key differs from canonical remote env file.",
  );
}

const rgCheck = checkCommand("rg", ["--version"]);
addCheck(
  rgCheck.ok ? "pass" : "warn",
  "ripgrep",
  rgCheck.ok ? rgCheck.output.split(/\r?\n/)[0] : "ripgrep is unavailable from PATH; install it for faster repo search.",
);

if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error: profileError } = await client.from("user_profiles").select("id").limit(1);
    addCheck(
      profileError ? "fail" : "pass",
      "Supabase connectivity",
      profileError ? String(profileError.message ?? profileError) : "Connected with service role and queried user_profiles.",
    );

    const requiredLeadColumns = ["id", "assigned_to", "dial_queue_active", "dial_queue_added_at", "dial_queue_added_by"];
    const optionalLeadColumns = ["follow_up_date", "appointment_at", "offer_amount", "contract_at", "assignment_fee_projected", "conversion_gclid"];
    const optionalPropertyColumns = ["loan_balance", "last_sale_price", "last_sale_date", "foreclosure_stage", "default_amount", "delinquent_amount", "is_vacant"];

    const leadRequiredCheck = await collectMissingColumns(client, "leads", requiredLeadColumns);
    addCheck(
      leadRequiredCheck.missing.length === 0 ? "pass" : "fail",
      "Dial queue schema",
      leadRequiredCheck.missing.length === 0
        ? "Required dial queue columns are present on leads."
        : `Missing required leads columns: ${leadRequiredCheck.missing.join(", ")}.`,
    );

    const leadOptionalCheck = await collectMissingColumns(client, "leads", optionalLeadColumns);
    addCheck(
      leadOptionalCheck.missing.length === 0 ? "pass" : "warn",
      "Leads compatibility columns",
      leadOptionalCheck.missing.length === 0
        ? "Optional lead inbox columns are present."
        : `Missing optional leads columns: ${leadOptionalCheck.missing.join(", ")}.`,
    );

    const propertyOptionalCheck = await collectMissingColumns(client, "properties", optionalPropertyColumns);
    addCheck(
      propertyOptionalCheck.missing.length === 0 ? "pass" : "warn",
      "Properties compatibility columns",
      propertyOptionalCheck.missing.length === 0
        ? "Optional property columns are present."
        : `Missing optional property columns: ${propertyOptionalCheck.missing.join(", ")}.`,
    );
  } catch (error) {
    addCheck("fail", "Supabase connectivity", String(error instanceof Error ? error.message : error));
  }
}

const order = { pass: 0, warn: 1, fail: 2 };
const summary = checks.reduce(
  (acc, check) => {
    acc[check.status] += 1;
    return acc;
  },
  { pass: 0, warn: 0, fail: 0 },
);

for (const check of checks.sort((a, b) => order[a.status] - order[b.status])) {
  const icon = check.status === "pass" ? "[pass]" : check.status === "warn" ? "[warn]" : "[fail]";
  console.log(`${icon} ${check.title}: ${check.detail}`);
}

console.log("");
console.log(`Doctor summary: ${summary.pass} passed, ${summary.warn} warnings, ${summary.fail} failed.`);

process.exit(summary.fail > 0 ? 1 : 0);
