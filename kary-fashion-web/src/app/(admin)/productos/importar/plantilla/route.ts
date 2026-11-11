import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { IMPORT_COLUMNS } from "../columns";

/** Descarga la plantilla de Excel para cargar el catálogo. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Solo administración." }, { status: 403 });
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kary Fashion";
  const ws = wb.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).eachCell((cell, i) => {
    const col = IMPORT_COLUMNS[i - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.required ? "FFE2407F" : "FF49243E" } };
    cell.note = col.note;
  });
  const examples = [
    { name: "Blusa de lino", category: "Blusas", color: "Blanco", size: "S", price: 1300, cost: 600, qty: 4, min: 2 },
    { name: "Blusa de lino", category: "Blusas", color: "Blanco", size: "M", price: 1300, cost: 600, qty: 6, min: 2 },
    { name: "Perfume floral 100 ml", category: "Perfumes", price: 2500, cost: 1200, qty: 3, min: 1 },
  ];
  ws.getColumn("price").numFmt = '"RD$"#,##0.00';
  ws.getColumn("cost").numFmt = '"RD$"#,##0.00';
  // Los ejemplos van en la hoja de instrucciones para que nunca se carguen por error
  const help = wb.addWorksheet("Instrucciones");
  help.columns = [{ width: 18 }, { width: 90 }];
  help.addRow(["Kary Fashion", "Plantilla para cargar el catálogo y la existencia inicial"]).font = { bold: true, size: 13 };
  help.addRow([]);
  help.addRow(["Dónde escribir", "En la hoja «Productos». Una fila = una talla/color. Repita el nombre del producto en cada fila."]);
  IMPORT_COLUMNS.forEach((c) => help.addRow([c.header + (c.required ? " *" : ""), c.note]));
  help.addRow([]);
  help.addRow(["Consejo", "Suba primero con «Solo revisar» marcado: comprueba el archivo sin guardar nada."]);
  help.addRow([]);
  help.addRow(["Ejemplo", "Así se verían tres filas en la hoja «Productos»:"]).font = { bold: true };
  const exHeader = help.addRow(IMPORT_COLUMNS.map((c) => c.header));
  exHeader.font = { bold: true };
  examples.forEach((e) => help.addRow(IMPORT_COLUMNS.map((c) => (e as Record<string, unknown>)[c.key] ?? "")));
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos-kary-fashion.xlsx"',
    },
  });
}
