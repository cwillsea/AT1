export function fmtUSD(n: number, opts: { sign?: boolean; cents?: boolean } = {}) {
  const { sign = false, cents = true } = opts;
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const lead = n < 0 ? "−" : sign ? "+" : "";
  return `${lead}$${s}`;
}

// "2026-04-22" → "Apr 22"
export function fmtShortDate(iso: string) {
  try {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}
