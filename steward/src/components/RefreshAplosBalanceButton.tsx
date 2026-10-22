"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshAplosBalanceButton({ accountNumber }: { accountNumber: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/aplos/refresh-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={refresh}
      disabled={busy}
      className="font-ui text-[10.5px] text-ink3 hover:text-ink2 underline disabled:opacity-50"
      title={err ?? "Recompute by summing every GL line on the account"}
    >
      {busy ? "computing…" : err ? "retry" : "refresh"}
    </button>
  );
}
