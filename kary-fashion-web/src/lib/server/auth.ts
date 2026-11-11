import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { asUser, isDatabaseConfigured } from "./db";

export type Role = "owner" | "admin" | "employee";

export interface CurrentUser {
  id: string;
  fullName: string;
  role: Role;
  isAdmin: boolean;
  isOwner: boolean;
}

export const DEV_COOKIE = "kary_dev_uid";

export type AuthMode = "demo" | "dev" | "supabase";

/** demo: sin base de datos · dev: selector de usuarias locales · supabase: correo y contraseña */
export function authMode(): AuthMode {
  if (!isDatabaseConfigured()) return "demo";
  if (process.env.AUTH_MODE === "dev") {
    if (process.env.VERCEL) throw new Error("AUTH_MODE=dev no está permitido en un despliegue público.");
    return "dev";
  }
  return "supabase";
}

export async function createSupabaseServerClient() {
  const { createServerClient } = await import("@supabase/ssr");
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* en componentes de servidor no se pueden escribir cookies; el proxy las renueva */
        }
      },
    },
  });
}

async function sessionUserId(): Promise<string | null> {
  const mode = authMode();
  if (mode === "dev") {
    return (await cookies()).get(DEV_COOKIE)?.value ?? null;
  }
  if (mode === "supabase") {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser(); // valida el token con Supabase (no solo lo lee)
    return data.user?.id ?? null;
  }
  return null;
}

/** Usuaria del personal con sesión activa, o null. Se resuelve una sola vez por petición. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const id = await sessionUserId();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await asUser(id, (tx) => tx<{ full_name: string; role: Role }[]>`
    select full_name, role from public.profiles where id = auth.uid() and active`);
  const p = rows[0];
  if (!p || !["owner", "admin", "employee"].includes(p.role)) return null;
  return {
    id,
    fullName: p.full_name,
    role: p.role,
    isAdmin: p.role === "owner" || p.role === "admin",
    isOwner: p.role === "owner",
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/?aviso=solo-administracion");
  return user;
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Dueña", admin: "Administradora", employee: "Empleada" };
