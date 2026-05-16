import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PatchBody = Partial<{
  pattern: string;
  matchType: string;
  priority: number;
  accountNumber: number;
  fundId: number;
  tagId: number;
  label: string | null;
}>;

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return Response.json({ error: "bad id" }, { status: 400 });
  const data = (await request.json()) as PatchBody;
  const rule = await prisma.categorizationRule.update({
    where: { id: numericId },
    data,
  });
  return Response.json({ rule });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return Response.json({ error: "bad id" }, { status: 400 });
  await prisma.categorizationRule.delete({ where: { id: numericId } });
  return Response.json({ ok: true });
}
