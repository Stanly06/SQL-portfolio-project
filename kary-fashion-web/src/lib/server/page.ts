import "server-only";
import { authMode, requireAdmin, requireUser, type CurrentUser } from "./auth";
import { asUser, type Tx } from "./db";

/** Carga datos de una página como la usuaria actual (con RLS). Devuelve null en modo demostración. */
export async function loadAs<T>(fn: (tx: Tx, user: CurrentUser) => Promise<T>, opts?: { admin?: boolean }) {
  if (authMode() === "demo") return null;
  const user = opts?.admin ? await requireAdmin() : await requireUser();
  const data = await asUser(user.id, (tx) => fn(tx, user));
  return { user, data };
}
