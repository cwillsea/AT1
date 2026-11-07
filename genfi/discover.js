// Discovery pass for the GenFi borrower portal (no public API).
//
// Opens a real Chromium window with a persistent profile. Log in by hand
// (handles MFA), click through each loan's Overview / Transactions / Loan
// Details tabs, expand a few payment rows, then close the window. Every JSON
// response the portal loads is saved to captures/ so we can find the backend
// endpoints and build the real fetcher against those instead of the DOM.
//
// Usage: GENFI_URL=https://<portal-url> node discover.js   (or set it in .env)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { GENFI_URL } = process.env;
if (!GENFI_URL) throw new Error("GENFI_URL missing — set it in .env or the environment");

const profileDir = path.join(__dirname, ".profile");
const capturesDir = path.join(__dirname, "captures", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(capturesDir, { recursive: true });

const index = [];
let n = 0;

const context = await chromium.launchPersistentContext(profileDir, { headless: false, viewport: null });
const page = context.pages()[0] ?? (await context.newPage());

context.on("response", async (res) => {
  const type = res.headers()["content-type"] ?? "";
  if (!type.includes("json")) return;
  const req = res.request();
  let body;
  try {
    body = await res.json();
  } catch {
    return; // redirects, empty bodies, etc.
  }
  const file = `${String(++n).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(capturesDir, file), JSON.stringify(body, null, 2));
  index.push({ file, method: req.method(), status: res.status(), url: res.url() });
  fs.writeFileSync(path.join(capturesDir, "index.json"), JSON.stringify(index, null, 2));
  console.log(`${file}  ${req.method()} ${res.status()}  ${res.url()}`);
});

await page.goto(GENFI_URL);
console.log("\nLog in and click through each loan. Close the browser window when done.\n");

await new Promise((resolve) => context.on("close", resolve));
console.log(`\nSaved ${n} JSON responses to ${capturesDir}`);
