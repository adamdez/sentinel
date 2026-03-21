/**
 * Replace chroma inline rgba() in TS/TSX with neutral grayscale (theme-agnostic).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "src");

const skipDirs = new Set(["node_modules", ".next", "dist", "coverage"]);

function walk(dir, acc) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name.startsWith(".")) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (skipDirs.has(f.name)) continue;
      walk(p, acc);
    } else if (f.name.endsWith(".tsx") || f.name.endsWith(".ts")) {
      if (p.includes("__tests__") || f.name.endsWith(".test.ts")) continue;
      acc.push(p);
    }
  }
}

function neutralize(s) {
  let o = s;
  // Cyan / neon-cyan / purple glows → neutral white or black
  o = o.replace(/rgba\(\s*0\s*,\s*212\s*,\s*255\s*,/g, "rgba(0,0,0,");
  o = o.replace(/rgba\(\s*0\s*,\s*229\s*,\s*255\s*,/g, "rgba(255,255,255,");
  o = o.replace(/rgba\(\s*0\s*,\s*255\s*,\s*136\s*,/g, "rgba(255,255,255,");
  o = o.replace(/rgba\(\s*179\s*,\s*136\s*,\s*255\s*,/g, "rgba(0,0,0,");
  o = o.replace(/rgba\(\s*245\s*,\s*158\s*,\s*11\s*,/g, "rgba(0,0,0,");
  return o;
}

const files = [];
walk(root, files);
let updated = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const t = neutralize(s);
  if (t !== s) {
    fs.writeFileSync(f, t);
    updated++;
  }
}
console.log(`neutralize-inline-rgba: updated ${updated} files`);
