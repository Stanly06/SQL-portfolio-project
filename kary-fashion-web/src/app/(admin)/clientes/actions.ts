"use server";

import { redirect } from "next/navigation";
import { text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";

const PROVINCIAS_OK = /^[\p{L} .'-]{0,60}$/u;

function readCustomer(form: FormData) {
  const fullName = text(form.get("full_name"));
  if (!fullName) throw new UserError("Escriba el nombre del cliente.");
  const phone = text(form.get("phone"));
  if (phone && !/^[\d\s()+-]{7,20}$/.test(phone)) throw new UserError("El teléfono no es válido.");
  const email = text(form.get("email"));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("El correo no es válido.");
  const province = text(form.get("province"));
  if (province && !PROVINCIAS_OK.test(province)) throw new UserError("Provincia inválida.");
  return {
    full_name: fullName, phone, whatsapp: text(form.get("whatsapp")) ?? phone, email,
    document_id: text(form.get("document_id")), address: text(form.get("address")), province,
    municipality: text(form.get("municipality")), notes: text(form.get("notes")),
  };
}

export async function createCustomer(_: ActionState, form: FormData): Promise<ActionState> {
  let id = 0;
  const res = await mutate(async (tx) => {
    const c = readCustomer(form);
    const [row] = await tx<{ id: number }[]>`insert into public.customers ${tx(c)} returning id`;
    id = row.id;
  }, { revalidate: ["/clientes"] });
  if (res?.ok) redirect(`/clientes/${id}`);
  return res;
}

export async function updateCustomer(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const c = readCustomer(form);
    await tx`update public.customers set ${tx(c)}, updated_at = now() where id = ${Number(form.get("id"))}`;
    return "Datos del cliente actualizados.";
  }, { revalidate: ["/clientes"] });
}
