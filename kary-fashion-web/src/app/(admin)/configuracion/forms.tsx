"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { saveBusiness, saveRules, saveStore, saveTax, setRole } from "./actions";

type Business = { name?: string | null; address?: string | null; phone?: string | null; instagram?: string | null; tiktok?: string | null; rnc?: string | null };

export function BusinessForm({ b, canEdit }: { b: Business; canEdit: boolean }) {
  const [state, action] = useActionState(saveBusiness, null);
  return (
    <form action={action} className="space-y-3">
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre comercial"><input name="name" defaultValue={b.name ?? ""} required className="input" /></Field>
        <Field label="Teléfono / WhatsApp"><input name="phone" defaultValue={b.phone ?? ""} className="input" /></Field>
        <Field label="Dirección" className="sm:col-span-2"><input name="address" defaultValue={b.address ?? ""} className="input" /></Field>
        <Field label="Instagram"><input name="instagram" defaultValue={b.instagram ?? ""} className="input" /></Field>
        <Field label="TikTok"><input name="tiktok" defaultValue={b.tiktok ?? ""} className="input" /></Field>
        <Field label="RNC" hint="Déjelo vacío si el negocio no tiene RNC."><input name="rnc" defaultValue={b.rnc ?? ""} className="input" /></Field>
      </fieldset>
      <FormMessage state={state} />
      {canEdit && <div className="flex justify-end"><SubmitButton>Guardar datos</SubmitButton></div>}
    </form>
  );
}

export function RulesForm({ discount, deposit, canEdit }: { discount: number; deposit: number; canEdit: boolean }) {
  const [state, action] = useActionState(saveRules, null);
  return (
    <form action={action} className="space-y-3">
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Descuento máximo de las empleadas (%)" hint="Descuentos mayores solo los puede dar la dueña o una administradora.">
          <input name="employee_max_pct" type="number" min={0} max={100} defaultValue={discount} className="input" />
        </Field>
        <Field label="Anticipo mínimo de los encargos (%)" hint="100% = el encargo se paga completo por adelantado (como hoy).">
          <input name="min_deposit_pct" type="number" min={0} max={100} defaultValue={deposit} className="input" />
        </Field>
      </fieldset>
      <p className="text-xs text-muted">Las ventas en tienda siempre se cobran completas: el sistema no permite ventas a crédito.</p>
      <FormMessage state={state} />
      {canEdit && <div className="flex justify-end"><SubmitButton>Guardar reglas</SubmitButton></div>}
    </form>
  );
}

export function TaxForm({ charges, rate, canEdit }: { charges: boolean; rate: number; canEdit: boolean }) {
  const [state, action] = useActionState(saveTax, null);
  return (
    <form action={action} className="space-y-3">
      <fieldset disabled={!canEdit} className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="charges_itbis" defaultChecked={charges} className="h-4 w-4 accent-pink" />
          El negocio está registrado y cobra ITBIS
        </label>
        <Field label="Tasa de ITBIS (%)" className="max-w-48"><input name="itbis_rate_pct" type="number" min={0} max={30} defaultValue={rate} className="input" /></Field>
      </fieldset>
      <p className="text-xs text-muted">
        Sin RNC las facturas son comerciales, sin ITBIS ni comprobante fiscal (NCF). Si en el futuro se registra en la DGII,
        se activa aquí y se cargan las secuencias de NCF autorizadas.
      </p>
      <FormMessage state={state} />
      {canEdit && <div className="flex justify-end"><SubmitButton>Guardar</SubmitButton></div>}
    </form>
  );
}

export function UserRoleForm({ id, role, active, isSelf }: { id: string; role: string; active: boolean; isSelf: boolean }) {
  const [state, action] = useActionState(setRole, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="user_id" value={id} />
      <select name="role" defaultValue={role} disabled={isSelf} aria-label="Rol" className="input w-auto py-1.5">
        <option value="owner">Dueña</option><option value="admin">Administradora</option>
        <option value="employee">Empleada</option><option value="customer">Sin acceso al panel</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="checkbox" name="active" defaultChecked={active} disabled={isSelf} className="accent-pink" /> activa
      </label>
      {!isSelf && <SubmitButton variant="outline" pendingText="…" className="px-3 py-1.5 text-xs">Guardar</SubmitButton>}
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.message && <span className="text-xs text-success">✓</span>}
    </form>
  );
}

type Store = { open?: boolean; whatsapp?: string | null; announcement?: string | null; delivery_fee_cents?: number; pickup_address?: string | null;
  bank_name?: string | null; account_type?: string | null; account_number?: string | null; account_holder?: string | null };

export function StoreForm({ s, canEdit }: { s: Store; canEdit: boolean }) {
  const [state, action] = useActionState(saveStore, null);
  return (
    <form action={action} className="space-y-3">
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="open" defaultChecked={s.open ?? true} className="h-4 w-4 accent-pink" /> La tienda online recibe pedidos
        </label>
        <Field label="WhatsApp de la tienda" hint="Adonde las clientas envían el comprobante."><input name="whatsapp" defaultValue={s.whatsapp ?? ""} className="input" /></Field>
        <Field label="Mensaje en la barra superior"><input name="announcement" defaultValue={s.announcement ?? ""} placeholder="Envíos a todo el país" className="input" /></Field>
        <Field label="Costo de envío (RD$)"><input name="delivery_fee" inputMode="decimal" defaultValue={((s.delivery_fee_cents ?? 0) / 100).toFixed(2)} className="input" /></Field>
        <Field label="Dirección para retirar"><input name="pickup_address" defaultValue={s.pickup_address ?? ""} className="input" /></Field>
        <Field label="Banco"><input name="bank_name" defaultValue={s.bank_name ?? ""} placeholder="Banreservas, Popular, BHD…" className="input" /></Field>
        <Field label="Tipo de cuenta"><input name="account_type" defaultValue={s.account_type ?? ""} placeholder="Ahorros / Corriente" className="input" /></Field>
        <Field label="Número de cuenta"><input name="account_number" defaultValue={s.account_number ?? ""} className="input" /></Field>
        <Field label="A nombre de"><input name="account_holder" defaultValue={s.account_holder ?? ""} className="input" /></Field>
      </fieldset>
      <p className="text-xs text-muted">La cuenta se muestra a la clienta después de hacer su pedido, para que transfiera.</p>
      <FormMessage state={state} />
      {canEdit && <div className="flex justify-end"><SubmitButton>Guardar tienda</SubmitButton></div>}
    </form>
  );
}
