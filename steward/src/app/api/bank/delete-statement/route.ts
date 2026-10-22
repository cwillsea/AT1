import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Hard-delete an entire uploaded statement: every BankEntry for the given
// month, its BankStatement summary row, and any lingering bank-scoped
// ManualMark / DeletedDeposit flags. Used to clear out a bad/weird upload so
// the treasurer can re-upload a clean PDF (upsert would otherwise keep stale
// entries whose keys no longer match the new parse).
export async function POST(request: Request) {
  const { statementMonth } = (await request.json()) as { statementMonth?: string };
  if (!statementMonth) {
    return new Response("statementMonth required", { status: 400 });
  }

  const keyPrefix = `bank:${statementMonth}:`;

  const [entries] = await prisma.$transaction([
    prisma.bankEntry.deleteMany({ where: { externalKey: { startsWith: keyPrefix } } }),
    prisma.bankStatement.deleteMany({ where: { statementMonth } }),
    prisma.manualMark.deleteMany({ where: { source: "bank", externalKey: { startsWith: keyPrefix } } }),
    prisma.deletedDeposit.deleteMany({ where: { source: "bank", externalKey: { startsWith: keyPrefix } } }),
  ]);

  return Response.json({ deleted: entries.count });
}
