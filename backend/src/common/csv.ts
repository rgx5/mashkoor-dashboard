/**
 * One CSV cell. Text that starts with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with a quote so a spreadsheet
 * shows it as text instead of running it as a formula — customer names come from public web forms, and a name like
 * `=HYPERLINK("http://evil","click")` must not execute when a manager opens an export.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const csvRow = (values: unknown[]) => values.map(csvCell).join(",");

/** UTF-8 byte-order mark so Excel opens names in Arabic/Urdu/Hindi correctly. */
export const CSV_BOM = "﻿";
