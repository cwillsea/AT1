import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Set or clear the Aplos posting target on a single BankEntry.
// Body: { externalKey, accountNumber?, fundId?, tagId? }
// Passing null clears the field. Missing keys are left untouched.
export async function POST(request: Request) {
  const body = await request.json();
  const externalKey = String(body.externalKey ?? "");
  if (!externalKey) {
    return Response.json({ error: "externalKey is required" }, { status: 400 });
  }

  const data: { accountNumber?: number | null; fundId?: number | null; tagId?: number | null } = {};
  if ("accountNumber" in body) data.accountNumber = body.accountNumber === null ? null : Number(body.accountNumber) || null;
  if ("fundId" in body) data.fundId = body.fundId === null ? null : Number(body.fundId) || null;
  if ("tagId" in body) data.tagId = body.tagId === null ? null : Number(body.tagId) || null;

  await prisma.bankEntry.update({ where: { externalKey }, data });
  return Response.json({ ok: true });
}
