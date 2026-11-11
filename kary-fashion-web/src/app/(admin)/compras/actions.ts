"use server";

import { redirect } from "next/navigation";
import { parseIntStrict, parseMoney, text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";

export async function createPurchase(_: ActionState, form: FormData): Promise<ActionState> {
  let id = 0;
  const res = await mutate(async (tx) => {
    const variants = form.getAll("variant_id"), qtys = form.getAll("quantity"), costs = form.getAll("unit_cost");
    const items: { variant_id: number; quantity: number; unit_cost_cents: number }[] = [];
    for (let i = 0; i < variants.length; i++) {
      const v = Number(variants[i]);
      if (!v) continue;
      const quantity = parseIntStrict(qtys[i], "cantidad");
      const cost = parseMoney(costs[i], "costo");
      if (quantity <= 0) throw new UserError("Las cantidades deben ser mayores que cero.");
      if (cost <= 0) throw new UserError("Indique el costo por unidad de cada artículo.");
      if (items.some((x) => x.variant_id === v)) throw new UserError("Hay un artículo repetido; súmelo en una sola fila.");
      items.push({ variant_id: v, quantity, unit_cost_cents: cost });
    }
    if (items.length === 0) throw new UserError("Agregue al menos un artículo a la compra.");
    const [{ next }] = await tx<{ next: string }[]>`
      select 'OC-' || lpad((coalesce(max(substring(number from 4)::int), 0) + 1)::text, 4, '0') as next
      from public.purchase_orders where number ~ '^OC-[0-9]+$'`;
    const [po] = await tx<{ id: number }[]>`
      insert into public.purchase_orders (number, supplier_id, status, order_date, supplier_invoice, shipping_cents, other_costs_cents, notes)
      values (${next}, ${Number(form.get("supplier_id")) || null}, 'ordered', ${String(form.get("order_date") || "") || null}::date,
              ${text(form.get("supplier_invoice"))}, ${parseMoney(form.get("shipping"), "transporte")},
              ${parseMoney(form.get("other_costs"), "otros costos")}, ${text(form.get("notes"))})
      returning id`;
    for (const it of items) {
      await tx`insert into public.purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost_cents)
               values (${po.id}, ${it.variant_id}, ${it.quantity}, ${it.unit_cost_cents})`;
    }
    if (form.get("receive_now") === "on") await tx`select public.receive_purchase_order(${po.id})`;
    id = po.id;
  }, { admin: true, revalidate: ["/compras", "/inventario", "/productos", "/"] });
  if (res?.ok) redirect(`/compras/${id}`);
  return res;
}

export async function receivePurchase(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    await tx`select public.receive_purchase_order(${Number(form.get("id"))})`;
    return "Mercancía recibida: inventario y costos actualizados.";
  }, { admin: true, revalidate: ["/compras", "/inventario", "/productos", "/"] });
}

export async function cancelPurchase(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const r = await tx`update public.purchase_orders set status = 'cancelled' where id = ${Number(form.get("id"))}
                       and status in ('draft', 'ordered') returning id`;
    if (r.length === 0) throw new UserError("Solo se cancelan compras que no se han recibido.");
    return "Compra cancelada.";
  }, { admin: true, revalidate: ["/compras"] });
}
