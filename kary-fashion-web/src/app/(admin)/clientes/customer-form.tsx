"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/server/actions";

export interface CustomerValues {
  id?: number; full_name?: string; phone?: string | null; whatsapp?: string | null; email?: string | null;
  document_id?: string | null; address?: string | null; province?: string | null; municipality?: string | null; notes?: string | null;
}

export function CustomerForm({ action, c = {}, submit = "Guardar cliente" }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>; c?: CustomerValues; submit?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" className="sm:col-span-2"><input name="full_name" required defaultValue={c.full_name ?? ""} className="input" /></Field>
        <Field label="Teléfono"><input name="phone" type="tel" defaultValue={c.phone ?? ""} placeholder="809-555-0101" className="input" /></Field>
        <Field label="WhatsApp" hint="Si se deja vacío, se usa el teléfono."><input name="whatsapp" type="tel" defaultValue={c.whatsapp ?? ""} className="input" /></Field>
        <Field label="Correo"><input name="email" type="email" defaultValue={c.email ?? ""} className="input" /></Field>
        <Field label="Cédula o RNC" hint="Necesario para facturas de crédito fiscal."><input name="document_id" defaultValue={c.document_id ?? ""} className="input" /></Field>
        <Field label="Provincia"><input name="province" defaultValue={c.province ?? ""} placeholder="Valverde" className="input" /></Field>
        <Field label="Municipio"><input name="municipality" defaultValue={c.municipality ?? ""} placeholder="Mao" className="input" /></Field>
        <Field label="Dirección" className="sm:col-span-2"><input name="address" defaultValue={c.address ?? ""} className="input" /></Field>
        <Field label="Notas" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={c.notes ?? ""} placeholder="Tallas preferidas, gustos…" className="input" /></Field>
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton>{submit}</SubmitButton></div>
    </form>
  );
}
