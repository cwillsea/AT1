// Read-only SQL gateway for the chat agent. The AI can only reach the database
// through runLedgerQuery(), which enforces: a single statement, SELECT/WITH only,
// no data-modifying or schema/connection keywords, and a row cap. In SQLite a
// lone SELECT cannot mutate data, so "single statement starting with SELECT/WITH"
// is the load-bearing guarantee; the keyword denylist is defense-in-depth.
import { prisma } from "./db";

const MAX_ROWS = 500;

// Returns null if allowed, otherwise a human-readable rejection reason.
export function validateSelect(sql: string): string | null {
  const trimmed = sql.trim().replace(/;\s*$/, ""); // tolerate one trailing semicolon
  if (!trimmed) return "Empty query.";
  if (trimmed.includes(";")) return "Only a single statement is allowed (no semicolons).";
  if (!/^(select|with)\b/i.test(trimmed)) return "Only read-only SELECT queries are allowed.";
  // Whole-word match so columns like createdAt / modifiedAt are unaffected.
  const banned = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|truncate|begin|commit|rollback|savepoint|grant|revoke)\b/i;
  const m = trimmed.match(banned);
  if (m) return `Disallowed keyword: ${m[1]}.`;
  return null;
}

// $queryRawUnsafe returns BigInt for COUNT(*)/integer aggregates, which JSON
// can't serialize. Convert BigInt -> Number so results are safe for both the
// API response and the tool-result payload sent back to Claude.
function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}

export type LedgerQueryResult =
  | { ok: true; rows: unknown[]; rowCount: number; truncated: boolean }
  | { ok: false; error: string };

export async function runLedgerQuery(sql: string): Promise<LedgerQueryResult> {
  const reason = validateSelect(sql);
  if (reason) return { ok: false, error: reason };
  const clean = sql.trim().replace(/;\s*$/, "");
  try {
    const raw = (await prisma.$queryRawUnsafe(clean)) as unknown[];
    const rows = toJsonSafe(raw);
    const truncated = rows.length > MAX_ROWS;
    return { ok: true, rows: truncated ? rows.slice(0, MAX_ROWS) : rows, rowCount: rows.length, truncated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
