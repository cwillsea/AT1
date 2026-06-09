import { readFileSync } from "node:fs";
import path from "node:path";
import https from "node:https";

const TELLER_DIR = path.resolve(process.cwd(), "..", "teller");

function loadTellerEnv() {
  const envText = readFileSync(path.join(TELLER_DIR, ".env"), "utf8");
  const env: Record<string, string> = {};
  for (const line of envText.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

let cached: { cert: Buffer; key: Buffer; token: string } | null = null;
function getCreds() {
  if (cached) return cached;
  const env = loadTellerEnv();
  if (!env.TELLER_ACCESS_TOKEN) throw new Error("TELLER_ACCESS_TOKEN missing from teller/.env");
  if (!env.TELLER_CERT_PATH)    throw new Error("TELLER_CERT_PATH missing from teller/.env");
  if (!env.TELLER_KEY_PATH)     throw new Error("TELLER_KEY_PATH missing from teller/.env");
  cached = {
    cert: readFileSync(path.resolve(TELLER_DIR, env.TELLER_CERT_PATH)),
    key:  readFileSync(path.resolve(TELLER_DIR, env.TELLER_KEY_PATH)),
    token: env.TELLER_ACCESS_TOKEN,
  };
  return cached;
}

export async function tellerGet<T = unknown>(pathname: string): Promise<{ status: number; body: T }> {
  const { cert, key, token } = getCreds();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: "api.teller.io",
        port: 443,
        method: "GET",
        path: pathname,
        cert,
        key,
        headers: {
          Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64"),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: (body ? JSON.parse(body) : null) as T });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

export type TellerAccount = {
  id: string;
  name: string;
  type: string;
  subtype: string;
  currency: string;
  last_four: string;
  status: string;
  enrollment_id: string;
  institution: { name: string; id: string };
  links: { balances: string; transactions: string; details: string; self: string };
};

export type TellerBalances = {
  account_id: string;
  ledger: string;
  available: string;
  links: { account: string; self: string };
};

export type TellerTransaction = {
  id: string;
  account_id: string;
  date: string;
  description: string;
  amount: string;
  type: string;
  status: "posted" | "pending";
  running_balance: string | null;
  details: {
    category?: string | null;
    processing_status?: string;
    counterparty?: { name?: string; type?: string };
  };
};
