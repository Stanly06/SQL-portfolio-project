import Image from "next/image";
import { redirect } from "next/navigation";
import { authMode, getCurrentUser, ROLE_LABEL, type Role } from "@/lib/server/auth";
import { listStaffForDevLogin } from "@/lib/server/db";
import { devLogin } from "./actions";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage() {
  const mode = authMode();
  if (mode === "demo") redirect("/");
  if (await getCurrentUser()) redirect("/");
  const devUsers = mode === "dev" ? await listStaffForDevLogin() : [];

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-cream via-blush-soft to-lavender-soft p-4">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-blush bg-white/90 p-8 shadow-[var(--shadow-pop)] backdrop-blur animate-fade-up">
        <div className="text-center">
          <Image src="/brand/kary-logo.png" alt="Kary Fashion" width={110} height={110} priority className="mx-auto h-[110px] w-[110px]" />
          <h1 className="mt-3 font-[family-name:var(--font-script)] text-4xl font-normal text-plum">Kary Fashion</h1>
          <p className="mt-1 text-sm text-muted">Panel de administración</p>
        </div>

        {mode === "supabase" && <PasswordForm />}

        {mode === "dev" && (
          <div className="mt-6">
            <p className="mb-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-[#8a5410]">
              Modo desarrollo: elija una cuenta de prueba. En producción se entra con correo y contraseña.
            </p>
            <div className="space-y-2">
              {devUsers.map((u) => (
                <form key={u.id} action={devLogin}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <button className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left text-sm transition-colors hover:border-pink/40 hover:bg-blush-soft">
                    <span className="font-medium text-ink">{u.full_name}</span>
                    <span className="text-xs text-muted">{ROLE_LABEL[u.role as Role]}</span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
