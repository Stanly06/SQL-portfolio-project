"use server";

import { redirect } from "next/navigation";
import { parseIntStrict, parseMoney, text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";
import type { Tx } from "@/lib/server/db";

function skuPart(s: string | null) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function readProduct(form: FormData) {
  const name = text(form.get("name"));
  const skuBase = skuPart(text(form.get("sku_base"))) || null;
  const categoryId = Number(form.get("category_id"));
  if (!name) throw new UserError("Escriba el nombre del producto.");
  if (!skuBase) throw new UserError("Escriba el código base (SKU), por ejemplo BLU-0102.");
  if (!categoryId) throw new UserError("Seleccione la categoría.");
  const status = String(form.get("status") ?? "active");
  const published = form.get("published") === "on";
  return {
    name, sku_base: String(form.get("sku_base")).trim().toUpperCase(), category_id: categoryId,
    brand: text(form.get("brand")), supplier_id: Number(form.get("supplier_id")) || null,
    description: text(form.get("description")), image_url: text(form.get("image_url")),
    status: ["draft", "active", "archived"].includes(status) ? status : "active",
    published: published && status === "active",
  };
}

async function insertVariant(tx: Tx, productId: number, skuBase: string, v: {
  sku: string | null; size: string | null; color: string | null; price: number; min: number; qty: number; cost: number;
}) {
  const sku = v.sku?.toUpperCase() || [skuBase, skuPart(v.color).slice(0, 3), skuPart(v.size)].filter(Boolean).join("-");
  const [row] = await tx<{ id: number }[]>`
    insert into public.product_variants (product_id, sku, size, color, price_cents, min_stock)
    values (${productId}, ${sku}, ${v.size}, ${v.color}, ${v.price}, ${v.min}) returning id`;
  if (v.qty > 0) await tx`select public.register_initial_stock(${row.id}, ${v.qty}, ${v.cost})`;
  return row.id;
}

function readVariantRows(form: FormData) {
  const sizes = form.getAll("v_size"), colors = form.getAll("v_color"), prices = form.getAll("v_price");
  const mins = form.getAll("v_min"), qtys = form.getAll("v_qty"), costs = form.getAll("v_cost"), skus = form.getAll("v_sku");
  const rows = [];
  for (let i = 0; i < prices.length; i++) {
    const size = text(sizes[i]), color = text(colors[i]);
    if (!String(prices[i] ?? "").trim() && !size && !color) continue; // fila vacía
    const price = parseMoney(prices[i], "precio");
    if (price <= 0) throw new UserError(`Indique el precio de la variante ${[color, size].filter(Boolean).join(" ") || i + 1}.`);
    const qty = String(qtys[i] ?? "").trim() ? parseIntStrict(qtys[i], "existencia inicial") : 0;
    const cost = parseMoney(costs[i], "costo");
    if (qty > 0 && cost <= 0) throw new UserError("Para cargar existencia inicial indique también el costo por unidad.");
    rows.push({ sku: text(skus[i]), size, color, price, qty, cost,
      min: String(mins[i] ?? "").trim() ? parseIntStrict(mins[i], "existencia mínima") : 2 });
  }
  return rows;
}

export async function createProduct(_: ActionState, form: FormData): Promise<ActionState> {
  let newId = 0;
  const res = await mutate(async (tx) => {
    const p = readProduct(form);
    const variants = readVariantRows(form);
    if (variants.length === 0) throw new UserError("Agregue al menos una variante (talla/color) con su precio.");
    const [row] = await tx<{ id: number }[]>`
      insert into public.products (sku_base, name, category_id, brand, supplier_id, description, image_url, status, published)
      values (${p.sku_base}, ${p.name}, ${p.category_id}, ${p.brand}, ${p.supplier_id}, ${p.description}, ${p.image_url},
              ${p.status}, ${p.published}) returning id`;
    for (const v of variants) await insertVariant(tx, row.id, p.sku_base, v);
    newId = row.id;
  }, { admin: true, revalidate: ["/productos", "/inventario", "/"] });
  if (res?.ok) redirect(`/productos/${newId}?creado=1`);
  return res;
}

export async function updateProduct(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const id = Number(form.get("id"));
    const p = readProduct(form);
    await tx`update public.products set sku_base = ${p.sku_base}, name = ${p.name}, category_id = ${p.category_id},
               brand = ${p.brand}, supplier_id = ${p.supplier_id}, description = ${p.description}, image_url = ${p.image_url},
               status = ${p.status}, published = ${p.published}, updated_at = now()
             where id = ${id}`;
    return "Producto actualizado.";
  }, { admin: true, revalidate: ["/productos"] });
}

export async function updateVariant(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const id = Number(form.get("id"));
    const price = parseMoney(form.get("price"), "precio");
    if (price <= 0) throw new UserError("El precio debe ser mayor que cero.");
    const min = parseIntStrict(form.get("min_stock"), "existencia mínima");
    if (min < 0) throw new UserError("La existencia mínima no puede ser negativa.");
    await tx`update public.product_variants set price_cents = ${price}, min_stock = ${min},
               active = ${form.get("active") === "on"} where id = ${id}`;
    return "Variante actualizada.";
  }, { admin: true, revalidate: ["/productos", "/inventario"] });
}

export async function addVariant(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const productId = Number(form.get("product_id"));
    const [prod] = await tx<{ sku_base: string }[]>`select sku_base::text from public.products where id = ${productId}`;
    if (!prod) throw new UserError("El producto no existe.");
    const [v] = readVariantRows(form);
    if (!v) throw new UserError("Indique talla o color y el precio.");
    await insertVariant(tx, productId, prod.sku_base, v);
    return "Variante agregada.";
  }, { admin: true, revalidate: ["/productos", "/inventario"] });
}

export async function archiveProduct(form: FormData) {
  const id = Number(form.get("id"));
  await mutate(async (tx) => {
    await tx`update public.products set deleted_at = now(), published = false, status = 'archived', updated_at = now()
             where id = ${id}`;
  }, { admin: true, revalidate: ["/productos", "/inventario"] });
  redirect("/productos");
}
