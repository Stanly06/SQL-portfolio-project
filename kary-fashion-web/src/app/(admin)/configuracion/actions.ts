"use server";

import { parseIntStrict, text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";

const OWNER_ONLY = "Solo la dueña puede cambiar la configuración.";

export async function saveBusiness(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx, user) => {
    if (!user.isOwner) throw new UserError(OWNER_ONLY);
    const value = {
      name: text(form.get("name")), address: text(form.get("address")), phone: text(form.get("phone")),
      instagram: text(form.get("instagram")), tiktok: text(form.get("tiktok")), rnc: text(form.get("rnc")),
    };
    await tx`update public.settings set value = ${tx.json(value)}::jsonb where key = 'business'`;
    return "Datos del negocio guardados.";
  }, { admin: true, revalidate: ["/configuracion", "/ventas"] });
}

export async function saveRules(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx, user) => {
    if (!user.isOwner) throw new UserError(OWNER_ONLY);
    const discount = parseIntStrict(form.get("employee_max_pct"), "descuento máximo");
    const deposit = parseIntStrict(form.get("min_deposit_pct"), "anticipo mínimo");
    await tx`update public.settings set value = jsonb_set(value, '{employee_max_pct}', ${tx.json(discount)}::jsonb) where key = 'discounts'`;
    await tx`update public.settings set value = jsonb_set(value, '{min_deposit_pct}', ${tx.json(deposit)}::jsonb) where key = 'orders'`;
    return "Reglas actualizadas.";
  }, { admin: true, revalidate: ["/configuracion"] });
}

export async function saveTax(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx, user) => {
    if (!user.isOwner) throw new UserError(OWNER_ONLY);
    const charges = form.get("charges_itbis") === "on";
    if (charges) {
      const [b] = await tx<{ rnc: string | null }[]>`select value ->> 'rnc' as rnc from public.settings where key = 'business'`;
      if (!b?.rnc) throw new UserError("Para cobrar ITBIS primero registre el RNC del negocio en «Datos del negocio».");
    }
    const rate = parseIntStrict(form.get("itbis_rate_pct"), "tasa de ITBIS");
    await tx`update public.settings set value = jsonb_set(jsonb_set(value, '{charges_itbis}', ${tx.json(charges)}::jsonb),
                                                          '{itbis_rate_pct}', ${tx.json(rate)}::jsonb) where key = 'tax'`;
    return charges ? "ITBIS activado." : "ITBIS desactivado: las ventas no llevan impuesto.";
  }, { admin: true, revalidate: ["/configuracion"] });
}

export async function setRole(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const role = String(form.get("role"));
    if (!["owner", "admin", "employee", "customer"].includes(role)) throw new UserError("Rol inválido.");
    await tx`select public.set_user_role(${String(form.get("user_id"))}::uuid, ${role}, ${form.get("active") === "on"})`;
    return "Acceso actualizado.";
  }, { admin: true, revalidate: ["/configuracion"] });
}
