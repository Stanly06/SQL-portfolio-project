import "server-only";
import postgres from "postgres";

/**
 * Conexión directa a PostgreSQL (Supabase o local).
 * Cada consulta de usuario corre dentro de `asUser`, que activa el rol `authenticated`
 * y la identidad de la usuaria: así se aplican EXACTAMENTE las mismas reglas de
 * seguridad (RLS) que en la base de datos, sin depender del código de la página.
 */
type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const globalForDb = globalThis as unknown as { karySql?: Sql };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function sql(): Sql {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");
  if (!globalForDb.karySql) {
    globalForDb.karySql = postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      prepare: false, // compatible con el pooler de Supabase
      // montos en centavos (int8) como number: seguros hasta 90 billones de pesos
      types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
      transform: { undefined: null },
    });
  }
  return globalForDb.karySql;
}

/** Ejecuta `fn` como la usuaria indicada, con RLS activo, en una transacción. */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql().begin(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true),
                    set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

/** Ejecuta `fn` como visitante anónimo de la tienda online (solo lo que el rol anon puede ver). */
export async function asAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql().begin(async (tx) => {
    await tx`set local role anon`;
    return fn(tx);
  }) as Promise<T>;
}

/** Solo para el modo de desarrollo: lista las cuentas del personal sin sesión. */
export async function listStaffForDevLogin() {
  return sql()<{ id: string; full_name: string; role: string }[]>`
    select id, full_name, role from public.profiles
    where active and role in ('owner', 'admin', 'employee') order by role, full_name`;
}

/** Convierte un error de PostgreSQL en un mensaje entendible para la usuaria. */
export function dbErrorMessage(e: unknown): string {
  const err = e as { message?: string; code?: string };
  if (err?.code === "42501") {
    return err.message?.startsWith("permission denied")
      ? "No tiene permiso para realizar esta operación."
      : err.message ?? "Acceso denegado.";
  }
  if (err?.code === "23505") return "Ya existe un registro con ese código o valor.";
  if (err?.code === "23514") return "Algún dato no cumple las reglas (montos o cantidades inválidos).";
  if (err?.code === "P0001" || err?.code === "22023") return err.message ?? "Operación no válida.";
  if (err?.message && !err.message.includes("\n") && err.message.length < 220) return err.message;
  return "Ocurrió un error inesperado. Intente de nuevo.";
}
