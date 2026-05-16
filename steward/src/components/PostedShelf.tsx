"use client";

import { useState, type ReactNode } from "react";

export function PostedShelf({
  count,
  children,
  defaultOpen = false,
}: {
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-[18px] py-2.5 rounded-xl bg-panel border border-line hover:bg-line2 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}
            className="text-ink2"
          >
            <path
              d="M 3 2 L 8 6 L 3 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-ui text-[12.5px] text-ink2 font-semibold">
            Previously posted
          </span>
          <span className="font-ui text-[11px] text-ink3">
            ({count} {count === 1 ? "card" : "cards"})
          </span>
        </div>
        <span className="font-ui text-[11px] text-ink3">{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="mt-3 flex flex-col gap-3.5 opacity-80">{children}</div>}
    </div>
  );
}
