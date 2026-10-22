"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtUSD, fmtShortDate } from "@/lib/fmt";

type Candidate = {
  id: string;
  date: string;
  amount: number;       // signed dollars
  description: string;  // bank: description; aplos: note/memo/contact
  badge?: string;       // optional secondary label
};

export function ManualLinkButton({
  side,
  selfId,
  selfAmount,
  candidates,
}: {
  side: "bank" | "books";   // which side this button lives on
  selfId: string;           // the txn id we're linking FROM
  selfAmount: number;       // for the ±$1 default filter
  candidates: Candidate[];  // opposite-side unmatched rows
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = showAll
    ? candidates
    : candidates.filter((c) => Math.abs(Math.abs(c.amount) - Math.abs(selfAmount)) <= 1);

  async function pick(otherId: string) {
    setError(null);
    const body = side === "bank"
      ? { bankTxnId: selfId, aplosTxnId: otherId }
      : { bankTxnId: otherId, aplosTxnId: selfId };
    try {
      const res = await fetch("/api/reconcile/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-ui text-[11px] text-ink2 hover:text-ink border border-line rounded-md px-2 py-1 hover:bg-line2"
      >
        Manually link…
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/30 grid place-items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-bg border border-line rounded-2xl shadow-xl w-[640px] max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div className="font-display text-[16px] text-ink font-medium">
                Link to {side === "bank" ? "Aplos transaction" : "bank transaction"}
              </div>
              <label className="font-ui text-[11.5px] text-ink3 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                />
                Show all amounts
              </label>
            </div>

            <div className="overflow-auto">
              {filtered.length === 0 ? (
                <div className="px-5 py-8 text-center font-ui text-[12.5px] text-ink3">
                  No unmatched {side === "bank" ? "Aplos" : "bank"} entries
                  {showAll ? "" : " within $1 of this amount"}.
                </div>
              ) : (
                <table className="w-full font-ui text-[12.5px]">
                  <tbody>
                    {filtered.map((c) => (
                      <tr
                        key={c.id}
                        className="border-t border-line hover:bg-line2/40 cursor-pointer"
                        onClick={() => pick(c.id)}
                      >
                        <td className="px-4 py-2.5 text-ink3 font-mono text-[11.5px] w-[90px]">
                          {fmtShortDate(c.date)}
                        </td>
                        <td className="px-4 py-2.5 text-ink">{c.description}</td>
                        {c.badge && (
                          <td className="px-2 py-2.5 text-ink3 font-mono text-[10.5px]">{c.badge}</td>
                        )}
                        <td className={`px-4 py-2.5 text-right tabular-nums font-mono ${c.amount >= 0 ? "text-forest" : "text-ink"}`}>
                          {fmtUSD(c.amount, { sign: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-line flex items-center justify-between">
              <div className="font-ui text-[11.5px] text-ink3">
                {error && <span className="text-red-600">Link failed: {error}</span>}
                {pending && !error && "Refreshing…"}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="font-ui text-[11.5px] text-ink2 px-3 py-1.5 rounded-md hover:bg-line2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Optional: small "Unlink" pill for rows already in Matched section.
export function UnlinkButton({ bankTxnId }: { bankTxnId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  async function unlink() {
    await fetch("/api/reconcile/link", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankTxnId }),
    });
    startTransition(() => router.refresh());
  }
  return (
    <button
      onClick={unlink}
      className="font-ui text-[10.5px] text-ink3 hover:text-ink2 underline"
    >
      unlink
    </button>
  );
}
