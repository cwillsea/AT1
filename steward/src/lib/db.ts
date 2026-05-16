import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";

// Resolve dev.db relative to the steward project root regardless of cwd.
const dbPath = path.resolve(process.cwd(), "dev.db");

const adapter = new PrismaBetterSqlite3({ url: dbPath });

// Single shared client. Next.js dev hot-reloads modules; cache the client on
// globalThis to avoid leaking connections across reloads.
const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = g.__prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;
