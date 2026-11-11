import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { formatCell } from "@/lib/report-format";
import { getCurrentUser } from "@/lib/server/auth";
import { asUser } from "@/lib/server/db";
import { parseRange } from "@/lib/server/range";
import { isReportView, runReport } from "@/lib/server/reports";

/** Descarga de un reporte en Excel (.xlsx) o CSV, con los mismos datos que la pantalla. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Solo administración." }, { status: 403 });
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const vista = sp.vista ?? "ventas";
  if (!isReportView(vista)) return NextResponse.json({ error: "Reporte desconocido." }, { status: 400 });
  const r = parseRange(sp);
  const rep = await asUser(user.id, (tx) => runReport(tx, vista, r.from, r.to));
  const name = `kary-fashion-${vista}-${rep.dated ? `${r.from}_${r.to}` : r.to}`;

  if (sp.formato === "csv") {
    const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const raw = (v: unknown, type: string) => v == null ? "" : type === "money" ? (Number(v) / 100).toFixed(2)
      : type === "date" ? formatCell(v, type) : String(v);
    const lines = [rep.columns.map((c) => esc(c.label)).join(","),
      ...rep.rows.map((row) => rep.columns.map((c) => esc(raw(row[c.key], c.type))).join(","))];
    return new NextResponse("﻿" + lines.join("\r\n"), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Kary Fashion";
  const ws = wb.addWorksheet(rep.title.slice(0, 31));
  ws.addRow([`Kary Fashion · ${rep.title}`]).font = { bold: true, size: 14, color: { argb: "FF49243E" } };
  ws.addRow([rep.dated ? `Período: ${r.label}` : `Al ${formatCell(r.to, "date")}`]).font = { color: { argb: "FF7A6F80" } };
  ws.addRow([]);
  const header = ws.addRow(rep.columns.map((c) => c.label));
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2407F" } };
  });
  for (const row of rep.rows) {
    ws.addRow(rep.columns.map((c) => {
      const v = row[c.key];
      if (v == null) return null;
      if (c.type === "money") return Number(v) / 100;
      if (c.type === "pct") return Number(v) / 100;
      if (c.type === "int") return Number(v);
      if (c.type === "date") return v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T12:00:00Z`);
      return String(v);
    }));
  }
  rep.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.type === "text" ? 30 : 16;
    if (c.type === "money") col.numFmt = '"RD$"#,##0.00';
    if (c.type === "pct") col.numFmt = "0.0%";
    if (c.type === "date") col.numFmt = "dd/mm/yyyy";
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
}
