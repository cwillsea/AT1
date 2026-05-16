import { prisma } from "@/lib/db";

type Body = {
  externalKey: string;
  source?: string;
  deleted: boolean;
  reason?: string;
};

export async function POST(request: Request) {
  const data = (await request.json()) as Body;
  if (!data?.externalKey || typeof data.deleted !== "boolean") {
    return Response.json({ error: "externalKey and deleted required" }, { status: 400 });
  }

  if (data.deleted) {
    await prisma.deletedDeposit.upsert({
      where: { externalKey: data.externalKey },
      create: {
        externalKey: data.externalKey,
        source: data.source ?? "square",
        reason: data.reason ?? null,
      },
      update: { deletedAt: new Date(), reason: data.reason ?? null },
    });
  } else {
    await prisma.deletedDeposit.deleteMany({ where: { externalKey: data.externalKey } });
  }

  return Response.json({ ok: true, externalKey: data.externalKey, deleted: data.deleted });
}
