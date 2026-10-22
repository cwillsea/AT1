// Step 3 of the credit-card flow: the treasurer uploads the resolved report
// (reviewed, possibly hand-edited) and gets the Aplos GL import back. The two
// "Accountant Use" columns are the source of truth here — see
// transformFromResolved() — so edits made in Excel survive into the import.

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  loadAplosNames, accountName, fundName, tagName, tagParentId,
  accountNumberFromLabel, tagIdFromLabel,
} from "@/lib/aplos-lookup";
import { loadCreditCardRules } from "@/lib/credit-card-rules";
import { readSheet } from "@/lib/sheet-input";
import { transformFromResolved } from "@/lib/credit-card-mappings";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const [names, rules] = await Promise.all([loadAplosNames(), loadCreditCardRules()]);

  let result;
  try {
    const grid = await readSheet(file);
    result = transformFromResolved(grid, rules, {
      accountName: (n) => accountName(names, n),
      fundName: (id) => fundName(names, id),
      tagName: (id) => tagName(names, id),
      accountNumberFromLabel: (l) => accountNumberFromLabel(names, l),
      tagIdFromLabel: (l) => tagIdFromLabel(names, l),
      tagParentId: (id) => tagParentId(names, id),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(result.rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Import");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const baseName = file.name.replace(/\.(csv|xlsx)$/i, "") + "-aplos.xlsx";

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${baseName}"`,
      "X-Aplos-Row-Count": String(result.rows.length - 1),
      "X-Aplos-Warnings": Buffer.from(JSON.stringify(result.warnings)).toString("base64"),
    },
  });
}
