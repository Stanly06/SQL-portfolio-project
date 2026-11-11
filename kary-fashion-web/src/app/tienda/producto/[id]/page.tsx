import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreInfo, getStoreProduct } from "@/lib/server/store";
import { StoreUnavailable } from "../../unavailable";
import { ProductBuyBox } from "./buy-box";

export async function generateMetadata(props: PageProps<"/tienda/producto/[id]">) {
  const p = await getStoreProduct(Number((await props.params).id));
  return { title: p?.name ?? "Producto" };
}

export default async function StoreProductPage(props: PageProps<"/tienda/producto/[id]">) {
  const info = await getStoreInfo();
  if (!info) return <StoreUnavailable />;
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const p = await getStoreProduct(id);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-4 text-sm text-muted"><Link href="/tienda" className="hover:text-pink-strong">Inicio</Link> ›{" "}
        <Link href={`/tienda/catalogo?categoria=${p.category_slug}`} className="hover:text-pink-strong">{p.category}</Link> › {p.name}</nav>
      <ProductBuyBox p={p} whatsapp={info.whatsapp} open={info.open} />
    </div>
  );
}
