"use server";

import { redirect } from "next/navigation";
import { parseIntStrict, parseMoney, text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";

interface PosPayload {
  customer_id: number | null;
  channel: string;
  invoice_kind: string;
  notes: string;
  discount: string;
  shipping: string;
  cash_received: string;
  transfer: { amount: string; reference: string };
  card: { amount: string; reference: string };
  items: { variant_id: number; quantity: number; discount: string }[];
}

const CHANNELS = ["store", "whatsapp", "instagram", "tiktok", "online"];
const KINDS = ["commercial", "B01", "B02", "E31", "E32"];

export async function registerSale(_: ActionState, form: FormData): Promise<ActionState> {
  let saleId = 0;
  const res = await mutate(async (tx) => {
    let p: PosPayload;
    try { p = JSON.parse(String(form.get("payload"))); } catch { throw new UserError("Datos de la venta inválidos."); }
    if (!p.items?.length) throw new UserError("Agregue al menos un artículo.");
    const payments = [];
    for (const [method, v] of [["transfer", p.transfer], ["card", p.card]] as const) {
      const amount = parseMoney(v.amount, method === "transfer" ? "monto de transferencia" : "monto de tarjeta");
      if (amount > 0) payments.push({ method, amount_cents: amount, reference: v.reference?.trim() || null });
    }
    const payload = {
      customer_id: p.customer_id || null,
      channel: CHANNELS.includes(p.channel) ? p.channel : "store",
      invoice_kind: KINDS.includes(p.invoice_kind) ? p.invoice_kind : "commercial",
      notes: p.notes?.trim() || null,
      discount_cents: parseMoney(p.discount, "descuento"),
      shipping_cents: parseMoney(p.shipping, "envío"),
      cash_received_cents: p.cash_received.trim() ? parseMoney(p.cash_received, "efectivo recibido") : null,
      payments,
      items: p.items.map((i) => ({ variant_id: Number(i.variant_id), quantity: parseIntStrict(String(i.quantity)),
        discount_cents: parseMoney(i.discount, "descuento") })),
    };
    const [r] = await tx<{ result: { sale_id: number } }[]>`select public.register_sale(${tx.json(payload)}::jsonb) as result`;
    saleId = r.result.sale_id;
  }, { revalidate: ["/ventas", "/inventario", "/productos", "/", "/clientes"] });
  if (res?.ok) redirect(`/ventas/${saleId}?nueva=1`);
  return res;
}

export async function cancelSale(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const reason = text(form.get("reason"));
    if (!reason) throw new UserError("Escriba el motivo de la anulación.");
    await tx`select public.cancel_sale(${Number(form.get("id"))}, ${reason})`;
    return "Venta anulada. La mercancía volvió al inventario.";
  }, { admin: true, revalidate: ["/ventas", "/inventario", "/"] });
}

export async function registerReturn(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const reason = text(form.get("reason"));
    if (!reason) throw new UserError("Escriba el motivo de la devolución.");
    const items = form.getAll("item_id").map((id, i) => ({
      sale_item_id: Number(id), quantity: Number(form.getAll("qty")[i] || 0), restock: form.getAll("restock").includes(String(id)),
    })).filter((x) => x.quantity > 0);
    if (items.length === 0) throw new UserError("Indique la cantidad a devolver de al menos un artículo.");
    const method = String(form.get("refund_method") || "");
    await tx`select public.register_return(${Number(form.get("id"))}, ${tx.json(items)}::jsonb, ${reason},
                                           ${method || null}::public.payment_method)`;
    return "Devolución registrada.";
  }, { admin: true, revalidate: ["/ventas", "/inventario", "/"] });
}
