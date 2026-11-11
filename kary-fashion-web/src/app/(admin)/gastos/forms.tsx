"use client";

import { useActionState, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { EXPENSE_CATEGORY } from "@/lib/labels";
import { createExpense, deleteExpense } from "./actions";

export function ExpenseForm({ today }: { today: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (p: Parameters<typeof createExpense>[0], f: FormData) => {
    const r = await createExpense(p, f);
    if (r?.ok) ref.current?.reset();
    return r;
  }, null);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <Field label="Categoría">
        <select name="category" required defaultValue="" className="input">
          <option value="" disabled>Seleccione…</option>
          {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Concepto"><input name="concept" required placeholder="Alquiler de noviembre" className="input" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto"><input name="amount" required inputMode="decimal" placeholder="0.00" className="input" /></Field>
        <Field label="Fecha"><input type="date" name="expense_date" defaultValue={today} max={today} className="input" /></Field>
      </div>
      <Field label="Pagado con" hint="Si sale del efectivo de la caja, el cierre del día lo descuenta.">
        <select name="payment_method" defaultValue="cash" className="input">
          <option value="cash">Efectivo de la caja</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option>
        </select>
      </Field>
      <Field label="Notas"><input name="notes" className="input" /></Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Registrar gasto</SubmitButton>
    </form>
  );
}

export function DeleteExpense({ id }: { id: number }) {
  const [state, action] = useActionState(deleteExpense, null);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="outline" pendingText="…" confirm="¿Eliminar este gasto?" className="px-2 py-1">
        <Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Eliminar</span>
      </SubmitButton>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
