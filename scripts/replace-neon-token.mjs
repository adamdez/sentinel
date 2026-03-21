import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir, acc) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory() && f.name !== "node_modules" && f.name !== ".next") walk(p, acc);
    else if (f.isFile() && f.name.endsWith(".tsx") && !p.includes("__tests__")) acc.push(p);
  }
}

function rep(s) {
  return s
    .replace(/\btext-neon(\/[0-9.]+)?\b/g, "text-primary$1")
    .replace(/\bborder-neon(\/[0-9.]+)?\b/g, "border-primary$1")
    .replace(/\bbg-neon(\/[0-9.]+)?\b/g, "bg-primary$1");
}

const files = [];
walk(root, files);
let n = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const t = rep(s);
  if (t !== s) {
    fs.writeFileSync(f, t);
    n++;
  }
}
console.log("replace-neon-token:", n, "files");
