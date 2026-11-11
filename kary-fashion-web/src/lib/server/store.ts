import "server-only";
import { cache } from "react";
import { isDatabaseConfigured, asAnon } from "./db";

export interface StoreInfo {
  name: string; phone: string | null; address: string | null; instagram: string | null; tiktok: string | null;
  open: boolean; whatsapp: string | null; announcement: string | null; delivery_fee_cents: number; pickup_address: string | null;
  bank_name: string | null; account_type: string | null; account_number: string | null; account_holder: string | null;
}

export interface StoreVariant { variant_id: number; sku: string; size: string | null; color: string | null; price_cents: number;
  compare_at_cents: number | null; in_stock: boolean; image_url: string | null }
export interface StoreProduct { id: number; name: string; description: string | null; brand: string | null; category: string;
  category_slug: string; image_url: string | null; images: string[]; variants: StoreVariant[]; min_price: number; max_price: number;
  compare_at: number | null; in_stock: boolean; colors: string[]; sizes: string[] }

type Row = StoreVariant & { product_id: number; name: string; description: string | null; brand: string | null; category: string;
  category_slug: string; product_image: string | null };

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];
const sizeRank = (s: string) => (SIZE_ORDER.includes(s) ? SIZE_ORDER.indexOf(s) : 100 + (Number(s) || 0));

function group(rows: Row[], images: Map<number, string[]>): StoreProduct[] {
  const map = new Map<number, StoreProduct>();
  for (const r of rows) {
    let p = map.get(r.product_id);
    if (!p) {
      p = { id: r.product_id, name: r.name, description: r.description, brand: r.brand, category: r.category, category_slug: r.category_slug,
        image_url: null, images: [], variants: [], min_price: r.price_cents, max_price: r.price_cents, compare_at: null, in_stock: false, colors: [], sizes: [] };
      map.set(r.product_id, p);
    }
    p.variants.push({ variant_id: r.variant_id, sku: r.sku, size: r.size, color: r.color, price_cents: r.price_cents,
      compare_at_cents: r.compare_at_cents, in_stock: r.in_stock, image_url: r.image_url });
    p.min_price = Math.min(p.min_price, r.price_cents);
    p.max_price = Math.max(p.max_price, r.price_cents);
    if (r.compare_at_cents) p.compare_at = Math.max(p.compare_at ?? 0, r.compare_at_cents);
    p.in_stock ||= r.in_stock;
    if (r.color && !p.colors.includes(r.color)) p.colors.push(r.color);
    if (r.size && !p.sizes.includes(r.size)) p.sizes.push(r.size);
    p.image_url ||= r.image_url;
  }
  for (const p of map.values()) {
    p.sizes.sort((a, b) => sizeRank(a) - sizeRank(b));
    p.images = [...new Set([p.image_url, ...(images.get(p.id) ?? [])].filter(Boolean) as string[])];
    p.image_url = p.images[0] ?? null;
  }
  return [...map.values()];
}

export const getStoreInfo = cache(async (): Promise<StoreInfo | null> => {
  if (!isDatabaseConfigured()) return null;
  return asAnon(async (tx) => (await tx<{ info: StoreInfo }[]>`select public.store_info() as info`)[0].info);
});

export const getCatalog = cache(async (): Promise<StoreProduct[]> => {
  if (!isDatabaseConfigured()) return [];
  return asAnon(async (tx) => {
    const rows = await tx<Row[]>`select product_id, name, description, brand, category, category_slug, image_url, image_url as product_image,
        variant_id, sku::text, size, color, price_cents, compare_at_cents, in_stock from public.store_catalog order by product_id desc, color, size`;
    const imgs = await tx<{ product_id: number; url: string }[]>`select product_id, url from public.product_images order by product_id, sort_order, id`;
    const images = new Map<number, string[]>();
    for (const i of imgs) images.set(i.product_id, [...(images.get(i.product_id) ?? []), i.url]);
    return group(rows, images);
  });
});

export async function getStoreProduct(id: number) {
  return (await getCatalog()).find((p) => p.id === id) ?? null;
}

export function waLink(phone: string | null | undefined, text: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "1" + d : d}?text=${encodeURIComponent(text)}`;
}
