import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/store/product-card";
import { getCatalog, getStoreInfo, waLink } from "@/lib/server/store";
import { StoreUnavailable } from "./unavailable";

export default async function StoreHome() {
  const info = await getStoreInfo();
  if (!info) return <StoreUnavailable />;
  const products = await getCatalog();
  const categories = [...new Map(products.map((p) => [p.category_slug, p.category])).entries()];
  const latest = products.filter((p) => p.in_stock).slice(0, 8);

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-cream via-blush-soft to-blush">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Nueva temporada</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">Moda que te hace brillar</h1>
            <p className="mt-4 max-w-md text-plum/75">Ropa, calzados, perfumes y accesorios para ti. Pide desde tu celular y te lo enviamos a todo el país.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/tienda/catalogo" className="inline-flex items-center gap-2 rounded-full bg-pink px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-pink/30 hover:bg-pink-strong">
                Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
              {info.whatsapp && <a href={waLink(info.whatsapp, "Hola Kary Fashion, quiero información")} target="_blank" rel="noreferrer"
                                   className="inline-flex items-center gap-2 rounded-full border border-plum/20 bg-white/70 px-6 py-3 text-sm font-semibold text-plum hover:bg-white">
                <MessageCircle className="h-4 w-4" /> Escríbenos</a>}
            </div>
            {!info.open && <p className="mt-4 rounded-xl bg-warning-soft px-4 py-2 text-sm text-[#8a5410]">Por ahora no estamos recibiendo pedidos en línea. Escríbenos por WhatsApp.</p>}
          </div>
          <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[2rem] shadow-[var(--shadow-pop)]">
            <Image src="/brand/hero-moda.jpg" alt="Modelo con vestido satinado y bolsas de compras de Kary Fashion" fill priority sizes="(max-width: 768px) 90vw, 384px" className="object-cover object-top" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:grid-cols-3">
        {[[Truck, "Envíos a todo el país", info.delivery_fee_cents ? `Desde RD$${(info.delivery_fee_cents / 100).toLocaleString("es-DO")}` : "Consulta el costo"],
          [ShieldCheck, "Pago por transferencia", "Confirmamos tu pedido por WhatsApp"],
          [MessageCircle, "Atención personal", "Te ayudamos a elegir talla y color"]].map(([Icon, t, d]) => {
          const I = Icon as typeof Truck;
          return (
            <div key={t as string} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blush text-pink-strong"><I className="h-5 w-5" /></span>
              <span><b className="block text-sm text-ink">{t as string}</b><span className="text-xs text-muted">{d as string}</span></span>
            </div>);
        })}
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Categorías</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map(([slug, name]) => (
              <Link key={slug} href={`/tienda/catalogo?categoria=${slug}`} className="rounded-full border border-blush bg-white px-5 py-2 text-sm font-medium text-plum hover:border-pink hover:text-pink-strong">{name}</Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold">Novedades</h2>
          <Link href="/tienda/catalogo" className="text-sm font-semibold text-pink-strong hover:underline">Ver todo →</Link>
        </div>
        {latest.length === 0 ? <p className="mt-6 text-muted">Muy pronto publicaremos nuestros productos.</p> : (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">{latest.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        )}
      </section>
    </>
  );
}
