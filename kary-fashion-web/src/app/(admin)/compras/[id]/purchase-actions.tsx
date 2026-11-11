"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { cancelPurchase, receivePurchase } from "../actions";

export function PurchaseActions({ id }: { id: number }) {
  const [rs, receive] = useActionState(receivePurchase, null);
  const [cs, cancel] = useActionState(cancelPurchase, null);
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <FormMessage state={rs ?? cs} />
      <form action={cancel}><input type="hidden" name="id" value={id} />
        <SubmitButton variant="outline" confirm="¿Cancelar esta compra?">Cancelar compra</SubmitButton></form>
      <form action={receive}><input type="hidden" name="id" value={id} />
        <SubmitButton confirm="¿Confirmar que la mercancía llegó completa?">Recibir mercancía</SubmitButton></form>
    </div>
  );
}
