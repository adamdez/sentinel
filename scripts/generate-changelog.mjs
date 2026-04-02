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
const REPO_ROOT = resolve(__dirname, "..");
const OUTPUT = resolve(REPO_ROOT, "src/data/recent-changelog.json");

function runGit(command) {
  try {
    return execSync(command, {
      encoding: "utf-8",
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

try {
  const inGitWorkTree = runGit("git rev-parse --is-inside-work-tree") === "true";
  if (!inGitWorkTree) {
    throw new Error("Not in a git worktree");
  }

  const raw = runGit('git log --pretty=format:"%H|||%ai|||%s" -25');
  if (!raw) {
    throw new Error("No git log available");
  }

  const entries = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, dateRaw, message] = line.split("|||");
      return {
        hash: hash.slice(0, 8),
        date: dateRaw.split(" ")[0],
        message: message.trim(),
      };
    });

  writeFileSync(OUTPUT, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`[generate-changelog] Wrote ${entries.length} entries to recent-changelog.json`);
} catch {
  console.warn("[generate-changelog] Could not read git log - writing empty changelog");
  writeFileSync(OUTPUT, "[]", "utf-8");
}

