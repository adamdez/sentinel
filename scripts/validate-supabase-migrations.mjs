import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .filter((name) => statSync(path.join(migrationsDir, name)).isFile());

const invalid = migrationFiles.filter((name) => !/^\d{14}_.+\.sql$/.test(name));
if (invalid.length > 0) {
  console.error("[validate-supabase-migrations] Every active migration filename must start with a unique 14-digit timestamp prefix.");
  for (const name of invalid) {
    console.error(` - ${name}`);
  }
  process.exit(1);
}

const seen = new Map();
let hasDuplicatePrefix = false;
for (const name of migrationFiles) {
  const prefix = name.slice(0, 14);
  if (seen.has(prefix)) {
    if (!hasDuplicatePrefix) {
      console.error("[validate-supabase-migrations] Duplicate migration timestamp prefixes detected:");
      hasDuplicatePrefix = true;
    }
    console.error(` - ${prefix}: ${seen.get(prefix)} and ${name}`);
  } else {
    seen.set(prefix, name);
  }
}

if (hasDuplicatePrefix) {
  process.exit(1);
}
