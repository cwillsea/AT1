"use client";

import { useState, useRef, type DragEvent } from "react";

type Status = "idle" | "processing" | "done" | "error";

export function CreditCardAplosImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);

  const process = async (file: File) => {
    setStatus("processing");
    setErrorMsg(null);
    setWarnings([]);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/credit-card/aplos-import", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const rows = Number(res.headers.get("X-Aplos-Row-Count") ?? 0);
      const warnB64 = res.headers.get("X-Aplos-Warnings");
      // base64 of UTF-8 JSON — atob alone garbles the em dash into "â"
      const warns: string[] = warnB64
        ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(warnB64), (c) => c.charCodeAt(0))))
        : [];

      const blob = await res.blob();
      const outName = file.name.replace(/\.(csv|xlsx)$/i, "") + "-aplos.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = outName; a.click();
      URL.revokeObjectURL(url);

      setLastFile(outName);
      setRowCount(rows);
      setWarnings(warns);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) process(file);
  };

  const busy = status === "processing";

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`bg-panel border-2 border-dashed rounded-xl px-[18px] py-5 flex items-center justify-between gap-4 cursor-pointer transition-colors ${dragOver ? "border-forest bg-forest-soft/40" : "border-line hover:border-ink3"}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-forest-soft grid place-items-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" stroke="var(--color-forest)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="font-ui text-[13px] text-ink font-semibold">
              {busy ? "Processing…" : "Drop the reviewed resolved report here"}
            </div>
            <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
              Expects the step-2 file (<span className="font-mono">.xlsx</span> or <span className="font-mono">.csv</span>) with the two{" "}
              <em>Accountant Use</em> columns filled in. Downloads an Aplos import XLSX.
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); e.target.value = ""; }}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            disabled={busy}
            className="px-3.5 py-2 rounded-full bg-forest text-bg font-ui text-[12px] font-semibold cursor-pointer disabled:opacity-60"
          >
            {busy ? "Processing…" : "Choose file"}
          </button>
          {status === "done" && lastFile && (
            <div className="font-ui text-[10.5px] text-ink3 max-w-[300px] text-right">
              Downloaded <span className="font-mono">{lastFile}</span> ({rowCount} rows)
            </div>
          )}
          {status === "error" && errorMsg && (
            <div className="font-ui text-[10.5px] text-clay max-w-[300px] text-right">{errorMsg}</div>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="bg-panel border border-honey/40 rounded-xl px-[18px] py-3 font-ui text-[11.5px] text-ink2">
          <div className="font-semibold mb-1 text-ink">
            {warnings.length} row(s) needed a fallback — blank or unrecognized <em>Accountant Use</em> cells:
          </div>
          <ul className="list-disc pl-4 leading-tight">
            {warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}
            {warnings.length > 20 && <li>… and {warnings.length - 20} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
