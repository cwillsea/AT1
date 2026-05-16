"use client";

import { useState } from "react";
import { PayoutCard, type DepositForCard, type NameTable } from "./PayoutCard";
import { PostedShelf } from "./PostedShelf";

export function DepositList({
  deposits,
  names,
  initialMarkedKeys,
  initialDeletedKeys,
}: {
  deposits: DepositForCard[];
  names: NameTable;
  initialMarkedKeys: string[];
  initialDeletedKeys: string[];
}) {
  const [marked, setMarked] = useState<Set<string>>(new Set(initialMarkedKeys));
  const [deleted, setDeleted] = useState<Set<string>>(new Set(initialDeletedKeys));

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

  const visible = deposits.filter((d) => !deleted.has(d.id));
  const pending = visible.filter((d) => !marked.has(d.id));
  const posted = visible.filter((d) => marked.has(d.id));

  return (
    <>
      <div className="flex flex-col gap-3.5">
        {pending.map((d, i) => (
          <PayoutCard
            key={d.id}
            deposit={d}
            names={names}
            defaultExpanded={i === 0}
            manuallyPosted={false}
            onMarkChange={(next) => setMark(d.id, next)}
            onDelete={() => markDeleted(d.id)}
          />
        ))}
        {pending.length === 0 && (
          <div className="font-ui text-[12.5px] text-ink3 italic px-2">
            All caught up — every deposit has been marked posted or deleted.
          </div>
        )}
      </div>
      <PostedShelf count={posted.length}>
        {posted.map((d) => (
          <PayoutCard
            key={d.id}
            deposit={d}
            names={names}
            defaultExpanded={false}
            manuallyPosted={true}
            onMarkChange={(next) => setMark(d.id, next)}
            onDelete={() => markDeleted(d.id)}
          />
        ))}
      </PostedShelf>
    </>
  );
}
