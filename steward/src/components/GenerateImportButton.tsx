"use client";

import { useState } from "react";

export function GenerateImportButton({ blockedByUnmatched = false }: { blockedByUnmatched?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (blockedByUnmatched) return;
    setLoading(true);
    try {
      const res = await fetch("/api/square/export");
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ?? "aplos-import.xlsx";
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = loading || blockedByUnmatched;

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      title={blockedByUnmatched ? "Resolve all unmatched items before generating" : undefined}
      className={`px-3.5 py-1.5 rounded-full font-ui text-[11.5px] transition-colors ${
        blockedByUnmatched
          ? "bg-ink3/20 text-ink3 cursor-not-allowed"
          : "bg-forest text-white cursor-pointer hover:bg-forest/90 disabled:opacity-50"
      }`}
    >
      {loading ? "Generating…" : "Generate Aplos Import"}
    </button>
  );
}
