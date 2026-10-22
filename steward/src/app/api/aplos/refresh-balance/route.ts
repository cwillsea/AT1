import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAccessToken } from "@/lib/aplos-auth";
import { computeAplosAccountBalance } from "@/lib/aplos-transactions";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min — full-history sum is slow

export async function POST(req: Request) {
  const { accountNumber } = await req.json().catch(() => ({}));
  const acct = typeof accountNumber === "number" ? accountNumber : 1110;
  const token = await getAccessToken();
  const { balance, txnCount } = await computeAplosAccountBalance(token, acct);
  await prisma.aplosAccountBalance.upsert({
    where: { accountNumber: acct },
    create: { accountNumber: acct, balance, txnCount },
    update: { balance, txnCount, computedAt: new Date() },
  });
  return NextResponse.json({ ok: true, balance, txnCount });
}
