"use server";

import { asAnon, dbErrorMessage } from "@/lib/server/db";

export type CheckoutResult = { ok?: boolean; error?: string; number?: string; total_cents?: number } | null;

export async function placeOrder(_: CheckoutResult, form: FormData): Promise<CheckoutResult> {
  let items: { variantId: number; qty: number }[];
  try { items = JSON.parse(String(form.get("items") ?? "[]")); } catch { return { error: "El carrito no es válido." }; }
  const payload = {
    website: String(form.get("website") ?? ""),
    delivery: form.get("delivery") === "delivery" ? "delivery" : "pickup",
    notes: String(form.get("notes") ?? "").slice(0, 500),
    customer: {
      full_name: String(form.get("full_name") ?? "").slice(0, 120), phone: String(form.get("phone") ?? "").slice(0, 20),
      email: String(form.get("email") ?? "").slice(0, 120), address: String(form.get("address") ?? "").slice(0, 300),
      province: String(form.get("province") ?? "").slice(0, 60), municipality: String(form.get("municipality") ?? "").slice(0, 60),
    },
    items: items.slice(0, 20).map((i) => ({ variant_id: Number(i.variantId), quantity: Number(i.qty) })),
  };
  try {
    const r = await asAnon(async (tx) => (await tx<{ r: { number: string; total_cents: number } }[]>`
      select public.place_online_order(${tx.json(payload)}::jsonb) as r`)[0].r);
    return { ok: true, number: r.number, total_cents: r.total_cents };
  } catch (e) {
    return { error: dbErrorMessage(e) };
  }
}
