// Reads an uploaded spreadsheet into a plain string grid, accepting either CSV
// or XLSX. Step 3 of the credit-card flow takes back the file step 2 handed
// out — which is an .xlsx — but treasurers often re-save as .csv from Excel,
// so both have to work.

import * as XLSX from "xlsx";
import { parseCsv } from "./credit-card-mappings";

// XLSX magic bytes: every .xlsx is a zip, so it starts "PK\x03\x04".
function looksLikeXlsx(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

// Excel may hand a date column back as a real date cell rather than the text
// we wrote. Normalize those to the MM/DD/YYYY the rest of the pipeline expects.
function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${v.getFullYear()}`;
  }
  return String(v).trim();
}

export async function readSheet(file: File): Promise<string[][]> {
  const buf = Buffer.from(await file.arrayBuffer());

  if (looksLikeXlsx(buf)) {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("Workbook has no sheets");
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: true });
    return grid.map((row) => row.map(cellToString));
  }

  return parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
}
