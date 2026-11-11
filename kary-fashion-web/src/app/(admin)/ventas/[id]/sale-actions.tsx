"use client";

import { useActionState, useState } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { cancelSale, registerReturn } from "../actions";

export function InvoiceToolbar({ waText, phone }: { waText: string; phone: string | null }) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `1${digits}` : digits;
  return (
    <>
      <a href={`https://wa.me/${to}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer"
         className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-success hover:bg-success-soft">
        <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
      </a>
      <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-pink px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-strong">
        <Printer className="h-4 w-4" /> Imprimir / PDF
      </button>
    </>
  );
}

export function SaleAdminActions({ id, items, canCancel }: { id: number; canCancel: boolean;
  items: { id: number; description: string; available: number }[] }) {
  const [tab, setTab] = useState<"none" | "return" | "cancel">("none");
  const [cs, cancel] = useActionState(cancelSale, null);
  const [rs, ret] = useActionState(registerReturn, null);
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] print:hidden">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab(tab === "return" ? "none" : "return")} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-plum hover:bg-blush-soft">Registrar devolución</button>
        {canCancel && <button onClick={() => setTab(tab === "cancel" ? "none" : "cancel")} className="rounded-xl border border-danger/30 px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft">Anular venta</button>}
      </div>
      {tab === "cancel" && (
        <form action={cancel} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={id} />
          <Field label="Motivo de la anulación"><input name="reason" required className="input" placeholder="Error al digitar, venta duplicada…" /></Field>
          <p className="text-xs text-muted">La mercancía vuelve al inventario y los pagos quedan como reembolsados.</p>
          <FormMessage state={cs} />
          <SubmitButton variant="danger" confirm="¿Anular esta venta? No se puede deshacer.">Anular venta</SubmitButton>
        </form>
      )}
      {tab === "return" && (
        <form action={ret} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={id} />
          {items.filter((i) => i.available > 0).map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 text-sm">
              <input type="hidden" name="item_id" value={i.id} />
              <span className="min-w-48 flex-1">{i.description}</span>
              <input name="qty" type="number" min={0} max={i.available} defaultValue={0} aria-label="Cantidad a devolver" className="input w-20 py-1.5" />
              <span className="text-xs text-muted">de {i.available}</span>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="restock" value={i.id} defaultChecked className="accent-pink" /> vuelve al inventario</label>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Motivo"><input name="reason" required className="input" placeholder="Talla incorrecta…" /></Field>
            <Field label="Reembolso">
              <select name="refund_method" className="input">
                <option value="">Sin reembolso (cambio por otra pieza)</option>
                <option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option>
              </select>
            </Field>
          </div>
          <FormMessage state={rs} />
          <SubmitButton>Registrar devolución</SubmitButton>
        </form>
      )}
    </section>
  );
}
