import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "square";
  const rules = await prisma.categorizationRule.findMany({
    where: { source },
    orderBy: [{ priority: "desc" }, { id: "asc" }],
  });
  return Response.json({ rules });
}

type CreateBody = {
  source?: string;
  pattern: string;
  matchType?: string;
  priority?: number;
  accountNumber: number;
  fundId: number;
  tagId: number;
  label?: string | null;
};

export async function POST(request: Request) {
  const data = (await request.json()) as CreateBody;
  if (
    typeof data.pattern !== "string" ||
    typeof data.accountNumber !== "number" ||
    typeof data.fundId !== "number" ||
    typeof data.tagId !== "number"
  ) {
    return Response.json({ error: "pattern, accountNumber, fundId, tagId required" }, { status: 400 });
  }
  const rule = await prisma.categorizationRule.create({
    data: {
      source: data.source ?? "square",
      matchType: data.matchType ?? "contains",
      pattern: data.pattern,
      priority: data.priority ?? 0,
      accountNumber: data.accountNumber,
      fundId: data.fundId,
      tagId: data.tagId,
      label: data.label ?? null,
    },
  });
  return Response.json({ rule });
}
