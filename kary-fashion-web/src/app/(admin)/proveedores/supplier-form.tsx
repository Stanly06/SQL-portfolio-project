"use client";

import { useActionState, useRef } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { saveSupplier } from "./actions";

export interface SupplierValues { id?: number; name?: string; contact?: string | null; phone?: string | null; whatsapp?: string | null;
  email?: string | null; rnc?: string | null; address?: string | null; notes?: string | null }

export function SupplierForm({ s = {} }: { s?: SupplierValues }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (prev: Parameters<typeof saveSupplier>[0], f: FormData) => {
    const r = await saveSupplier(prev, f);
    if (r?.ok && !s.id) ref.current?.reset();
    return r;
  }, null);
  return (
    <form ref={ref} action={action} className="space-y-3">
      {s.id && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2"><input name="name" required defaultValue={s.name ?? ""} className="input" /></Field>
        <Field label="Persona de contacto"><input name="contact" defaultValue={s.contact ?? ""} className="input" /></Field>
        <Field label="Teléfono"><input name="phone" defaultValue={s.phone ?? ""} className="input" /></Field>
        <Field label="WhatsApp"><input name="whatsapp" defaultValue={s.whatsapp ?? ""} className="input" /></Field>
        <Field label="Correo"><input name="email" type="email" defaultValue={s.email ?? ""} className="input" /></Field>
        <Field label="RNC"><input name="rnc" defaultValue={s.rnc ?? ""} className="input" /></Field>
        <Field label="Dirección"><input name="address" defaultValue={s.address ?? ""} className="input" /></Field>
        <Field label="Notas" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={s.notes ?? ""} className="input" /></Field>
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton>{s.id ? "Guardar cambios" : "Agregar proveedor"}</SubmitButton></div>
    </form>
  );
}
