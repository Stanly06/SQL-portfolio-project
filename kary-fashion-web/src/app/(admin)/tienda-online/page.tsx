import Link from "next/link";
import { Camera, ExternalLink } from "lucide-react";
import { ProductThumb } from "@/components/dashboard/product-thumb";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { loadAs } from "@/lib/server/page";
import { PublishToggle } from "./forms";

export const metadata = { title: "Tienda online" };

export default async function StoreAdminPage() {
  const res = await loadAs(async (tx) => ({
    products: await tx<{ id: number; name: string; category: string; image_url: string | null; published: boolean; status: string;
      photos: number; stock: number; min_price: number }[]>`
      select p.id, p.name, c.name::text as category, p.image_url, p.published, p.status::text,
             (select count(*) from public.product_images i where i.product_id = p.id)::int as photos,
             coalesce((select sum(greatest(stock, 0)) from public.product_variants v where v.product_id = p.id and v.active and v.deleted_at is null), 0)::int as stock,
             coalesce((select min(price_cents) from public.product_variants v where v.product_id = p.id and v.active and v.deleted_at is null), 0)::int8 as min_price
      from public.products p join public.categories c on c.id = p.category_id
      where p.deleted_at is null order by p.published desc, p.name`,
    web: (await tx<{ n: number; pending: number }[]>`select count(*)::int as n,
      count(*) filter (where status in ('new', 'pending_payment'))::int as pending from public.orders where channel = 'online'`)[0],
    open: (await tx<{ open: boolean }[]>`select coalesce((value ->> 'open')::boolean, true) as open from public.settings where key = 'store'`)[0]?.open ?? true,
  }), { admin: true });
  if (!res) return <NeedsDatabase />;
  const { products, web, open } = res.data;
  const published = products.filter((p) => p.published).length;
  const noPhoto = products.filter((p) => p.published && !p.image_url).length;

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader title="Tienda online" description="Elija qué productos se ven en la tienda y prepare sus fotos."
                  actions={<>
                    <ButtonLink href="/configuracion#tienda" variant="outline">Datos de pago y envío</ButtonLink>
                    <a href="/tienda" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-pink px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-strong">
                      <ExternalLink className="h-4 w-4" /> Ver la tienda</a>
                  </>} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estado" value={open ? "Recibiendo pedidos" : "Pausada"} tone={open ? "success" : "danger"} />
        <Stat label="Productos publicados" value={`${published} de ${products.length}`} />
        <Stat label="Publicados sin foto" value={noPhoto} tone={noPhoto ? "pink" : "default"} />
        <Stat label="Pedidos web por confirmar" value={web.pending} />
      </div>
      {web.pending > 0 && <p className="rounded-xl bg-warning-soft px-4 py-2.5 text-sm text-[#8a5410]">
        Hay {web.pending} pedido(s) web esperando pago. <Link href="/pedidos?estado=pago" className="font-semibold underline">Revisarlos →</Link></p>}
      <Panel>
        {products.length === 0 ? <EmptyState title="No hay productos" /> : (
          <TableWrap><table className="table-base">
            <thead><tr><th>Producto</th><th className="text-right">Precio</th><th className="text-right">Existencia</th><th>Fotos</th><th>En la tienda</th><th /></tr></thead>
            <tbody>{products.map((p) => (
              <tr key={p.id}>
                <td><span className="flex items-center gap-3">
                  {p.image_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.image_url} alt="" className="h-12 w-10 rounded-lg object-cover" />
                    : <ProductThumb category={p.category} className="h-12 w-10" />}
                  <span><span className="block font-medium">{p.name}</span><span className="text-xs text-muted">{p.category}</span></span></span></td>
                <td className="tabular text-right">{formatMoney(p.min_price)}</td>
                <td className="tabular text-right">{p.stock === 0 ? <Badge tone="danger">Agotado</Badge> : p.stock}</td>
                <td><Link href={`/tienda-online/fotos/${p.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-pink-strong hover:underline">
                  <Camera className="h-4 w-4" /> {p.photos ? `${p.photos} foto(s)` : "Agregar fotos"}</Link></td>
                <td>{p.published ? <Badge tone="success">Publicado</Badge> : <Badge tone="neutral">{p.status === "active" ? "No publicado" : "Inactivo"}</Badge>}</td>
                <td className="text-right"><PublishToggle id={p.id} published={p.published} /></td>
              </tr>))}</tbody>
          </table></TableWrap>
        )}
      </Panel>
    </div>
  );
}
