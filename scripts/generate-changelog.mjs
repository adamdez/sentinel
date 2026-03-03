#!/usr/bin/env node
/**
 * Runs at build time (prebuild) to capture recent git commits
 * and write them to src/data/recent-changelog.json.
 * Grok's system prompt imports this file for real-time awareness.
 */
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "../src/data/recent-changelog.json");

try {
  const raw = execSync(
    'git log --pretty=format:"%H|||%ai|||%s" -25',
    { encoding: "utf-8", cwd: resolve(__dirname, "..") }
  ).trim();

  const entries = raw.split("\n").filter(Boolean).map((line) => {
    const [hash, dateRaw, message] = line.split("|||");
    return {
      hash: hash.slice(0, 8),
      date: dateRaw.split(" ")[0],
      message: message.trim(),
    };
  });

  writeFileSync(OUTPUT, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`[generate-changelog] Wrote ${entries.length} entries to recent-changelog.json`);
} catch (err) {
  console.warn("[generate-changelog] Could not read git log — writing empty changelog");
  writeFileSync(OUTPUT, "[]", "utf-8");
}
