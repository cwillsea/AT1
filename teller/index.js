import "dotenv/config";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  TELLER_ACCESS_TOKEN,
  TELLER_CERT_PATH,
  TELLER_KEY_PATH,
} = process.env;

if (!TELLER_ACCESS_TOKEN) throw new Error("TELLER_ACCESS_TOKEN missing from .env");
if (!TELLER_CERT_PATH)    throw new Error("TELLER_CERT_PATH missing from .env");
if (!TELLER_KEY_PATH)     throw new Error("TELLER_KEY_PATH missing from .env");

const cert = fs.readFileSync(path.resolve(__dirname, TELLER_CERT_PATH));
const key  = fs.readFileSync(path.resolve(__dirname, TELLER_KEY_PATH));

function tellerGet(pathname) {
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
          Authorization:
            "Basic " + Buffer.from(`${TELLER_ACCESS_TOKEN}:`).toString("base64"),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const { status, body } = await tellerGet("/accounts");
console.log("HTTP", status);
console.log(JSON.stringify(body, null, 2));
