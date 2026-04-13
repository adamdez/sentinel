#!/usr/bin/env node
/**
 * Runs at build time (prebuild) to capture recent git commits
 * and write them to src/data/recent-changelog.json.
 * Grok's system prompt imports this file for real-time awareness.
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
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

function readExistingEntries() {
  try {
    const raw = readFileSync(OUTPUT, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) =>
      entry
      && typeof entry === "object"
      && typeof entry.hash === "string"
      && typeof entry.date === "string"
      && typeof entry.message === "string",
    );
  } catch {
    return [];
  }
}

function buildVercelFallbackEntries() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE?.trim();
  if (!sha || !message) return null;

  const existing = readExistingEntries();
  const date = new Date().toISOString().slice(0, 10);
  const currentEntry = {
    hash: sha.slice(0, 8),
    date,
    message,
  };

  const dedupedRemainder = existing.filter((entry) => entry.hash !== currentEntry.hash);
  return [currentEntry, ...dedupedRemainder].slice(0, 25);
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
  const fallbackEntries = buildVercelFallbackEntries();
  if (fallbackEntries && fallbackEntries.length > 0) {
    writeFileSync(OUTPUT, JSON.stringify(fallbackEntries, null, 2), "utf-8");
    console.warn(`[generate-changelog] Git log unavailable - wrote ${fallbackEntries.length} entries from Vercel metadata`);
  } else {
    console.warn("[generate-changelog] Could not read git log or Vercel metadata - writing empty changelog");
    writeFileSync(OUTPUT, "[]", "utf-8");
  }
}
