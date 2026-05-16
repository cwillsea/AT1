import { readFileSync } from "node:fs";
import path from "node:path";
import forge from "node-forge";

// Mirrors aplos/auth.js but importable from anywhere without top-level-await pain.
// Reads aplos/.env directly so we share the same credentials as the CLI scripts.

const APLOS_DIR = path.resolve(process.cwd(), "..", "aplos");
export const APLOS_BASE = "https://app.aplos.com/hermes/api/v1";

function loadAplosEnv() {
  const envText = readFileSync(path.join(APLOS_DIR, ".env"), "utf8");
  const env: Record<string, string> = {};
  for (const line of envText.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export async function getAccessToken(): Promise<string> {
  const env = loadAplosEnv();
  const clientId = env.APLOS_CLIENT_ID;
  const keyPath = env.APLOS_PRIVATE_KEY_PATH;
  if (!clientId || !keyPath) throw new Error("Missing APLOS_CLIENT_ID or APLOS_PRIVATE_KEY_PATH in aplos/.env");

  const rawKey = readFileSync(path.resolve(APLOS_DIR, keyPath), "utf8").trim();
  const pem = rawKey.includes("-----BEGIN")
    ? rawKey
    : `-----BEGIN PRIVATE KEY-----\n${rawKey.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;

  const res = await fetch(`${APLOS_BASE}/auth/${clientId}`);
  const body = await res.json();
  if (!body?.data?.token) throw new Error(`Aplos auth failed: ${JSON.stringify(body)}`);

  const privateKey = forge.pki.privateKeyFromPem(pem);
  return privateKey.decrypt(forge.util.decode64(body.data.token), "RSAES-PKCS1-V1_5");
}

export async function aplos(token: string, pathAndQuery: string, opts: { method?: string; body?: unknown } = {}) {
  const { method = "GET", body } = opts;
  const res = await fetch(`${APLOS_BASE}${pathAndQuery}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
