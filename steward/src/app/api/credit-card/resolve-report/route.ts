// Step 2 of the credit-card flow: take the cardholder-filled expense report
// and hand back the same sheet with the two "Accountant Use" columns resolved
// from the rules, for the treasurer to review and edit before step 3.

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { loadAplosNames, accountName, fundName, tagName, tagParentId } from "@/lib/aplos-lookup";
import { loadCreditCardRules } from "@/lib/credit-card-rules";
import { resolveReport, buildTagFundMap, fundForTag, type RowOverrides } from "@/lib/credit-card-mappings";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const csvText = await file.text();
  const [names, rules] = await Promise.all([loadAplosNames(), loadCreditCardRules()]);

  // Per-row picks from the halt panel. Unknown ids are dropped rather than
  // written into the sheet as "Account 1234".
  const overrides: RowOverrides = {};
  const rawOverrides = form.get("overrides");
  if (typeof rawOverrides === "string" && rawOverrides) {
    for (const [row, o] of Object.entries(JSON.parse(rawOverrides) as RowOverrides)) {
      overrides[Number(row)] = {
        accountNumber: o.accountNumber && names.accounts.has(o.accountNumber) ? o.accountNumber : undefined,
        tagId: o.tagId && names.tags.has(o.tagId) ? o.tagId : undefined,
      };
    }
  }

  let result;
  try {
    result = resolveReport(csvText, rules, {
      accountName: (n) => accountName(names, n),
      fundName: (id) => fundName(names, id),
      tagName: (id) => tagName(names, id),
    }, overrides);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // Halt instead of downloading until every row has a known expense type and
  // ministry — via a saved rule or a per-row pick. The client re-posts the
  // same file afterwards.
  if (result.flagged.length > 0) {
    const accounts = [...names.accounts]
      .filter(([, a]) => a.category === "expense")
      .map(([number, a]) => ({ number, name: a.name }))
      .sort((a, b) => a.number - b.number);
    // Each tag carries the fund a new ministry rule for it should post to.
    const tagFund = buildTagFundMap(rules.ministry);
    const tags = [...names.tags]
      .map(([id, t]) => {
        const fundId = fundForTag(id, tagFund, (x) => tagParentId(names, x));
        return { id, name: t.name, fundId, fundName: fundName(names, fundId) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ needsRules: true, flagged: result.flagged, accounts, tags });
  }

  const ws = XLSX.utils.aoa_to_sheet(result.rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const baseName = file.name.replace(/\.csv$/i, "") + "-resolved.xlsx";

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${baseName}"`,
      "X-Row-Count": String(result.rows.length - 1),
      "X-Warnings": Buffer.from(JSON.stringify(result.warnings)).toString("base64"),
    },
  });
}
