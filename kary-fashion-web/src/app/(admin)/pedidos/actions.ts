"use server";

import { redirect } from "next/navigation";
import { parseIntStrict, parseMoney, text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";

const METHODS = ["cash", "transfer", "card"];
const STATUSES = ["new", "pending_payment", "confirmed", "preparing", "shipped", "delivered", "cancelled", "returned"];

export async function createOrder(_: ActionState, form: FormData): Promise<ActionState> {
  let id = 0;
  const res = await mutate(async (tx) => {
    const special = form.get("is_special_order") === "on";
    const kinds = form.getAll("item_variant"), descs = form.getAll("item_desc"), qtys = form.getAll("item_qty"), prices = form.getAll("item_price");
    const items = [];
    for (let i = 0; i < qtys.length; i++) {
      const variant = Number(kinds[i]) || null;
      const desc = text(descs[i]);
      if (!variant && !desc) continue;
      const quantity = parseIntStrict(qtys[i], "cantidad");
      if (quantity <= 0) throw new UserError("Las cantidades deben ser mayores que cero.");
      items.push(variant ? { variant_id: variant, quantity, ...(String(prices[i] ?? "").trim() ? { unit_price_cents: parseMoney(prices[i], "precio") } : {}) }
                         : { description: desc, quantity, unit_price_cents: parseMoney(prices[i], "precio") });
    }
    const depositAmount = parseMoney(form.get("deposit_amount"), "anticipo");
    const method = String(form.get("deposit_method"));
    const payload = {
      customer_id: Number(form.get("customer_id")) || null,
      channel: String(form.get("channel") || "whatsapp"),
      is_special_order: special,
      items,
      discount_cents: parseMoney(form.get("discount"), "descuento"),
      shipping_cents: parseMoney(form.get("shipping"), "envío"),
      shipping_address: text(form.get("shipping_address")),
      province: text(form.get("province")),
      municipality: text(form.get("municipality")),
      expected_date: text(form.get("expected_date")),
      notes: text(form.get("notes")),
      ...(depositAmount > 0 ? { deposit: { method: METHODS.includes(method) ? method : "cash", amount_cents: depositAmount,
        reference: text(form.get("deposit_reference")) } } : {}),
    };
    const [r] = await tx<{ result: { order_id: number } }[]>`select public.create_order(${tx.json(payload)}::jsonb) as result`;
    id = r.result.order_id;
  }, { revalidate: ["/pedidos", "/"] });
  if (res?.ok) redirect(`/pedidos/${id}?nuevo=1`);
  return res;
}

export async function addPayment(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const method = String(form.get("method"));
    if (!METHODS.includes(method)) throw new UserError("Método de pago inválido.");
    const amount = parseMoney(form.get("amount"), "monto");
    if (amount <= 0) throw new UserError("Indique el monto.");
    await tx`select public.add_order_payment(${Number(form.get("id"))}, ${method}::public.payment_method, ${amount}, ${text(form.get("reference"))})`;
    return "Pago registrado.";
  }, { revalidate: ["/pedidos", "/"] });
}

export async function changeStatus(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const to = String(form.get("to"));
    if (!STATUSES.includes(to)) throw new UserError("Estado inválido.");
    await tx`select public.change_order_status(${Number(form.get("id"))}, ${to}::public.order_status, ${text(form.get("note"))},
                                               ${form.get("refund") === "on"})`;
    return "Estado actualizado.";
  }, { revalidate: ["/pedidos", "/"] });
}

export async function completeOrder(_: ActionState, form: FormData): Promise<ActionState> {
  let saleId = 0;
  const res = await mutate(async (tx) => {
    const payments = [];
    for (const m of ["transfer", "card"]) {
      const amount = parseMoney(form.get(`${m}_amount`), "monto");
      if (amount > 0) payments.push({ method: m, amount_cents: amount, reference: text(form.get(`${m}_reference`)) });
    }
    const cash = String(form.get("cash_received") ?? "").trim();
    const [r] = await tx<{ result: { sale_id: number } }[]>`
      select public.complete_order(${Number(form.get("id"))}, ${tx.json(payments)}::jsonb,
                                   ${cash ? parseMoney(cash, "efectivo") : null}::bigint) as result`;
    saleId = r.result.sale_id;
  }, { revalidate: ["/pedidos", "/ventas", "/inventario", "/"] });
  if (res?.ok) redirect(`/ventas/${saleId}?nueva=1`);
  return res;
}
