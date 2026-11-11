"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";
import { createPurchase } from "./actions";

export interface VariantOption { id: number; label: string; last_cost_cents: number | null }

const toCents = (s: string) => Math.round((Number(s.replace(/,/g, "")) || 0) * 100);

export function PurchaseForm({ suppliers, variants, today, preselect }: {
  suppliers: { id: number; name: string }[]; variants: VariantOption[]; today: string; preselect?: number;
}) {
  const [state, action] = useActionState(createPurchase, null);
  const [rows, setRows] = useState([{ key: 0, variant: preselect ? String(preselect) : "", qty: "", cost: "" }]);
  const [shipping, setShipping] = useState("");
  const [other, setOther] = useState("");
  const byId = useMemo(() => new Map(variants.map((v) => [String(v.id), v])), [variants]);
  const subtotal = rows.reduce((a, r) => a + (Number(r.qty) || 0) * toCents(r.cost), 0);
  const extra = toCents(shipping) + toCents(other);

  const update = (key: number, patch: Partial<(typeof rows)[number]>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-5">
      <section className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Proveedor">
          <select name="supplier_id" defaultValue="" className="input">
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input type="date" name="order_date" defaultValue={today} className="input" /></Field>
        <Field label="No. factura del proveedor"><input name="supplier_invoice" className="input" /></Field>
        <Field label="Notas"><input name="notes" className="input" /></Field>
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-3 text-[15px] font-semibold">Artículos comprados</h2>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_80px_120px_36px] items-center gap-2 max-sm:grid-cols-2">
              <select name="variant_id" value={r.variant} required className="input max-sm:col-span-2"
                      onChange={(e) => {
                        const v = byId.get(e.target.value);
                        update(r.key, { variant: e.target.value, cost: r.cost || (v?.last_cost_cents ? (v.last_cost_cents / 100).toFixed(2) : "") });
                      }}>
                <option value="">Seleccione producto, color y talla…</option>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <input name="quantity" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} inputMode="numeric"
                     placeholder="Cant." aria-label="Cantidad" className="input" />
              <input name="unit_cost" value={r.cost} onChange={(e) => update(r.key, { cost: e.target.value })} inputMode="decimal"
                     placeholder="Costo unid." aria-label="Costo por unidad" className="input" />
              <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} disabled={rows.length === 1}
                      className="grid h-9 place-items-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30" aria-label="Quitar">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows([...rows, { key: Date.now(), variant: "", qty: "", cost: "" }])}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-pink-strong hover:underline">
          <Plus className="h-4 w-4" /> Agregar artículo
        </button>
        <p className="mt-2 text-xs text-muted">¿El producto no aparece? Créelo primero en <Link href="/productos/nuevo" className="underline">Productos</Link>.</p>
      </section>

      <section className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Transporte" hint="Se reparte entre los artículos para calcular su costo real.">
          <input name="shipping" value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="decimal" placeholder="0.00" className="input" />
        </Field>
        <Field label="Otros costos" hint="Aduana, envío del courier, empaques…">
          <input name="other_costs" value={other} onChange={(e) => setOther(e.target.value)} inputMode="decimal" placeholder="0.00" className="input" />
        </Field>
        <div className="rounded-2xl bg-cream p-4 text-sm sm:col-span-2">
          <p className="flex justify-between"><span className="text-muted">Mercancía</span><b className="tabular">{formatMoney(subtotal)}</b></p>
          <p className="flex justify-between"><span className="text-muted">Transporte y otros</span><b className="tabular">{formatMoney(extra)}</b></p>
          <p className="mt-1 flex justify-between border-t border-line pt-1 text-base"><span className="font-semibold text-plum">Total invertido</span>
            <b className="tabular text-pink-strong">{formatMoney(subtotal + extra)}</b></p>
        </div>
      </section>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="receive_now" defaultChecked className="h-4 w-4 accent-pink" />
        La mercancía ya llegó: sumarla al inventario ahora
      </label>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton>Registrar compra</SubmitButton></div>
    </form>
  );
}
