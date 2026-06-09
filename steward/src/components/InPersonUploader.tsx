"use client";

import { useState, useRef, type DragEvent } from "react";
import { useRouter } from "next/navigation";

type UploadResult = {
  written: string[];
  skipped: { name: string; reason: string }[];
};

export function InPersonUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      const list = Array.from(files);
      if (list.length === 0) return;
      for (const f of list) fd.append("files", f);
      const res = await fetch("/api/in-person/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as UploadResult;
      setResult(data);
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
            {uploading ? "Uploading…" : "Drop a batch CSV or .zip here"}
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
            Subsplash contribution-batch export (e.g. <span className="font-mono">5_3_26-2026-05-14.csv</span>).
            Cash + check gifts, no fees.
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.zip"
          className="hidden"
          onChange={(e) => { if (e.target.files && e.target.files.length > 0) upload(e.target.files); }}
        />
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
            {result.skipped.length > 0 ? ` · skipped ${result.skipped.length} (${result.skipped.map((s) => `${s.name}: ${s.reason}`).join("; ")})` : ""}
          </div>
        )}
        {error && (
          <div className="font-ui text-[10.5px] text-clay max-w-[300px] text-right">{error}</div>
        )}
      </div>
    </div>
  );
}
