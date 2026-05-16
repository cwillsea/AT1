import { prisma } from "@/lib/db";

type Body = {
  externalKey: string;
  source?: string;
  marked: boolean;
  note?: string;
};

export async function POST(request: Request) {
  const data = (await request.json()) as Body;
  if (!data?.externalKey || typeof data.marked !== "boolean") {
    return Response.json({ error: "externalKey and marked required" }, { status: 400 });
  }

  if (data.marked) {
    await prisma.manualMark.upsert({
      where: { externalKey: data.externalKey },
      create: {
        externalKey: data.externalKey,
        source: data.source ?? "square",
        marked: true,
        note: data.note ?? null,
      },
      update: { marked: true, markedAt: new Date(), note: data.note ?? null },
    });
  } else {
    await prisma.manualMark.deleteMany({ where: { externalKey: data.externalKey } });
  }

  return Response.json({ ok: true, externalKey: data.externalKey, marked: data.marked });
}
