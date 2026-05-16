import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });
const keys = Object.keys(prisma).filter((k) => !k.startsWith("$") && !k.startsWith("_")).sort();
console.log("Models on prisma:", keys);
process.exit(0);
