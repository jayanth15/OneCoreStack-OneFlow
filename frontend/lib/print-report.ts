"use client";

import { apiFetchJson } from "./api";

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
export interface CompanyPrintInfo {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
  company_website: string;
  company_logo_url: string;
  company_city: string;
  company_state: string;
  company_country: string;
  company_pincode: string;
}

export function loadCompanyPrintInfo(): Promise<CompanyPrintInfo | null> {
  return apiFetchJson<CompanyPrintInfo>("/api/v1/settings/company").catch(() => null);
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
export function companyPrintHeaderHtml(company: CompanyPrintInfo | null): string {
  if (!company) return "";
  const address = [
    company.company_address,
    company.company_city,
    company.company_state,
    company.company_pincode,
    company.company_country,
  ].filter(Boolean).map(escapeHtml).join(", ");
  const contact = [
    company.company_phone ? `Phone: ${escapeHtml(company.company_phone)}` : "",
    company.company_email ? `Email: ${escapeHtml(company.company_email)}` : "",
    company.company_gstin ? `GSTIN: ${escapeHtml(company.company_gstin)}` : "",
    company.company_website ? escapeHtml(company.company_website) : "",
  ].filter(Boolean).join(" &nbsp;|&nbsp; ");
  const hasCompanyInfo = company.company_name || address || contact || company.company_logo_url;
  if (!hasCompanyInfo) return "";

  return `<div style="text-align:center;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid #222;">
    ${company.company_logo_url ? `<img src="${escapeHtml(company.company_logo_url)}" alt="" style="max-height:56px;max-width:180px;object-fit:contain;margin-bottom:6px;" />` : ""}
    ${company.company_name ? `<div style="font-size:21px;font-weight:800;line-height:1.2;">${escapeHtml(company.company_name)}</div>` : ""}
    ${address ? `<div style="font-size:12px;color:#555;margin-top:4px;">${address}</div>` : ""}
    ${contact ? `<div style="font-size:11px;color:#666;margin-top:4px;">${contact}</div>` : ""}
  </div>`;
}

export async function getCompanyPrintHeaderHtml(): Promise<string> {
  return companyPrintHeaderHtml(await loadCompanyPrintInfo());
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
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Please allow popups for printing");
    return;
  }
  void renderPrintWindow(win, options);
}

async function renderPrintWindow(win: Window, options: PrintOptions): Promise<void> {
  const { title, subtitle, companyName, companyAddress, mode, columns, rows, extraHeader } = options;
  const modeLabel = mode === "cycle-count" ? "Cycle Count" : mode === "audit-history" ? "Audit History" : "Audit Snapshot";
  const printedAt = new Date().toLocaleString("en-IN");
  const companyHeader = companyPrintHeaderHtml(
    (await loadCompanyPrintInfo()) ?? (companyName ? {
      company_name: companyName,
      company_address: companyAddress ?? "",
      company_phone: "",
      company_email: "",
      company_gstin: "",
      company_website: "",
      company_logo_url: "",
      company_city: "",
      company_state: "",
      company_country: "",
      company_pincode: "",
    } : null),
  );


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
    button { display: none; }
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
</style>
</head>
<body>
  ${companyHeader}
  <div class="print-header">
    <h1>${escapeHtml(title)} <span class="mode-badge">${modeLabel}</span></h1>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
    ${extraHeader ? `<div class="extra-header">${escapeHtml(extraHeader)}</div>` : ""}
  </div>
  <table>
    <thead><tr>${headersHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Printed: ${printedAt}</div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}