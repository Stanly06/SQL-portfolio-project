"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";
import { closeRegister } from "./actions";

const toCents = (s: string) => Math.round((Number(s.replace(/,/g, "")) || 0) * 100);

export function CloseForm({ date, cashNet }: { date: string; cashNet: number }) {
  const [state, action] = useActionState(closeRegister, null);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const expected = toCents(opening) + cashNet;
  const diff = counted.trim() ? toCents(counted) - expected : null;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="date" value={date} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fondo inicial (efectivo al abrir)">
          <input name="opening" value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" placeholder="0.00" className="input" />
        </Field>
        <Field label="Efectivo contado al cerrar">
          <input name="counted" value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" placeholder="0.00" required className="input" />
        </Field>
      </div>
      <div className="rounded-2xl bg-cream p-4 text-sm">
        <p className="flex justify-between"><span className="text-muted">Debe haber en caja</span><b className="tabular">{formatMoney(expected)}</b></p>
        {diff !== null && (
          <p className={`mt-1 flex justify-between font-semibold ${diff === 0 ? "text-success" : diff < 0 ? "text-danger" : "text-[#9a5a08]"}`}>
            <span>{diff === 0 ? "Cuadra exacto" : diff < 0 ? "Faltante" : "Sobrante"}</span><span className="tabular">{formatMoney(Math.abs(diff))}</span>
          </p>
        )}
      </div>
      <Field label="Notas"><input name="notes" placeholder="Opcional: explique cualquier diferencia" className="input" /></Field>
      <FormMessage state={state} />
      <SubmitButton confirm="¿Cerrar la caja? El cierre no se puede modificar.">Cerrar caja</SubmitButton>
    </form>
  );
}
