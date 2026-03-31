import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const mode = process.argv[2];

if (!["local", "remote"].includes(mode)) {
  console.error("Usage: node scripts/run-dev-with-supabase-env.mjs <local|remote>");
  process.exit(1);
}

function runNodeScript(scriptName, args, options = {}) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", scriptName), ...args], {
    cwd: repoRoot,
    stdio: options.stdio ?? "inherit",
    encoding: "utf8",
  });
  return result;
}

if (mode === "local") {
  const statusResult = runNodeScript("supabase-cli.mjs", ["status"], { stdio: "pipe" });
  if (statusResult.status !== 0) {
    console.log("Local Supabase does not appear to be running. Starting it now...");
    const startResult = runNodeScript("supabase-cli.mjs", ["start"]);
    if (startResult.status !== 0) {
      process.exit(startResult.status ?? 1);
    }
  }
}

const switchResult = runNodeScript("switch-supabase-env.mjs", [mode]);
if (switchResult.status !== 0) {
  process.exit(switchResult.status ?? 1);
}

const doctorResult = runNodeScript("doctor.mjs", [`--expect=${mode}`]);
if (doctorResult.status !== 0) {
  console.error("Doctor checks failed. Fix the items above before continuing.");
  process.exit(doctorResult.status ?? 1);
}

const child = process.platform === "win32"
  ? spawn("cmd.exe", ["/d", "/s", "/c", "npx next dev"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    })
  : spawn("npx", ["next", "dev"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
