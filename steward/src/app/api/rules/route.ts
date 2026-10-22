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
  accountNumber?: number | null;
  fundId?: number | null;
  tagId?: number | null;
  purposeId?: number | null;
  label?: string | null;
};

export async function POST(request: Request) {
  const data = (await request.json()) as CreateBody;
  if (typeof data.pattern !== "string") {
    return Response.json({ error: "pattern is required" }, { status: 400 });
  }
  const rule = await prisma.categorizationRule.create({
    data: {
      source: data.source ?? "square",
      matchType: data.matchType ?? "contains",
      pattern: data.pattern,
      priority: data.priority ?? 0,
      accountNumber: data.accountNumber ?? null,
      fundId: data.fundId ?? null,
      tagId: data.tagId ?? null,
      purposeId: data.purposeId ?? null,
      label: data.label ?? null,
    },
  });
  return Response.json({ rule });
}
