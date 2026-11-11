"use server";

import { parseMoney, text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";

export async function closeRegister(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const date = String(form.get("date"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Fecha inválida.");
    if (String(form.get("counted") ?? "").trim() === "") throw new UserError("Escriba cuánto efectivo contó en la caja.");
    const opening = parseMoney(form.get("opening"), "fondo inicial");
    const counted = parseMoney(form.get("counted"), "efectivo contado");
    await tx`select public.close_cash_register(${date}::date, ${opening}, ${counted}, ${text(form.get("notes"))})`;
    return "Caja cerrada.";
  }, { revalidate: ["/caja"] });
}
