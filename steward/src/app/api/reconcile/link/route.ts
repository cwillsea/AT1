import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const { bankTxnId, aplosTxnId } = await req.json();
  if (typeof bankTxnId !== "string" || typeof aplosTxnId !== "string") {
    return NextResponse.json({ error: "bankTxnId and aplosTxnId required" }, { status: 400 });
  }
  // Drop any prior link on either side, then upsert. One-to-one in both directions.
  await prisma.reconcileMatch.deleteMany({
    where: { OR: [{ bankTxnId }, { aplosTxnId }] },
  });
  const row = await prisma.reconcileMatch.create({ data: { bankTxnId, aplosTxnId } });
  return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(req: Request) {
  const { bankTxnId, aplosTxnId } = await req.json();
  if (!bankTxnId && !aplosTxnId) {
    return NextResponse.json({ error: "bankTxnId or aplosTxnId required" }, { status: 400 });
  }
  const where = bankTxnId ? { bankTxnId } : { aplosTxnId };
  await prisma.reconcileMatch.deleteMany({ where });
  return NextResponse.json({ ok: true });
}
