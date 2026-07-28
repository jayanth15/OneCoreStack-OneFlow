"use client";

export type PrintMode = "cycle-count" | "audit-snapshot" | "audit-history";

export interface PrintOptions {
  title: string;
  subtitle?: string;
  companyName?: string;
  companyAddress?: string;
  mode: PrintMode;
  columns: string[];
  rows: Record<string, unknown>[];
  extraHeader?: string;
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number; page: number; page_size: number; pages: number }>,
  pageSize: number = 200,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let total = 0;
  let fetched = 0;

  while (true) {
    const resp = await fetchPage(page, pageSize);
    if (resp.total > 0) {
      total = resp.total;
    }
    const items = resp.items ?? [];
    if (items.length === 0) break;
    for (const item of items) {
      const existing = all.find((existing) => existing === item || (existing as Record<string, unknown>).id === (item as Record<string, unknown>).id);
      if (!existing) {
        all.push(item);
      }
    }
    fetched += items.length;
    if (total > 0 && fetched >= total) break;
    if (items.length < pageSize) break;
    page += 1;
  }
  return all;
}

export function openPrintWindow(options: PrintOptions): void {
  const { title, subtitle, companyName, companyAddress, mode, columns, rows, extraHeader } = options;
  const modeLabel = mode === "cycle-count" ? "Cycle Count" : mode === "audit-history" ? "Audit History" : "Audit Snapshot";
  const printedAt = new Date().toLocaleString("en-IN");

  const rowsHtml = rows.map((row) => {
    const cells = columns.map((col) => {
      const val = row[col] ?? "";
      return `<td>${escapeHtml(val)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  const headersHtml = columns.map((col) =>
    `<th>${escapeHtml(col)}</th>`
  ).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @media print {
    body { margin: 0; padding: 0; }
    .print-header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
    .print-header h1 { font-size: 18px; margin: 0; }
    .print-header .subtitle { font-size: 12px; color: #555; }
    .print-header .mode-badge { display: inline-block; background: #1e40af; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f3f4f6; }
    @page { margin: 15mm; }
  }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #111; }
  .print-header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
  .print-header h1 { font-size: 18px; margin: 0; }
  .print-header .subtitle { font-size: 12px; color: #555; }
  .print-header .mode-badge { display: inline-block; background: #1e40af; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px; }
  .company { font-size: 11px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f3f4f6; border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
  td { padding: 6px 10px; border: 1px solid #ddd; }
  .extra-header { margin-bottom: 8px; font-size: 12px; }
  .footer { margin-top: 16px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
  button { margin: 10px 0; padding: 8px 16px; cursor: pointer; }
</style>
</head>
<body>
  <div class="print-header">
    <h1>${escapeHtml(title)} <span class="mode-badge">${modeLabel}</span></h1>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
    ${companyName ? `<div class="company">${escapeHtml(companyName)}${companyAddress ? " — " + escapeHtml(companyAddress) : ""}</div>` : ""}
    ${extraHeader ? `<div class="extra-header">${escapeHtml(extraHeader)}</div>` : ""}
  </div>
  <table>
    <thead><tr>${headersHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Printed: ${printedAt}</div>
  <button onclick="window.print()">Print</button>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Please allow popups for printing");
    return;
  }
  win.document.write(html);
  win.document.close();
}