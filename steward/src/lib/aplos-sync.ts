import { getAccessToken, aplos } from "./aplos-auth";
import { prisma } from "./db";

type AplosAccount = {
  account_number: number;
  name: string;
  category?: string;
  is_enabled?: boolean;
};

type AplosFund = { id: number; name: string };

type AplosPurpose = {
  id: number;
  name: string;
  description?: string;
  is_enabled?: boolean;
  income_account?: { account_number: number; name: string };
  fund?: { id: number; name: string };
};

type AplosTag = { id: number; name: string; sub_tags?: AplosTag[] };
type AplosTagGroup = { tags?: AplosTag[] };
type AplosTagCategory = { id: number; name: string; tag_groups?: AplosTagGroup[] };

async function fetchAllPages<T>(token: string, firstPath: string, extract: (body: any) => T[]): Promise<T[]> {
  const all: T[] = [];
  let next: string | null = firstPath;
  while (next) {
    const { body } = await aplos(token, next);
    all.push(...extract(body));
    const link: string | undefined = body?.links?.next;
    next = link ? link.replace(/^\/api\/v1/, "") : null;
  }
  return all;
}

export async function syncAplosCache() {
  const token = await getAccessToken();

  // Accounts (paginated)
  const accounts = await fetchAllPages<AplosAccount>(
    token,
    "/accounts?page_size=200&page_num=1",
    (b) => b?.data?.accounts ?? []
  );

  // Funds (single page is enough at the church's scale; pass page_size for safety)
  const fundsResp = await aplos(token, "/funds?page_size=200");
  const funds: AplosFund[] = fundsResp.body?.data?.funds ?? [];

  // Purposes (giving purposes — used for contributions)
  const purposesResp = await aplos(token, "/purposes?page_size=200");
  const purposes: AplosPurpose[] = purposesResp.body?.data?.purposes ?? [];

  // Tags (nested under tagcategories -> tag_groups -> tags -> sub_tags)
  const tagsResp = await aplos(token, "/tags?page_size=200");
  const tagcategories: AplosTagCategory[] = tagsResp.body?.data?.tagcategories ?? [];

  type FlatTag = { id: number; name: string; category: string | null; parentId: number | null };
  const flatTags: FlatTag[] = [];
  for (const cat of tagcategories) {
    for (const group of cat.tag_groups ?? []) {
      for (const tag of group.tags ?? []) {
        flatTags.push({ id: tag.id, name: tag.name, category: cat.name, parentId: null });
        for (const sub of tag.sub_tags ?? []) {
          flatTags.push({ id: sub.id, name: sub.name, category: cat.name, parentId: tag.id });
        }
      }
    }
  }

  // Upsert into DB
  for (const a of accounts) {
    await prisma.account.upsert({
      where: { accountNumber: a.account_number },
      create: {
        accountNumber: a.account_number,
        name: a.name,
        category: a.category ?? null,
        isEnabled: a.is_enabled ?? true,
      },
      update: {
        name: a.name,
        category: a.category ?? null,
        isEnabled: a.is_enabled ?? true,
        syncedAt: new Date(),
      },
    });
  }

  for (const f of funds) {
    await prisma.fund.upsert({
      where: { id: f.id },
      create: { id: f.id, name: f.name },
      update: { name: f.name, syncedAt: new Date() },
    });
  }

  for (const p of purposes) {
    await prisma.purpose.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        isEnabled: p.is_enabled ?? true,
        incomeAccount: p.income_account?.account_number ?? null,
        fundId: p.fund?.id ?? null,
      },
      update: {
        name: p.name,
        description: p.description ?? null,
        isEnabled: p.is_enabled ?? true,
        incomeAccount: p.income_account?.account_number ?? null,
        fundId: p.fund?.id ?? null,
        syncedAt: new Date(),
      },
    });
  }

  for (const t of flatTags) {
    await prisma.tag.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, category: t.category, parentId: t.parentId },
      update: { name: t.name, category: t.category, parentId: t.parentId, syncedAt: new Date() },
    });
  }

  await prisma.syncState.upsert({
    where: { source: "aplos" },
    create: { source: "aplos", lastSyncAt: new Date() },
    update: { lastSyncAt: new Date(), lastError: null },
  });

  return {
    accounts: accounts.length,
    funds: funds.length,
    tags: flatTags.length,
    purposes: purposes.length,
  };
}
