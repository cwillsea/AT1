"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/imports", label: "Square imports" },
  { href: "/subsplash", label: "Subsplash imports" },
  { href: "/rules", label: "Rules" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-[220px] bg-bg border-r border-line p-4 flex flex-col gap-1 shrink-0">
      <div className="px-2 pt-1 pb-5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg bg-forest grid place-items-center text-bg font-display text-base font-semibold leading-none"
          >
            1
          </div>
          <div>
            <div className="font-ui font-semibold text-[13px] text-ink tracking-tight">After The One</div>
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.04em] uppercase">Steward</div>
          </div>
        </div>
      </div>

      {NAV.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-lg font-ui text-[13.5px] ${
              active
                ? "bg-forest-soft text-ink font-semibold"
                : "text-ink2 font-medium hover:bg-line2"
            }`}
          >
            {item.label}
          </Link>
        );
      })}

    </nav>
  );
}
