/**
 * One-off: remap hardcoded Tailwind palette utilities to semantic tokens
 * so Light/Dark theme CSS variables apply everywhere.
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
    } else if (/\.(tsx|ts|css)$/.test(f.name) && !f.name.endsWith(".test.ts") && !p.includes("__tests__")) {
      acc.push(p);
    }
  }
}

function rep(s) {
  let o = s;
  // cyan -> primary (maps to --primary in @theme)
  o = o.replace(/\btext-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "text-primary$1");
  o = o.replace(/\bbg-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "bg-primary$1");
  o = o.replace(/\bborder-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "border-primary$1");
  o = o.replace(/\bring-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "ring-ring$1");
  o = o.replace(/\bfrom-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "from-primary$1");
  o = o.replace(/\bto-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "to-primary$1");
  o = o.replace(/\bvia-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "via-primary$1");
  o = o.replace(/\bfill-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "fill-primary$1");
  o = o.replace(/\bstroke-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "stroke-primary$1");
  o = o.replace(/\bhover:text-cyan(\/[0-9.]+)?\b/g, "hover:text-primary$1");
  o = o.replace(/\bhover:bg-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "hover:bg-primary$1");
  o = o.replace(/\bhover:border-cyan(\/[0-9.]+|\/\[[^\]]+\])?\b/g, "hover:border-primary$1");

  const pal = [
    "emerald", "teal", "green", "lime", "sky", "blue", "indigo", "violet",
    "purple", "fuchsia", "pink", "rose", "red", "orange", "amber", "yellow",
    "slate", "gray", "zinc", "neutral", "stone",
  ];
  const shades = "50|100|200|300|400|500|600|700|800|900|950";
  for (const c of pal) {
    o = o.replace(
      new RegExp(`\\btext-${c}-(?:${shades})(\\/[0-9.]+)?\\b`, "g"),
      "text-foreground$1",
    );
    o = o.replace(
      new RegExp(`\\bbg-${c}-(?:${shades})(\\/(?:\\[[^\\]]+\\]|[0-9.]+))?\\b`, "g"),
      "bg-muted$1",
    );
    o = o.replace(
      new RegExp(`\\bborder-${c}-(?:${shades})(\\/(?:\\[[^\\]]+\\]|[0-9.]+))?\\b`, "g"),
      "border-border$1",
    );
    o = o.replace(
      new RegExp(`\\bring-${c}-(?:${shades})(\\/(?:\\[[^\\]]+\\]|[0-9.]+))?\\b`, "g"),
      "ring-ring$1",
    );
    o = o.replace(
      new RegExp(`\\bfrom-${c}-(?:${shades})(\\/(?:\\[[^\\]]+\\]|[0-9.]+))?\\b`, "g"),
      "from-muted$1",
    );
    o = o.replace(
      new RegExp(`\\bto-${c}-(?:${shades})(\\/(?:\\[[^\\]]+\\]|[0-9.]+))?\\b`, "g"),
      "to-muted$1",
    );
    o = o.replace(
      new RegExp(`\\bvia-${c}-(?:${shades})(\\/(?:\\[[^\\]]+\\]|[0-9.]+))?\\b`, "g"),
      "via-muted$1",
    );
  }
  return o;
}

const files = [];
walk(root, files);
let updated = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const t = rep(s);
  if (t !== s) {
    fs.writeFileSync(f, t);
    updated++;
  }
}
console.log(`tokenize-colors: updated ${updated} / ${files.length} files`);
