import { syncAplosCache } from "@/lib/aplos-sync";
import { syncAplosLedger } from "@/lib/aplos-ledger-sync";
import { syncSquare } from "@/lib/square-sync";

export async function POST(req: Request) {
  const started = Date.now();

  // Optional { source: "aplos" | "square" } narrows the sync to a single
  // connector. Absent / unrecognized → sync everything (existing behavior).
  let source: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.source === "string") source = body.source;
  } catch {
    /* no body → sync all */
  }

  const runAplos = source === undefined || source === "aplos";
  const runSquare = source === undefined || source === "square";

  const result: {
    aplos?: { accounts: number; funds: number; tags: number };
    aplosLedger?: Awaited<ReturnType<typeof syncAplosLedger>>;
    square?: Awaited<ReturnType<typeof syncSquare>>;
    errors: Record<string, string>;
    ms: number;
  } = { errors: {}, ms: 0 };

  if (runAplos) {
    // Chart-of-accounts cache first so ledger line references resolve, then the
    // ledger itself. A ledger failure is reported separately from the cache.
    try {
      result.aplos = await syncAplosCache();
    } catch (e) {
      result.errors.aplos = e instanceof Error ? e.message : String(e);
    }
    try {
      result.aplosLedger = await syncAplosLedger();
    } catch (e) {
      result.errors.aplosLedger = e instanceof Error ? e.message : String(e);
    }
  }

  if (runSquare) {
    try {
      result.square = await syncSquare();
    } catch (e) {
      result.errors.square = e instanceof Error ? e.message : String(e);
    }
  }

  result.ms = Date.now() - started;
  const ok = Object.keys(result.errors).length === 0;
  return Response.json(result, { status: ok ? 200 : 207 });
}
