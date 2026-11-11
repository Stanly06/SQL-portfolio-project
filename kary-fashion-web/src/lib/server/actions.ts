import "server-only";
import { dbErrorMessage } from "./db";

/** Resultado estándar de los formularios: mensaje de error o de éxito. */
export type ActionState = { ok?: boolean; error?: string; message?: string; data?: Record<string, unknown> } | null;

/** "1,250.50" / "RD$ 950" -> centavos. Lanza error si no es un número válido. */
export function parseMoney(value: FormDataEntryValue | null | undefined, field = "monto"): number {
  const raw = String(value ?? "").replace(/RD\$|\$|,|\s/g, "");
  if (raw === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new UserError(`El ${field} no es válido: «${value}».`);
  const [ent, dec = ""] = raw.split(".");
  return Number(ent) * 100 + Number((dec + "00").slice(0, 2));
}

export function parseIntStrict(value: FormDataEntryValue | null | undefined, field = "cantidad"): number {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+$/.test(raw)) throw new UserError(`La ${field} debe ser un número entero.`);
  return Number(raw);
}

export function text(value: FormDataEntryValue | null | undefined): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

export class UserError extends Error {}

export function toErrorState(e: unknown): ActionState {
  // redirect() y notFound() de Next deben propagarse
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  if (e instanceof UserError) return { error: e.message };
  console.error(e);
  return { error: dbErrorMessage(e) };
}
