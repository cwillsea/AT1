"use client";

import { useState, useRef, type DragEvent } from "react";

type Status = "idle" | "processing" | "done" | "error";

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let field = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { field += line[i++]; }
      }
      fields.push(field);
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) { fields.push(line.slice(i).trim()); break; }
      else { fields.push(line.slice(i, end).trim()); i = end + 1; }
    }
  }
  return fields;
}

function encodeField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toRow(values: string[]): string {
  return values.map(encodeField).join(",");
}

function transform(raw: string): string {
  const text = raw.replace(/^﻿/, ""); // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = parseLine(lines[0]).map((h) => h.trim());

  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? row[idx].trim() : "";
  };

  const outputHeaders = [
    "Cardholder Name",
    "Transaction Date",
    "Merchant Name",
    "Amount",
    "MCC Description",
    "Expense Type",
    "Ministry / Ministry Event",
    "Accountant Use: Final Expense Type",
    "Accountant Use: Final Ministry Type",
  ];

  const outputRows = lines.slice(1).map(parseLine).map((row) => {
    const diverted = col(row, "Diverted From Cardholder Name");
    return [
      diverted || col(row, "Cardholder Name"),
      col(row, "Tran Date"),
      col(row, "Merchant Name"),
      col(row, "Amount"),
      col(row, "MCC Description"),
      "",
      "",
      "",
      "",
    ];
  });

  return "﻿" + [toRow(outputHeaders), ...outputRows.map(toRow)].join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreditCardUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);

  const process = (file: File) => {
    setStatus("processing");
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = e.target?.result as string;
        const output = transform(raw);
        const outName = file.name.replace(/\.csv$/i, "") + "-expense-report.csv";
        downloadCsv(output, outName);
        setLastFile(outName);
        setStatus("done");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    };
    reader.onerror = () => { setErrorMsg("Could not read file"); setStatus("error"); };
    reader.readAsText(file, "utf-8");
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) process(file);
  };

  const busy = status === "processing";

  return (
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
            {busy ? "Processing…" : "Drop your Truist CSV here"}
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
            Accepts <span className="font-mono">CommercialCardTransactionDetails_*.csv</span> — downloads transformed file instantly.
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
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
            Downloaded <span className="font-mono">{lastFile}</span>
          </div>
        )}
        {status === "error" && errorMsg && (
          <div className="font-ui text-[10.5px] text-clay max-w-[300px] text-right">{errorMsg}</div>
        )}
      </div>
    </div>
  );
}
