import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState, NeedsDatabase, PageHeader, Panel } from "@/components/ui/page";
import { loadAs } from "@/lib/server/page";
import { aiBackgroundAvailable } from "@/lib/server/photo";
import { PhotoActions, PublishToggle, UploadPhotoForm } from "../../forms";

export default async function ProductPhotosPage(props: PageProps<"/tienda-online/fotos/[id]">) {
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const res = await loadAs(async (tx) => {
    const [p] = await tx<{ id: number; name: string; image_url: string | null; published: boolean }[]>`
      select id, name, image_url, published from public.products where id = ${id} and deleted_at is null`;
    if (!p) return null;
    return { p, images: await tx<{ id: number; url: string; enhanced: boolean }[]>`
      select id, url, enhanced from public.product_images where product_id = ${id} order by enhanced desc, sort_order, id` };
  }, { admin: true });
  if (!res) return <NeedsDatabase />;
  if (!res.data) notFound();
  const { p, images } = res.data;
  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader title={`Fotos · ${p.name}`} back={{ href: "/tienda-online", label: "Tienda online" }}
                  actions={<>{p.published ? <Badge tone="success">Publicado</Badge> : <Badge tone="neutral">No publicado</Badge>}<PublishToggle id={p.id} published={p.published} /></>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Panel title="Fotos del producto">
          {images.length === 0 ? <EmptyState title="Todavía no tiene fotos">Suba la primera con el formulario.</EmptyState> : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {images.map((img) => (
                <figure key={img.id} className="space-y-2">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-blush-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 flex gap-1">
                      {img.url === p.image_url && <Badge tone="pink">Principal</Badge>}
                      {img.enhanced ? <Badge tone="lavender">Mejorada</Badge> : <Badge tone="neutral">Original</Badge>}
                    </span>
                  </div>
                  <PhotoActions productId={p.id} imageId={img.id} url={img.url} isMain={img.url === p.image_url} />
                </figure>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Subir foto"><UploadPhotoForm productId={p.id} aiAvailable={aiBackgroundAvailable()} />
          <p className="mt-4 text-xs text-muted">Se guardan las dos versiones (original y mejorada) para que elija la que más le guste como principal.</p>
        </Panel>
      </div>
    </div>
  );
}
