"use server";

import { revalidatePath } from "next/cache";
import { UserError, type ActionState } from "@/lib/server/actions";
import { mutate } from "@/lib/server/mutate";
import { processPhoto } from "@/lib/server/photo";
import { saveImage } from "@/lib/server/storage";

const paths = (id?: number) => ["/tienda-online", "/tienda", "/tienda/catalogo", ...(id ? [`/tienda-online/fotos/${id}`, `/tienda/producto/${id}`] : [])];

export async function togglePublish(_: ActionState, form: FormData): Promise<ActionState> {
  const id = Number(form.get("id"));
  return mutate(async (tx) => {
    const [p] = await tx<{ published: boolean; status: string }[]>`select published, status::text from public.products where id = ${id}`;
    if (!p) throw new UserError("El producto no existe.");
    if (!p.published && p.status !== "active") throw new UserError("Solo se publican productos activos.");
    await tx`update public.products set published = ${!p.published}, updated_at = now() where id = ${id}`;
    return p.published ? "Retirado de la tienda." : "Publicado en la tienda.";
  }, { admin: true, revalidate: paths(id) });
}

export async function uploadPhoto(_: ActionState, form: FormData): Promise<ActionState> {
  const id = Number(form.get("product_id"));
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Seleccione o tome una foto." };
  if (file.size > 12 * 1024 * 1024) return { error: "La foto es muy grande (máximo 12 MB)." };
  const opts = { light: form.get("light") === "on", frame: form.get("frame") === "on", removeBg: form.get("remove_bg") === "on" };
  let processed;
  try {
    processed = await processPhoto(Buffer.from(await file.arrayBuffer()), opts);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo procesar la foto." };
  }
  const res = await mutate(async (tx) => {
    const [p] = await tx<{ image_url: string | null }[]>`select image_url from public.products where id = ${id}`;
    if (!p) throw new UserError("El producto no existe.");
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.product_images where product_id = ${id}`;
    const originalUrl = await saveImage(processed.original);
    await tx`insert into public.product_images (product_id, url, sort_order, enhanced, created_by) values (${id}, ${originalUrl}, ${n + 1}, false, auth.uid())`;
    let main = originalUrl;
    if (processed.enhanced) {
      const enhancedUrl = await saveImage(processed.enhanced);
      await tx`insert into public.product_images (product_id, url, sort_order, enhanced, created_by) values (${id}, ${enhancedUrl}, ${n}, true, auth.uid())`;
      main = enhancedUrl;
    }
    if (!p.image_url) await tx`update public.products set image_url = ${main}, updated_at = now() where id = ${id}`;
    return processed.enhanced ? `Foto subida. ${processed.notes.join(" ")} Compare y elija la principal.` : "Foto subida.";
  }, { admin: true, revalidate: paths(id) });
  return res;
}

export async function setMainPhoto(_: ActionState, form: FormData): Promise<ActionState> {
  const id = Number(form.get("product_id"));
  return mutate(async (tx) => {
    const url = String(form.get("url"));
    const ok = await tx`select 1 from public.product_images where product_id = ${id} and url = ${url}`;
    if (!ok.length) throw new UserError("Esa foto no pertenece al producto.");
    await tx`update public.products set image_url = ${url}, updated_at = now() where id = ${id}`;
    return "Foto principal actualizada.";
  }, { admin: true, revalidate: paths(id) });
}

export async function deletePhoto(_: ActionState, form: FormData): Promise<ActionState> {
  const id = Number(form.get("product_id"));
  const res = await mutate(async (tx) => {
    const imageId = Number(form.get("image_id"));
    const [img] = await tx<{ url: string }[]>`delete from public.product_images where id = ${imageId} and product_id = ${id} returning url`;
    if (!img) throw new UserError("La foto no existe.");
    await tx`update public.products set image_url = (select url from public.product_images where product_id = ${id} order by enhanced desc, sort_order limit 1),
               updated_at = now() where id = ${id} and image_url = ${img.url}`;
    return "Foto eliminada.";
  }, { admin: true, revalidate: paths(id) });
  revalidatePath("/productos");
  return res;
}
