"use server";

import { parseIntStrict, text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";

export async function adjustStock(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const id = Number(form.get("variant_id"));
    const qty = parseIntStrict(form.get("new_stock"), "existencia");
    const reason = text(form.get("reason"));
    if (!reason) throw new UserError("Escriba el motivo (conteo físico, mercancía dañada, regalo…).");
    const [r] = await tx<{ stock: number }[]>`select public.adjust_stock(${id}, ${qty}, ${reason}) as stock`;
    return `Existencia ajustada a ${r.stock}.`;
  }, { admin: true, revalidate: ["/inventario", "/productos", "/"] });
}
