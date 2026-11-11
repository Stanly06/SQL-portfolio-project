"use server";

import { parseMoney, text, UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";
import { EXPENSE_CATEGORY } from "@/lib/labels";

export async function createExpense(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const category = String(form.get("category"));
    if (!(category in EXPENSE_CATEGORY)) throw new UserError("Seleccione la categoría.");
    const concept = text(form.get("concept"));
    if (!concept) throw new UserError("Escriba el concepto del gasto.");
    const amount = parseMoney(form.get("amount"), "monto");
    if (amount <= 0) throw new UserError("Indique el monto.");
    const method = String(form.get("payment_method"));
    if (!["cash", "transfer", "card"].includes(method)) throw new UserError("Método de pago inválido.");
    const date = String(form.get("expense_date") || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Fecha inválida.");
    const closed = await tx`select 1 from public.cash_closings where business_date = ${date}::date`;
    if (closed.length && method === "cash") throw new UserError("La caja de ese día ya está cerrada; un gasto en efectivo cambiaría el cuadre.");
    await tx`insert into public.expenses (expense_date, category, concept, amount_cents, payment_method, is_financial, notes, created_by)
             values (${date}::date, ${category}::public.expense_category, ${concept}, ${amount}, ${method}::public.payment_method,
                     ${category === "bank_fees"}, ${text(form.get("notes"))}, auth.uid())`;
    return "Gasto registrado.";
  }, { admin: true, revalidate: ["/gastos", "/ganancias", "/caja", "/"] });
}

export async function deleteExpense(_: ActionState, form: FormData): Promise<ActionState> {
  return mutate(async (tx) => {
    const id = Number(form.get("id"));
    const [e] = await tx<{ expense_date: Date; payment_method: string }[]>`select expense_date, payment_method::text from public.expenses where id = ${id}`;
    if (!e) throw new UserError("El gasto no existe.");
    const closed = await tx`select 1 from public.cash_closings where business_date = ${e.expense_date}`;
    if (closed.length && e.payment_method === "cash") throw new UserError("Ese día ya tiene cierre de caja; no se puede borrar un gasto en efectivo.");
    await tx`delete from public.expenses where id = ${id}`;
    return "Gasto eliminado (queda en la auditoría).";
  }, { admin: true, revalidate: ["/gastos", "/ganancias", "/caja", "/"] });
}
