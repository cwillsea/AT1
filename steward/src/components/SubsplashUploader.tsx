"use client";

import { useState, useRef, type DragEvent } from "react";
import { useRouter } from "next/navigation";

type UploadResult = {
  written: string[];
  skipped: { name: string; reason: string }[];
};

type FileKind = "gifts" | "payments" | "both";

// Files exported from Subsplash without going through the zip flow don't
// carry a gifts-/payments- prefix in their name, but the upload route (and
// loadAllTransfers) key off that prefix to tell the two CSV types apart.
// Renaming client-side lets the user tell us which kind it is instead of
// relying on the filename.
function renameForKind(file: File, kind: "gifts" | "payments"): File {
  if (/^(gifts|payments)/i.test(file.name)) return file;
  return new File([file], `${kind}-${file.name}`, { type: file.type, lastModified: file.lastModified });
}

export function SubsplashUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<FileKind>("both");

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      const list = Array.from(files);
      if (list.length === 0) return;
      for (const f of list) fd.append("files", f);
      const res = await fetch("/api/subsplash/upload", { method: "POST", body: fd });
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

  const openModal = (files?: FileList | File[]) => {
    setPendingFiles(files ? Array.from(files) : []);
    setKind("both");
    setModalOpen(true);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) openModal(e.dataTransfer.files);
  };

  const confirmUpload = () => {
    const files = pendingFiles.map((f) => {
      if (kind === "both" || f.name.toLowerCase().endsWith(".zip")) return f;
      return renameForKind(f, kind);
    });
    setModalOpen(false);
    upload(files);
    setPendingFiles([]);
  };

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => openModal()}
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
              {uploading ? "Uploading…" : "Drop CSVs or a .zip here"}
            </div>
            <div className="font-ui text-[11.5px] text-ink3 mt-0.5">
              Accepts <span className="font-mono">gifts-*.csv</span>, <span className="font-mono">payments-*.csv</span>, or a zip containing them.
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openModal(); }}
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

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.zip"
        className="hidden"
        onChange={(e) => { if (e.target.files && e.target.files.length > 0) setPendingFiles(Array.from(e.target.files)); }}
      />

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink/30 grid place-items-center"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-bg border border-line rounded-2xl shadow-xl w-[440px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-line">
              <div className="font-display text-[16px] text-ink font-medium">Upload Subsplash export</div>
              <div className="font-ui text-[11.5px] text-ink3 mt-1">
                Tell us what kind of file(s) you&apos;re uploading, then choose them.
              </div>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as FileKind)}
                className="w-full border border-line rounded-md px-3 py-2 font-ui text-[13px] text-ink bg-panel"
              >
                <option value="both">Both / already named correctly</option>
                <option value="gifts">Gifts (tithes &amp; giving)</option>
                <option value="payments">Payments</option>
              </select>
              <div className="font-ui text-[11px] text-ink3">
                Pick Gifts or Payments if the exported file doesn&apos;t have a{" "}
                <span className="font-mono">gifts-</span> or <span className="font-mono">payments-</span> prefix in its name — we&apos;ll tag it before uploading. Zip files are left as-is.
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="border border-dashed border-line rounded-lg px-3 py-4 font-ui text-[12.5px] text-ink2 hover:border-ink3 hover:bg-line2/40 text-center"
              >
                {pendingFiles.length > 0
                  ? `${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"}: ${pendingFiles.map((f) => f.name).join(", ")}`
                  : "Click to choose files…"}
              </button>
            </div>

            <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
              <button
                onClick={() => { setModalOpen(false); setPendingFiles([]); }}
                className="font-ui text-[11.5px] text-ink2 px-3 py-1.5 rounded-md hover:bg-line2"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpload}
                disabled={pendingFiles.length === 0}
                className="px-3.5 py-1.5 rounded-full bg-forest text-bg font-ui text-[12px] font-semibold cursor-pointer disabled:opacity-60"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
