"use client";

import { useState } from "react";
import { SubsplashCard } from "./SubsplashCard";
import { PostedShelf } from "./PostedShelf";
import type { Transfer } from "@/lib/subsplash-csv";

type PaymentTarget = { accountNumber: number; fundId: number; tagId: number };
type Names = { accounts: Record<number, string>; funds: Record<number, string>; tags: Record<number, string> };

export function TransferList({
  transfers,
  initialMarkedKeys,
  initialDeletedKeys,
  giftFundToPurpose = {},
  paymentSourceToTarget = {},
  names = { accounts: {}, funds: {}, tags: {} },
}: {
  transfers: Transfer[];
  initialMarkedKeys: string[];
  initialDeletedKeys: string[];
  giftFundToPurpose?: Record<string, string | null>;
  paymentSourceToTarget?: Record<string, PaymentTarget>;
  names?: Names;
}) {
  const [marked, setMarked] = useState<Set<string>>(new Set(initialMarkedKeys));
  const [deleted, setDeleted] = useState<Set<string>>(new Set(initialDeletedKeys));

  const externalKey = (t: Transfer) => `subsplash:${t.id}`;

  const setMark = (key: string, next: boolean) => {
    setMarked((prev) => {
      const out = new Set(prev);
      if (next) out.add(key);
      else out.delete(key);
      return out;
    });
  };
  const markDeleted = (key: string) => {
    setDeleted((prev) => {
      const out = new Set(prev);
      out.add(key);
      return out;
    });
  };

  const visible = transfers.filter((t) => !deleted.has(externalKey(t)));
  const pending = visible.filter((t) => !marked.has(externalKey(t)));
  const posted = visible.filter((t) => marked.has(externalKey(t)));

  return (
    <>
      <div className="flex flex-col gap-3.5">
        {pending.map((t, i) => (
          <SubsplashCard
            key={t.id}
            transfer={t}
            defaultExpanded={i === 0}
            manuallyPosted={false}
            onMarkChange={(next) => setMark(externalKey(t), next)}
            onDelete={() => markDeleted(externalKey(t))}
            giftFundToPurpose={giftFundToPurpose}
            paymentSourceToTarget={paymentSourceToTarget}
            names={names}
          />
        ))}
        {pending.length === 0 && transfers.length > 0 && (
          <div className="font-ui text-[12.5px] text-ink3 italic px-2">
            All caught up — every transfer has been marked posted or deleted.
          </div>
        )}
      </div>
      <PostedShelf count={posted.length}>
        {posted.map((t) => (
          <SubsplashCard
            key={t.id}
            transfer={t}
            defaultExpanded={false}
            manuallyPosted={true}
            onMarkChange={(next) => setMark(externalKey(t), next)}
            onDelete={() => markDeleted(externalKey(t))}
            giftFundToPurpose={giftFundToPurpose}
            paymentSourceToTarget={paymentSourceToTarget}
            names={names}
          />
        ))}
      </PostedShelf>
    </>
  );
}
