import Link from "next/link";
import { ProductCard } from "@/components/store/product-card";
import { getCatalog, getStoreInfo } from "@/lib/server/store";
import { cn } from "@/lib/utils";
import { StoreUnavailable } from "../unavailable";

export const metadata = { title: "Catálogo" };

export default async function CatalogPage(props: PageProps<"/tienda/catalogo">) {
  if (!(await getStoreInfo())) return <StoreUnavailable />;
  const sp = await props.searchParams;
  const one = (k: string) => String((Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "");
  const cat = one("categoria"), talla = one("talla"), color = one("color"), orden = one("orden") || "nuevos";
  const min = Number(one("min")) || 0, max = Number(one("max")) || 0;
  const all = await getCatalog();
  const categories = [...new Map(all.map((p) => [p.category_slug, p.category])).entries()];
  const sizes = [...new Set(all.flatMap((p) => p.sizes))];
  const colors = [...new Set(all.flatMap((p) => p.colors))].sort();
  let list = all.filter((p) =>
    (!cat || p.category_slug === cat) && (!talla || p.variants.some((v) => v.size === talla && v.in_stock)) &&
    (!color || p.colors.includes(color)) && (!min || p.max_price >= min * 100) && (!max || p.min_price <= max * 100));
  if (orden === "precio-asc") list = [...list].sort((a, b) => a.min_price - b.min_price);
  if (orden === "precio-desc") list = [...list].sort((a, b) => b.min_price - a.min_price);
  list = [...list].sort((a, b) => Number(b.in_stock) - Number(a.in_stock));
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ categoria: cat, talla, color, orden, min: min ? String(min) : "", max: max ? String(max) : "", ...patch });
    [...p.keys()].forEach((k) => !p.get(k) && p.delete(k));
    return `/tienda/catalogo?${p}`;
  };
  const chip = (active: boolean) => cn("rounded-full border px-3.5 py-1.5 text-sm", active ? "border-pink bg-pink text-white" : "border-blush bg-white text-plum hover:border-pink");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold">Catálogo</h1>
      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2"><Link href={qs({ categoria: "" })} className={chip(!cat)}>Todo</Link>
          {categories.map(([s, n]) => <Link key={s} href={qs({ categoria: s })} className={chip(cat === s)}>{n}</Link>)}</div>
        {sizes.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-muted">Talla</span>
          {sizes.map((s) => <Link key={s} href={qs({ talla: talla === s ? "" : s })} className={chip(talla === s)}>{s}</Link>)}</div>}
        {colors.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-muted">Color</span>
          {colors.map((c) => <Link key={c} href={qs({ color: color === c ? "" : c })} className={chip(color === c)}>{c}</Link>)}</div>}
        <form action="/tienda/catalogo" className="flex flex-wrap items-end gap-2">
          {cat && <input type="hidden" name="categoria" value={cat} />}{talla && <input type="hidden" name="talla" value={talla} />}
          {color && <input type="hidden" name="color" value={color} />}
          <label className="text-xs text-muted">Precio desde<input name="min" inputMode="numeric" defaultValue={min || ""} placeholder="RD$" className="input mt-1 w-28 py-1.5" /></label>
          <label className="text-xs text-muted">hasta<input name="max" inputMode="numeric" defaultValue={max || ""} placeholder="RD$" className="input mt-1 w-28 py-1.5" /></label>
          <label className="text-xs text-muted">Ordenar<select name="orden" defaultValue={orden} className="input mt-1 py-1.5">
            <option value="nuevos">Más nuevos</option><option value="precio-asc">Menor precio</option><option value="precio-desc">Mayor precio</option></select></label>
          <button className="rounded-full bg-plum px-5 py-2 text-sm font-semibold text-white">Aplicar</button>
          {(cat || talla || color || min || max) && <Link href="/tienda/catalogo" className="py-2 text-sm text-pink-strong underline">Quitar filtros</Link>}
        </form>
      </div>
      <p className="mt-6 text-sm text-muted">{list.length} producto(s)</p>
      {list.length === 0 ? <p className="mt-10 text-center text-muted">No encontramos productos con esos filtros.</p> : (
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      )}
    </div>
  );
}
