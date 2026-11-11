"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/auth";
import { asUser, dbErrorMessage } from "@/lib/server/db";
import { IMPORT_COLUMNS, type ImportKey } from "./columns";

export type ImportResult = {
  ok?: boolean; dryRun?: boolean; error?: string; errors?: string[];
  summary?: { products: number; newProducts: number; variants: number; units: number; costValue: number; retailValue: number; newCategories: string[] };
} | null;

class Rollback extends Error {}
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const code = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
  }
  return String(v).trim();
}
function money(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/RD\$|\$|,|\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

type Row = { line: number; name: string; category: string; color: string | null; size: string | null; price: number;
  cost: number; qty: number; min: number; sku_base: string | null; brand: string | null; description: string | null };

async function readRows(file: File): Promise<{ rows: Row[]; errors: string[] }> {
  const errors: string[] = [];
  const wb = new ExcelJS.Workbook();
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".csv")) {
    const { Readable } = await import("node:stream");
    await wb.csv.read(Readable.from(buf.toString("utf8")));
  } else {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  }
  const ws = wb.worksheets.find((w) => norm(w.name) === "productos") ?? wb.worksheets[0];
  if (!ws) return { rows: [], errors: ["El archivo no tiene hojas."] };
  const headerIdx = new Map<ImportKey, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = norm(cellText(cell.value).replace("*", ""));
    const match = IMPORT_COLUMNS.find((c) => norm(c.header) === h || norm(c.key) === h);
    if (match) headerIdx.set(match.key, col);
  });
  for (const c of IMPORT_COLUMNS.filter((c) => c.required)) {
    if (!headerIdx.has(c.key)) errors.push(`Falta la columna «${c.header}». Use la plantilla.`);
  }
  if (errors.length) return { rows: [], errors };
  const rows: Row[] = [];
  ws.eachRow((row, line) => {
    if (line === 1) return;
    const get = (k: ImportKey) => (headerIdx.has(k) ? cellText(row.getCell(headerIdx.get(k)!).value) : "");
    const name = get("name"), category = get("category");
    if (!name && !category && !get("price")) return; // fila vacía
    const price = money(get("price")), cost = money(get("cost")) ?? 0;
    const qtyS = get("qty"), minS = get("min");
    const qty = qtyS ? Number(qtyS) : 0, min = minS ? Number(minS) : 2;
    const e: string[] = [];
    if (!name) e.push("falta el nombre");
    if (!category) e.push("falta la categoría");
    if (price == null || Number.isNaN(price) || price <= 0) e.push("precio inválido");
    if (Number.isNaN(cost)) e.push("costo inválido");
    if (!Number.isInteger(qty) || qty < 0) e.push("cantidad inválida");
    if (!Number.isInteger(min) || min < 0) e.push("mínimo inválido");
    if (qty > 0 && !(cost > 0)) e.push("indique el costo para cargar la cantidad");
    if (price != null && cost > 0 && cost > price) e.push("el costo es mayor que el precio");
    if (e.length) { errors.push(`Fila ${line}: ${e.join(", ")}.`); return; }
    rows.push({ line, name, category, color: get("color") || null, size: get("size") || null, price: price!, cost, qty, min,
      sku_base: get("sku_base") ? get("sku_base").toUpperCase() : null, brand: get("brand") || null, description: get("description") || null });
  });
  if (rows.length === 0 && errors.length === 0) errors.push("El archivo no tiene productos.");
  if (rows.length > 3000) errors.push("Máximo 3,000 filas por archivo.");
  // variantes repetidas dentro del archivo
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = `${norm(r.sku_base ?? r.name)}|${norm(r.color ?? "")}|${norm(r.size ?? "")}`;
    if (seen.has(k)) errors.push(`Fila ${r.line}: repite la misma talla y color de la fila ${seen.get(k)}.`);
    else seen.set(k, r.line);
  }
  return { rows, errors };
}

export async function importProducts(_: ImportResult, form: FormData): Promise<ImportResult> {
  const user = await requireAdmin();
  const file = form.get("file");
  const dryRun = form.get("dry_run") === "on";
  if (!(file instanceof File) || file.size === 0) return { error: "Seleccione el archivo de Excel (.xlsx) o CSV." };
  if (file.size > 5 * 1024 * 1024) return { error: "El archivo es muy grande (máximo 5 MB)." };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { error: "Use un archivo .xlsx (Excel) o .csv." };

  let parsed;
  try { parsed = await readRows(file); } catch { return { error: "No se pudo leer el archivo. Guárdelo como Excel (.xlsx) e intente de nuevo." }; }
  if (parsed.errors.length) return { error: "Corrija estos detalles en el archivo; no se guardó nada.", errors: parsed.errors.slice(0, 40) };

  const summary = { products: 0, newProducts: 0, variants: 0, units: 0, costValue: 0, retailValue: 0, newCategories: [] as string[] };
  try {
    await asUser(user.id, async (tx) => {
      const cats = new Map((await tx<{ id: number; name: string }[]>`select id, name::text from public.categories`).map((c) => [norm(c.name), c.id]));
      const groups = new Map<string, Row[]>();
      for (const r of parsed.rows) {
        const k = r.sku_base ? `c:${norm(r.sku_base)}` : `n:${norm(r.name)}`;
        groups.set(k, [...(groups.get(k) ?? []), r]);
      }
      for (const rows of groups.values()) {
        const first = rows[0];
        let catId = cats.get(norm(first.category));
        if (!catId) {
          const [c] = await tx<{ id: number }[]>`insert into public.categories (name, slug, sort_order)
            values (${first.category}, ${slug(first.category) || "categoria"}, 50) returning id`;
          catId = c.id; cats.set(norm(first.category), catId); summary.newCategories.push(first.category);
        }
        let [prod] = first.sku_base
          ? await tx<{ id: number; sku_base: string }[]>`select id, sku_base::text from public.products where sku_base = ${first.sku_base} and deleted_at is null`
          : await tx<{ id: number; sku_base: string }[]>`select id, sku_base::text from public.products where lower(name) = lower(${first.name}) and deleted_at is null limit 1`;
        if (!prod) {
          let sku = first.sku_base;
          if (!sku) {
            const prefix = code(first.category).slice(0, 3).padEnd(3, "X");
            const [{ n }] = await tx<{ n: number }[]>`select coalesce(max(substring(sku_base from ${"^" + prefix + "-([0-9]+)$"})::int), 0) + 1 as n
                                                   from public.products where sku_base ~ ${"^" + prefix + "-[0-9]+$"}`;
            sku = `${prefix}-${String(n).padStart(4, "0")}`;
          }
          [prod] = await tx<{ id: number; sku_base: string }[]>`
            insert into public.products (sku_base, name, category_id, brand, description, status, published)
            values (${sku}, ${first.name}, ${catId}, ${first.brand}, ${first.description}, 'active', false) returning id, sku_base::text`;
          summary.newProducts++;
        }
        summary.products++;
        for (const r of rows) {
          const sku = [prod.sku_base, code(r.color ?? "").slice(0, 3), code(r.size ?? "")].filter(Boolean).join("-");
          const exists = await tx`select 1 from public.product_variants where product_id = ${prod.id}
                                  and coalesce(size, '') = ${r.size ?? ""} and coalesce(color, '') = ${r.color ?? ""}`;
          if (exists.length) throw new Error(`Fila ${r.line}: «${r.name} ${r.color ?? ""} ${r.size ?? ""}» ya existe en el catálogo.`);
          const [v] = await tx<{ id: number }[]>`insert into public.product_variants (product_id, sku, size, color, price_cents, min_stock)
                                                 values (${prod.id}, ${sku}, ${r.size}, ${r.color}, ${r.price}, ${r.min}) returning id`;
          if (r.qty > 0) await tx`select public.register_initial_stock(${v.id}, ${r.qty}, ${r.cost})`;
          summary.variants++; summary.units += r.qty; summary.costValue += r.qty * r.cost; summary.retailValue += r.qty * r.price;
        }
      }
      if (dryRun) throw new Rollback();
    });
  } catch (e) {
    if (e instanceof Rollback) return { ok: true, dryRun: true, summary };
    const msg = e instanceof Error && e.message.startsWith("Fila ") ? e.message : dbErrorMessage(e);
    return { error: "No se guardó nada.", errors: [msg] };
  }
  ["/productos", "/inventario", "/"].forEach((p) => revalidatePath(p));
  return { ok: true, summary };
}
