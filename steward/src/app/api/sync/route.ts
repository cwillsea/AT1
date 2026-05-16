import { syncAplosCache } from "@/lib/aplos-sync";
import { syncSquare } from "@/lib/square-sync";

export async function POST() {
  const started = Date.now();
  const result: {
    aplos?: { accounts: number; funds: number; tags: number };
    square?: Awaited<ReturnType<typeof syncSquare>>;
    errors: Record<string, string>;
    ms: number;
  } = { errors: {}, ms: 0 };

  try {
    result.aplos = await syncAplosCache();
  } catch (e) {
    result.errors.aplos = e instanceof Error ? e.message : String(e);
  }

  try {
    result.square = await syncSquare();
  } catch (e) {
    result.errors.square = e instanceof Error ? e.message : String(e);
  }

  result.ms = Date.now() - started;
  const ok = Object.keys(result.errors).length === 0;
  return Response.json(result, { status: ok ? 200 : 207 });
}
