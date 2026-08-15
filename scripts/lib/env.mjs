import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..", "..");

export function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  let text = readFileSync(envPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

export function resolveJwt() {
  const fromEnv = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_JWT;
  if (fromEnv?.startsWith("eyJ")) return fromEnv;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (sk?.startsWith("eyJ")) return sk;
  try {
    const raw = execSync("supabase projects api-keys --project-ref zsfhnjrotkbzyikkxmnm -o json", {
      encoding: "utf8",
      cwd: ROOT,
    });
    const keys = JSON.parse(raw);
    return keys.find((k) => k.name === "service_role" && String(k.api_key || "").startsWith("eyJ"))?.api_key ?? null;
  } catch {
    return null;
  }
}

export function getSupabaseConfig() {
  loadEnvFile();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const jwt = resolveJwt();
  if (!url || !jwt) {
    throw new Error("Configure SUPABASE_URL e SUPABASE_LEGACY_SERVICE_ROLE_KEY (JWT eyJ...) no .env");
  }
  return { url, jwt };
}
