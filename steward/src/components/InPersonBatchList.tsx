"use client";

import { useState } from "react";
import { InPersonBatchCard } from "./InPersonBatchCard";
import { PostedShelf } from "./PostedShelf";
import type { InPersonBatch } from "@/lib/in-person-csv";

export function InPersonBatchList({
  batches,
  initialMarkedKeys,
  initialDeletedKeys,
  giftFundToPurpose = {},
}: {
  batches: InPersonBatch[];
  initialMarkedKeys: string[];
  initialDeletedKeys: string[];
  giftFundToPurpose?: Record<string, string | null>;
}) {
  const [marked, setMarked] = useState<Set<string>>(new Set(initialMarkedKeys));
  const [deleted, setDeleted] = useState<Set<string>>(new Set(initialDeletedKeys));

  const externalKey = (b: InPersonBatch) => `in-person:${b.id}`;

  const setMark = (key: string, next: boolean) => {
    setMarked((prev) => {
      const out = new Set(prev);
      if (next) out.add(key);
      else out.delete(key);
      return out;
    });
  };
  const markDeleted = (key: string) => {
    setDeleted((prev) => new Set(prev).add(key));
  };

  const visible = batches.filter((b) => !deleted.has(externalKey(b)));
  const pending = visible.filter((b) => !marked.has(externalKey(b)));
  const posted = visible.filter((b) => marked.has(externalKey(b)));

  return (
    <>
      <div className="flex flex-col gap-3.5">
        {pending.map((b, i) => (
          <InPersonBatchCard
            key={b.id}
            batch={b}
            defaultExpanded={i === 0}
            manuallyPosted={false}
            onMarkChange={(next) => setMark(externalKey(b), next)}
            onDelete={() => markDeleted(externalKey(b))}
            giftFundToPurpose={giftFundToPurpose}
          />
        ))}
        {pending.length === 0 && batches.length > 0 && (
          <div className="font-ui text-[12.5px] text-ink3 italic px-2">
            All caught up — every batch has been marked posted or deleted.
          </div>
        )}
      </div>
      <PostedShelf count={posted.length}>
        {posted.map((b) => (
          <InPersonBatchCard
            key={b.id}
            batch={b}
            defaultExpanded={false}
            manuallyPosted={true}
            onMarkChange={(next) => setMark(externalKey(b), next)}
            onDelete={() => markDeleted(externalKey(b))}
            giftFundToPurpose={giftFundToPurpose}
          />
        ))}
      </PostedShelf>
    </>
  );
}
