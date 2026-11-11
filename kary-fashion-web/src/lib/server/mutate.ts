import "server-only";
import { revalidatePath } from "next/cache";
import { toErrorState, type ActionState } from "./actions";
import { requireAdmin, requireUser, type CurrentUser } from "./auth";
import { asUser, type Tx } from "./db";

/**
 * Ejecuta una acción de formulario como la usuaria actual.
 * Si devuelve un string, se usa como mensaje de éxito. Los errores se traducen al español.
 */
export async function mutate(
  fn: (tx: Tx, user: CurrentUser) => Promise<string | void>,
  opts: { admin?: boolean; revalidate?: string[] } = {},
): Promise<ActionState> {
  try {
    const user = opts.admin ? await requireAdmin() : await requireUser();
    const message = await asUser(user.id, (tx) => fn(tx, user));
    opts.revalidate?.forEach((p) => revalidatePath(p));
    return { ok: true, message: message || "Guardado." };
  } catch (e) {
    return toErrorState(e);
  }
}
