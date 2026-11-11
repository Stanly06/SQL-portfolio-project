"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";
import { createOrder } from "./actions";

export interface OrderVariant { id: number; label: string; price_cents: number; stock: number }

const toCents = (s: string) => Math.round((Number(String(s).replace(/,/g, "")) || 0) * 100);

export function OrderForm({ customers, variants, minDepositPct, initialCustomer }: {
  customers: { id: number; full_name: string; phone: string | null }[]; variants: OrderVariant[]; minDepositPct: number; initialCustomer?: number;
}) {
  const [state, action] = useActionState(createOrder, null);
  const [special, setSpecial] = useState(false);
  const [rows, setRows] = useState([{ key: 0, variant: "", desc: "", qty: "1", price: "" }]);
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [deposit, setDeposit] = useState("");
  const vmap = new Map(variants.map((v) => [String(v.id), v]));
  const subtotal = rows.reduce((a, r) => a + (Number(r.qty) || 0) * (r.price ? toCents(r.price) : vmap.get(r.variant)?.price_cents ?? 0), 0);
  const total = Math.max(subtotal - toCents(discount) + toCents(shipping), 0);
  const minDeposit = Math.ceil((total * minDepositPct) / 100);
  const up = (key: number, p: Partial<(typeof rows)[number]>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <form action={action} className="space-y-5">
      <section className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:grid-cols-3">
        <Field label="Cliente" className="sm:col-span-2" hint={<>¿No está registrada? <Link className="underline" href="/clientes/nuevo">Crear cliente</Link></>}>
          <select name="customer_id" required defaultValue={initialCustomer ?? ""} className="input">
            <option value="" disabled>Seleccione…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Canal">
          <select name="channel" defaultValue="whatsapp" className="input">
            <option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option>
            <option value="store">En tienda</option><option value="online">Web</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="is_special_order" checked={special} onChange={(e) => setSpecial(e.target.checked)} className="h-4 w-4 accent-pink" />
          Es un <b>encargo</b> (mercancía que se pide para la clienta): requiere anticipo mínimo de {minDepositPct}%
        </label>
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-3 text-[15px] font-semibold">Artículos</h2>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_70px_120px_36px] items-center gap-2 max-md:grid-cols-2">
              <div className="max-md:col-span-2">
                <select name="item_variant" value={r.variant} onChange={(e) => up(r.key, { variant: e.target.value, price: "" })} className="input">
                  <option value="">{special ? "Artículo por encargo (escribir abajo)" : "Seleccione un producto…"}</option>
                  {variants.map((v) => <option key={v.id} value={v.id}>{v.label} · {formatMoney(v.price_cents)} · {v.stock} disp.</option>)}
                </select>
                {!r.variant && special && (
                  <input name="item_desc" value={r.desc} onChange={(e) => up(r.key, { desc: e.target.value })}
                         placeholder="Descripción del artículo por encargo" className="input mt-1" />
                )}
                {(r.variant || !special) && <input type="hidden" name="item_desc" value="" />}
              </div>
              <input name="item_qty" value={r.qty} onChange={(e) => up(r.key, { qty: e.target.value })} inputMode="numeric" aria-label="Cantidad" className="input" />
              <input name="item_price" value={r.price} onChange={(e) => up(r.key, { price: e.target.value })} inputMode="decimal"
                     placeholder={r.variant ? ((vmap.get(r.variant)?.price_cents ?? 0) / 100).toFixed(2) : "Precio"} aria-label="Precio" className="input" />
              <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} disabled={rows.length === 1}
                      className="grid h-9 place-items-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows([...rows, { key: Date.now(), variant: "", desc: "", qty: "1", price: "" }])}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-pink-strong hover:underline"><Plus className="h-4 w-4" /> Agregar artículo</button>
      </section>

      <section className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Descuento"><input name="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0.00" className="input" /></Field>
        <Field label="Envío"><input name="shipping" value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="decimal" placeholder="0.00" className="input" /></Field>
        <Field label="Fecha estimada de entrega"><input type="date" name="expected_date" className="input" /></Field>
        <Field label="Provincia / municipio">
          <div className="flex gap-2"><input name="province" placeholder="Provincia" className="input" /><input name="municipality" placeholder="Municipio" className="input" /></div>
        </Field>
        <Field label="Dirección de envío" className="sm:col-span-2"><input name="shipping_address" className="input" /></Field>
        <Field label="Notas" className="sm:col-span-2"><input name="notes" className="input" /></Field>
      </section>

      <section className="grid gap-4 rounded-[var(--radius-card)] border border-blush bg-blush-soft/60 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Total del pedido</p>
          <p className="tabular text-2xl font-bold text-plum">{formatMoney(total)}</p>
          {special && <p className="text-xs text-pink-strong">Anticipo mínimo: {formatMoney(minDeposit)}</p>}
        </div>
        <Field label={special ? "Anticipo (obligatorio)" : "Anticipo / pago (opcional)"}>
          <input name="deposit_amount" value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" placeholder="0.00" className="input" />
        </Field>
        <Field label="Método">
          <select name="deposit_method" defaultValue="transfer" className="input">
            <option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option>
          </select>
        </Field>
        <Field label="Referencia"><input name="deposit_reference" className="input" /></Field>
      </section>

      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton>Crear pedido</SubmitButton></div>
    </form>
  );
}
