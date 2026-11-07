"use client";

import { useState, useRef, type DragEvent } from "react";
import { useRouter } from "next/navigation";

type UploadResult = {
  written: string[];
  skipped: { name: string; reason: string }[];
  restored: number;
};

export function PayrollUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      for (const f of list) fd.append("files", f);
      const res = await fetch("/api/payroll/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      setResult((await res.json()) as UploadResult);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) upload(e.dataTransfer.files);
  };

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
            {uploading ? "Uploading…" : "Drop a payroll CSV here"}
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
            Truist ACH payments export — one row per batch, recipients underneath. Re-uploading the same batches is safe.
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          disabled={uploading}
          className="px-3.5 py-2 rounded-full bg-forest text-bg font-ui text-[12px] font-semibold cursor-pointer disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Choose files"}
        </button>
        {result && (
          <div className="font-ui text-[10.5px] text-ink3 max-w-[300px] text-right">
            Wrote {result.written.length} file{result.written.length === 1 ? "" : "s"}
            {result.restored > 0 ? ` · restored ${result.restored} deleted batch${result.restored === 1 ? "" : "es"}` : ""}
            {result.skipped.length > 0 ? ` · skipped ${result.skipped.length} (${result.skipped.map((s) => `${s.name}: ${s.reason}`).join("; ")})` : ""}
          </div>
        )}
        {error && <div className="font-ui text-[10.5px] text-clay max-w-[300px] text-right">{error}</div>}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv"
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
