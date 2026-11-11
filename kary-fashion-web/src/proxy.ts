import { NextResponse, type NextRequest } from "next/server";

/**
 * Renueva la sesión de Supabase en cada petición (solo en modo «supabase»).
 * La autorización real se hace en el servidor y en la base de datos, no aquí.
 */
export async function proxy(request: NextRequest) {
  if (process.env.AUTH_MODE === "dev" || !process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.next();
  }
  const { createServerClient } = await import("@supabase/ssr");
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|favicon.ico).*)"],
};
