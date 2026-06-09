"use client";

import { useState, type ReactNode } from "react";

type TabKey = "online" | "in-person";

export function SubsplashTabs({
  online,
  inPerson,
  onlineCount,
  inPersonCount,
}: {
  online: ReactNode;
  inPerson: ReactNode;
  onlineCount: number;
  inPersonCount: number;
}) {
  const [tab, setTab] = useState<TabKey>("online");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-1 border-b border-line">
        <TabButton active={tab === "online"} onClick={() => setTab("online")} label="Online Giving" count={onlineCount} />
        <TabButton active={tab === "in-person"} onClick={() => setTab("in-person")} label="In-Person Giving" count={inPersonCount} />
      </div>
      <div>{tab === "online" ? online : inPerson}</div>
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 font-ui text-[12.5px] font-semibold cursor-pointer border-b-2 -mb-px transition-colors ${
        active ? "border-forest text-ink" : "border-transparent text-ink3 hover:text-ink2"
      }`}
    >
      {label}
      <span className="ml-2 font-mono text-[10.5px] opacity-70">{count}</span>
    </button>
  );
}
