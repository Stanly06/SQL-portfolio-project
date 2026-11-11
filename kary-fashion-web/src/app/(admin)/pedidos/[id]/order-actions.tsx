"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import { addPayment, changeStatus, completeOrder } from "../actions";

export function OrderActions({ id, balance, paid, isAdmin, transitions, canDeliver, missingStock }: {
  id: number; balance: number; paid: number; isAdmin: boolean; transitions: string[]; canDeliver: boolean; missingStock: string[];
}) {
  const [ps, pay] = useActionState(addPayment, null);
  const [ss, status] = useActionState(changeStatus, null);
  const [ds, deliver] = useActionState(completeOrder, null);
  const forward = transitions.filter((t) => t !== "cancelled");

  return (
    <>
      {canDeliver && (
        <section className="rounded-[var(--radius-card)] border border-pink/30 bg-blush-soft/70 p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-[15px] font-semibold">Entregar y facturar</h2>
          <p className="mb-3 mt-1 text-xs text-muted">Se cobra el balance ({formatMoney(balance)}), se descuenta el inventario y se genera la factura.</p>
          {missingStock.length > 0 && <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">Falta existencia de: {missingStock.join(", ")}. Registre la compra antes de entregar.</p>}
          <form action={deliver} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            {balance > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <input name="transfer_amount" inputMode="decimal" placeholder="Transferencia" aria-label="Transferencia" className="input" />
                <input name="transfer_reference" placeholder="Referencia" aria-label="Referencia" className="input" />
                <input name="card_amount" inputMode="decimal" placeholder="Tarjeta" aria-label="Tarjeta" className="input" />
                <input name="card_reference" placeholder="Aprobación" aria-label="Aprobación" className="input" />
                <input name="cash_received" inputMode="decimal" placeholder={`Efectivo recibido (${(balance / 100).toFixed(2)})`} aria-label="Efectivo recibido" className="input col-span-2" />
              </div>
            )}
            <FormMessage state={ds} />
            <SubmitButton className="w-full" pendingText="Facturando…">Entregar y facturar</SubmitButton>
          </form>
        </section>
      )}

      {balance > 0 && (
        <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 text-[15px] font-semibold">Registrar abono</h2>
          <form action={pay} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            <div className="grid grid-cols-2 gap-2">
              <input name="amount" inputMode="decimal" placeholder={`Monto (máx. ${(balance / 100).toFixed(2)})`} aria-label="Monto" className="input col-span-2" />
              <select name="method" defaultValue="transfer" aria-label="Método" className="input">
                <option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option>
              </select>
              <input name="reference" placeholder="Referencia" aria-label="Referencia" className="input" />
            </div>
            <FormMessage state={ps} />
            <SubmitButton variant="outline" className="w-full">Registrar abono</SubmitButton>
          </form>
        </section>
      )}

      <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-3 text-[15px] font-semibold">Cambiar estado</h2>
        <div className="flex flex-wrap gap-2">
          {forward.map((t) => (
            <form key={t} action={status}>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={t} />
              <SubmitButton variant="outline" className="px-3 py-1.5 text-xs">{ORDER_STATUS_LABEL[t]}</SubmitButton>
            </form>
          ))}
        </div>
        {transitions.includes("cancelled") && (
          <form action={status} className="mt-4 space-y-2 border-t border-line pt-4">
            <input type="hidden" name="id" value={id} /><input type="hidden" name="to" value="cancelled" />
            <Field label="Cancelar pedido"><input name="note" required placeholder="Motivo" className="input" /></Field>
            {paid > 0 && (isAdmin
              ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="refund" className="accent-pink" /> Devolver lo pagado ({formatMoney(paid)})</label>
              : <p className="text-xs text-muted">El anticipo queda retenido. Solo la administración autoriza devoluciones.</p>)}
            <SubmitButton variant="danger" confirm="¿Cancelar este pedido?">Cancelar pedido</SubmitButton>
          </form>
        )}
        <div className="mt-3"><FormMessage state={ss} /></div>
      </section>
    </>
  );
}
