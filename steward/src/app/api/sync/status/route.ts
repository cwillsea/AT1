import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [aplosCount, fundCount, tagCount, syncStates] = await Promise.all([
    prisma.account.count(),
    prisma.fund.count(),
    prisma.tag.count(),
    prisma.syncState.findMany(),
  ]);
  const stateByKey = Object.fromEntries(syncStates.map((s) => [s.source, s]));

  return Response.json({
    aplos: {
      connected: aplosCount > 0,
      counts: { accounts: aplosCount, funds: fundCount, tags: tagCount },
      lastSyncAt: stateByKey.aplos?.lastSyncAt ?? null,
    },
    square: {
      connected: !!stateByKey.square?.lastSyncAt,
      lastSyncAt: stateByKey.square?.lastSyncAt ?? null,
      lastFetchedThrough: stateByKey.square?.lastFetchedThrough ?? null,
    },
    bank: { connected: false, lastSyncAt: null },
    subsplash: { connected: false, lastSyncAt: null },
  });
}
