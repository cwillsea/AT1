"use client";

import { useState } from "react";

export function GenerateImportButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
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

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-3.5 py-1.5 rounded-full bg-forest text-white font-ui text-[11.5px] cursor-pointer disabled:opacity-50"
    >
      {loading ? "Generating…" : "Generate Aplos Import"}
    </button>
  );
}
