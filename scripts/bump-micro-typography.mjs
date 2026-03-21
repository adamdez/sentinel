/**
 * One-off / repeatable: map microscopic arbitrary font sizes to semantic Tailwind scale.
 * Run after adjusting @theme --text-xs / --text-sm in globals.css.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir, acc) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory() && f.name !== "node_modules" && f.name !== ".next") walk(p, acc);
    else if (f.isFile() && f.name.endsWith(".tsx")) acc.push(p);
  }
}

/** Longest px widths first to avoid partial collisions */
const PX_TO_CLASS = [
  ["text-[11px]", "text-sm"],
  ["text-[10px]", "text-sm"],
  ["text-[9px]", "text-xs"],
  ["text-[8px]", "text-xs"],
  ["text-[12px]", "text-xs"],
  // text-[7px] — fix manually if reintroduced; use text-xs + padding
];

function bump(content) {
  let s = content;
  for (const [from, to] of PX_TO_CLASS) {
    s = s.split(from).join(to);
  }
  return s;
}

const files = [];
walk(root, files);
let n = 0;
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8");
  const next = bump(raw);
  if (next !== raw) {
    fs.writeFileSync(f, next);
    n++;
  }
}
console.log(`bump-micro-typography: updated ${n} tsx files`);
