import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const supabaseDir = path.join(repoRoot, "supabase");
const projectRefCandidates = [
  path.join(supabaseDir, ".temp", "project-ref"),
  path.join(supabaseDir, "supabase", ".temp", "project-ref"),
];

const DEFAULT_PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "imusghlptroddfeycpei";
const rawArgs = process.argv.slice(2);

function fail(message) {
  console.error(`[supabase-cli] ${message}`);
  process.exit(1);
}

function hasArg(flag) {
  return rawArgs.includes(flag) || rawArgs.some((arg) => arg.startsWith(`${flag}=`));
}

function readLinkedProjectRef() {
  for (const candidate of projectRefCandidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf8").trim() || null;
    }
  }
  return null;
}

if (rawArgs.length === 0) {
  fail("No Supabase command provided. Example: node scripts/supabase-cli.mjs link");
}

if (!existsSync(supabaseDir)) {
  fail(`Missing Supabase directory at ${supabaseDir}`);
}

const validateResult = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "validate-supabase-migrations.mjs")], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (validateResult.status !== 0) {
  process.exit(validateResult.status ?? 1);
}

const args = [...rawArgs];
const command = args[0];
const linkedProjectRef = readLinkedProjectRef();
const requiresAccessToken = new Set(["link"]);

if (command === "link" && !hasArg("--project-ref")) {
  args.push("--project-ref", DEFAULT_PROJECT_REF);
}

if (requiresAccessToken.has(command) && !process.env.SUPABASE_ACCESS_TOKEN) {
  fail(
    "SUPABASE_ACCESS_TOKEN is required for this command. Run `npx supabase login` once or set SUPABASE_ACCESS_TOKEN in your shell first.",
  );
}

if (["migration", "db"].includes(command) && !linkedProjectRef && command !== "db") {
  console.warn(
    `[supabase-cli] No linked project found yet. Run \`npm run db:link\` first for project ${DEFAULT_PROJECT_REF}.`,
  );
}

const child = process.platform === "win32"
  ? spawn("cmd.exe", ["/d", "/s", "/c", ["npx", "supabase", ...args].join(" ")], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        SUPABASE_PROJECT_REF: DEFAULT_PROJECT_REF,
      },
    })
  : spawn("npx", ["supabase", ...args], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        SUPABASE_PROJECT_REF: DEFAULT_PROJECT_REF,
      },
    });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
