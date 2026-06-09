import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

// pdf-parse / pdfjs-dist normally bootstrap their worker by doing a dynamic
// import() of GlobalWorkerOptions.workerSrc. Under Next 16 + Turbopack that
// dynamic import is still intercepted even with serverExternalPackages set,
// producing paths like "C:/.../steward/[project]/steward/node_modules/...".
//
// Escape hatch: pdfjs skips that dynamic import entirely when
// globalThis.pdfjsWorker.WorkerMessageHandler is already populated (see
// PDFWorker.#mainThreadWorkerMessageHandler in pdfjs-dist/legacy/build/pdf.mjs).
// We load pdf.worker.mjs ourselves once, via a Function-wrapped dynamic import
// (Turbopack honors none of the standard /* @ignore */ pragmas), and stash the
// handler on globalThis where pdfjs looks for it.
let workerConfigured = false;
export async function ensurePdfWorker(): Promise<void> {
  if (workerConfigured) return;
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  );
  const workerUrl = pathToFileURL(workerPath).href;
  PDFParse.setWorker(workerUrl);
  const dynamicImport = new Function("u", "return import(u);") as (u: string) => Promise<unknown>;
  const mod = (await dynamicImport(workerUrl)) as { WorkerMessageHandler?: unknown };
  (globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler: unknown } }).pdfjsWorker = {
    WorkerMessageHandler: mod.WorkerMessageHandler,
  };
  workerConfigured = true;
}

// Convenience: extract plain text from a PDF buffer using a shared worker.
export async function pdfBufferToText(buffer: Buffer): Promise<string> {
  await ensurePdfWorker();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
