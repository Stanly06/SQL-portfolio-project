"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authMode, createSupabaseServerClient, DEV_COOKIE } from "@/lib/server/auth";
import type { ActionState } from "@/lib/server/actions";

export async function loginWithPassword(_: ActionState, form: FormData): Promise<ActionState> {
  if (authMode() !== "supabase") return { error: "El inicio con contraseña no está activo." };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Escriba su correo y contraseña." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Correo o contraseña incorrectos." };
  redirect("/");
}

export async function devLogin(form: FormData) {
  if (authMode() !== "dev") return;
  const id = String(form.get("user_id") ?? "");
  (await cookies()).set(DEV_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  redirect("/");
}

export async function logout() {
  const mode = authMode();
  if (mode === "dev") (await cookies()).delete(DEV_COOKIE);
  if (mode === "supabase") await (await createSupabaseServerClient()).auth.signOut();
  redirect("/login");
}
