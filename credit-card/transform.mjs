#!/usr/bin/env node
/**
 * Transforms a Truist Commercial Card CSV export into an expense-report format.
 *
 * Usage:
 *   node transform.mjs input.csv [output.csv]
 *
 * If output is omitted, writes to <input-basename>-expense-report.csv next to the input file.
 */

import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, extname, join } from "path";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath) {
  console.error("Usage: node transform.mjs input.csv [output.csv]");
  process.exit(1);
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

/** Parse a single CSV line, respecting double-quoted fields. */
function parseLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // quoted field
      let field = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ",") i++; // skip separator
    } else {
      // unquoted field
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i).trim());
        break;
      } else {
        fields.push(line.slice(i, end).trim());
        i = end + 1;
      }
    }
  }
  return fields;
}

/** Encode a single value for CSV output. */
function encodeField(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toRow(values) {
  return values.map(encodeField).join(",");
}

// ── Read & parse ──────────────────────────────────────────────────────────────

const raw = readFileSync(inputPath, "utf-8").replace(/^﻿/, ""); // strip BOM
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

const headers = parseLine(lines[0]).map((h) => h.trim());

const col = (row, name) => {
  const idx = headers.indexOf(name);
  return idx >= 0 ? row[idx].trim() : "";
};

const INPUT_ROWS = lines.slice(1).map(parseLine);

// ── Output columns ────────────────────────────────────────────────────────────

const OUTPUT_HEADERS = [
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

const outputRows = INPUT_ROWS.map((row) => {
  // Use "Diverted From Cardholder Name" when present (the actual card owner)
  const diverted = col(row, "Diverted From Cardholder Name");
  const cardholderName = diverted || col(row, "Cardholder Name");

  return [
    cardholderName,
    col(row, "Tran Date"),
    col(row, "Merchant Name"),
    col(row, "Amount"),
    col(row, "MCC Description"),
    "", // Expense Type — filled by cardholder
    "", // Ministry / Ministry Event — filled by cardholder
    "", // Accountant Use: Final Expense Type
    "", // Accountant Use: Final Ministry Type
  ];
});

// ── Write output ──────────────────────────────────────────────────────────────

const out = outputPath
  ?? join(
       dirname(inputPath),
       `${basename(inputPath, extname(inputPath))}-expense-report.csv`,
     );

const csv = [toRow(OUTPUT_HEADERS), ...outputRows.map(toRow)].join("\n");
writeFileSync(out, "﻿" + csv, "utf-8"); // BOM so Excel opens it cleanly

console.log(`Wrote ${outputRows.length} rows → ${out}`);
