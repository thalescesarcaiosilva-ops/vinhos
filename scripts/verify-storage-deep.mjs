import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[m[1]]) process.env[m[1]] = v;
}
const JWT = JSON.parse(
  execSync("supabase projects api-keys --project-ref aufvvgytbrstsrfomngm -o json", { encoding: "utf8", cwd: ROOT }),
).find((k) => k.name === "service_role")?.api_key;

const files = ["VIN001_1.jpg", "VIN009_3.jpg", "VIN1165_1.png", "VIN1305_1.jpg", "VIN950_1.png"];
const hosts = [
  "https://aufvvgytbrstsrfomngm.supabase.co",
  "https://www.galvaovinhos.com.br",
];

for (const host of hosts) {
  console.log(`\n=== ${host} ===`);
  for (const f of files) {
    const url = `${host}/storage/v1/object/public/product-images/${f}`;
    const r = await fetch(url);
    const ct = r.headers.get("content-type") || "";
    const len = r.headers.get("content-length") || (await r.arrayBuffer()).byteLength;
    console.log(`${f}: ${r.status} ${ct} ${len} bytes`);
  }
}

// Count files with pagination + verify random high SKU exists
let total = 0;
let offset = 0;
const all = [];
while (true) {
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/list/product-images`, {
    method: "POST",
    headers: { apikey: JWT, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 1000, offset, prefix: "", sortBy: { column: "name", order: "asc" } }),
  });
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) break;
  all.push(...data.map((x) => x.name));
  total += data.length;
  if (data.length < 1000) break;
  offset += 1000;
}
console.log(`\nTotal files via API: ${all.length}`);
console.log("Has VIN1165_1.png:", all.includes("VIN1165_1.png"));
console.log("Has VIN1305_1.jpg:", all.includes("VIN1305_1.jpg"));
console.log("Last 5 names:", all.slice(-5));

// Wrong mime files
let bad = 0;
for (const f of all.slice(0, 200)) {
  const r = await fetch(`https://aufvvgytbrstsrfomngm.supabase.co/storage/v1/object/public/product-images/${f}`, { method: "HEAD" });
  const ct = r.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) {
    bad++;
    console.log("BAD MIME:", f, ct);
  }
}
console.log(`Non-image MIME in first 200: ${bad}`);
