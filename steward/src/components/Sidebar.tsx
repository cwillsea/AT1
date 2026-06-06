"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/imports", label: "Square imports", abbr: "Sq" },
  { href: "/subsplash", label: "Subsplash imports", abbr: "Su" },
  { href: "/bank", label: "Bank reconciliation", abbr: "Bk" },
  { href: "/credit-card", label: "Credit card", abbr: "CC" },
  { href: "/rules", label: "Rules", abbr: "Ru" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      className={`bg-bg border-r border-line p-4 flex flex-col gap-1 shrink-0 transition-[width] duration-200 ${
        collapsed ? "w-[56px]" : "w-[220px]"
      }`}
    >
      {/* Logo row with collapse toggle */}
      <div className={`pt-1 pb-5 flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-forest grid place-items-center text-bg font-display text-base font-semibold leading-none shrink-0">
              1
            </div>
            <div>
              <div className="font-ui font-semibold text-[13px] text-ink tracking-tight">After The One</div>
              <div className="font-ui text-[10.5px] text-ink3 tracking-[0.04em] uppercase">Steward</div>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-5 h-5 grid place-items-center rounded text-ink3 hover:text-ink2 hover:bg-line2 transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
          >
            <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Nav items */}
      {NAV.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={`rounded-lg font-ui text-[13.5px] flex items-center gap-2.5 ${
              collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
            } ${
              active
                ? "bg-forest-soft text-ink font-semibold"
                : "text-ink2 font-medium hover:bg-line2"
            }`}
          >
            {collapsed ? (
              <span className="font-mono text-[11px] w-7 text-center">{item.abbr}</span>
            ) : (
              item.label
            )}
          </Link>
        );
      })}
    </nav>
  );
}
