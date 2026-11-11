"use client";

import { useActionState } from "react";
import { loginWithPassword } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(loginWithPassword, null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-plum">Correo</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-plum">Contraseña</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      {state?.error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-pink py-2.5 text-sm font-semibold text-white hover:bg-pink-strong disabled:opacity-60">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
