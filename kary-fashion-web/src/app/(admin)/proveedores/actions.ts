"use server";

import { text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";

function read(form: FormData) {
  const name = text(form.get("name"));
  if (!name) throw new UserError("Escriba el nombre del proveedor.");
  return { name, contact: text(form.get("contact")), phone: text(form.get("phone")), whatsapp: text(form.get("whatsapp")),
    email: text(form.get("email")), rnc: text(form.get("rnc")), address: text(form.get("address")), notes: text(form.get("notes")) };
}

export async function saveSupplier(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const s = read(form);
    const id = Number(form.get("id")) || null;
    if (id) {
      await tx`update public.suppliers set ${tx(s)}, active = ${form.get("active") !== "off"} where id = ${id}`;
      return "Proveedor actualizado.";
    }
    await tx`insert into public.suppliers ${tx(s)}`;
    return `Proveedor «${s.name}» registrado.`;
  }, { admin: true, revalidate: ["/proveedores", "/compras/nueva"] });
}
