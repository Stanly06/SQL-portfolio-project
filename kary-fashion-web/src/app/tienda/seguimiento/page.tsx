import { redirect } from "next/navigation";

export const metadata = { title: "Mi pedido" };

async function find(form: FormData) {
  "use server";
  const n = String(form.get("numero") ?? "").trim().toUpperCase().replace(/\s/g, "");
  const tel = String(form.get("telefono") ?? "").replace(/\D/g, "");
  if (!/^KF-\d{1,8}$/.test(n) || tel.length < 10) redirect("/tienda/seguimiento?error=1");
  redirect(`/tienda/pedido/${n}?tel=${tel}`);
}

export default async function TrackPage(props: PageProps<"/tienda/seguimiento">) {
  const sp = await props.searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold">Mi pedido</h1>
      <p className="mt-2 text-muted">Escribe el número de tu pedido y el teléfono con que lo hiciste.</p>
      <form action={find} className="mt-6 space-y-3 rounded-3xl bg-white p-6 shadow-[var(--shadow-card)]">
        <label className="block"><span className="label">Número de pedido</span><input name="numero" required placeholder="KF-1010" className="input uppercase" /></label>
        <label className="block"><span className="label">Teléfono</span><input name="telefono" required type="tel" placeholder="809-000-0000" className="input" /></label>
        {sp.error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Revisa el número (ej. KF-1010) y el teléfono.</p>}
        <button className="w-full rounded-full bg-pink py-3 font-semibold text-white hover:bg-pink-strong">Buscar</button>
      </form>
    </div>
  );
}
