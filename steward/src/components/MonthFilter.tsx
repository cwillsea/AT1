"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthOptions(count = 12): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    out.push({ value, label });
  }
  return out;
}

export function MonthFilter({ selected }: { selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const options = monthOptions(3);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("month", e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={selected}
      onChange={onChange}
      className="font-ui text-[12.5px] text-ink bg-bg border border-line rounded-lg px-3 py-1.5 hover:border-ink3 focus:outline-none focus:border-forest"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
