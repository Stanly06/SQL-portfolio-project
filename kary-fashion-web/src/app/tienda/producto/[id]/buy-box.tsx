"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, MessageCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import { ProductThumb } from "@/components/dashboard/product-thumb";
import { useCart } from "@/components/store/cart";
import { formatMoney } from "@/lib/format";
import type { StoreProduct } from "@/lib/server/store";
import { cn } from "@/lib/utils";

export function ProductBuyBox({ p, whatsapp, open }: { p: StoreProduct; whatsapp: string | null; open: boolean }) {
  const cart = useCart();
  const firstAvailable = p.variants.find((v) => v.in_stock) ?? p.variants[0];
  const [color, setColor] = useState<string | null>(firstAvailable.color);
  const [size, setSize] = useState<string | null>(firstAvailable.size);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [photo, setPhoto] = useState(0);

  const variant = useMemo(() => p.variants.find((v) => v.color === color && v.size === size) ?? null, [p.variants, color, size]);
  const sizeAvailable = (s: string) => p.variants.some((v) => v.size === s && v.color === color && v.in_stock);
  const images = variant?.image_url ? [variant.image_url, ...p.images.filter((i) => i !== variant.image_url)] : p.images;
  const label = [variant?.color, variant?.size && `Talla ${variant.size}`].filter(Boolean).join(" · ");
  const d = (whatsapp ?? "").replace(/\D/g, "");
  const wa = `https://wa.me/${d.length === 10 ? "1" + d : d}?text=${encodeURIComponent(`Hola, me interesa: ${p.name}${label ? ` (${label})` : ""}`)}`;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-3">
        <div className="aspect-[4/5] overflow-hidden rounded-3xl bg-blush-soft shadow-[var(--shadow-card)]">
          {images[photo] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[photo]} alt={p.name} className="h-full w-full object-cover" />
          ) : <div className="grid h-full place-items-center"><ProductThumb category={p.category} className="h-32 w-32 rounded-3xl" /></div>}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2">{images.map((src, i) => (
            <button key={src} onClick={() => setPhoto(i)} aria-label={`Foto ${i + 1}`}
                    className={cn("h-20 w-16 overflow-hidden rounded-xl border-2", i === photo ? "border-pink" : "border-transparent")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>))}</div>
        )}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted">{p.category}{p.brand && ` · ${p.brand}`}</p>
        <h1 className="mt-1 text-3xl font-bold">{p.name}</h1>
        <p className="mt-3 text-2xl">
          <b className="tabular text-pink-strong">{formatMoney(variant?.price_cents ?? p.min_price)}</b>
          {variant?.compare_at_cents && <s className="tabular ml-3 text-base text-muted">{formatMoney(variant.compare_at_cents)}</s>}
        </p>
        {p.description && <p className="mt-4 text-plum/80">{p.description}</p>}

        {p.colors.length > 0 && (
          <div className="mt-6"><p className="label">Color: <span className="font-normal text-muted">{color}</span></p>
            <div className="flex flex-wrap gap-2">{p.colors.map((c) => (
              <button key={c} onClick={() => { setColor(c); const s = p.variants.find((v) => v.color === c && v.in_stock)?.size ?? p.variants.find((v) => v.color === c)?.size ?? null; setSize(s); }}
                      className={cn("rounded-full border px-4 py-2 text-sm", c === color ? "border-pink bg-pink text-white" : "border-blush bg-white text-plum hover:border-pink")}>{c}</button>))}</div>
          </div>
        )}
        {p.sizes.length > 0 && (
          <div className="mt-5"><p className="label">Talla</p>
            <div className="flex flex-wrap gap-2">{p.sizes.filter((s) => p.variants.some((v) => v.size === s && v.color === color)).map((s) => (
              <button key={s} onClick={() => setSize(s)} disabled={!sizeAvailable(s)}
                      className={cn("min-w-12 rounded-xl border px-3 py-2 text-sm font-medium",
                        s === size ? "border-pink bg-blush text-pink-strong" : "border-blush bg-white text-plum hover:border-pink",
                        !sizeAvailable(s) && "cursor-not-allowed opacity-40 line-through")}>{s}</button>))}</div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-full border border-blush bg-white">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-3 text-plum" aria-label="Menos"><Minus className="h-4 w-4" /></button>
            <span className="tabular w-8 text-center font-semibold">{qty}</span>
            <button onClick={() => setQty(Math.min(10, qty + 1))} className="p-3 text-plum" aria-label="Más"><Plus className="h-4 w-4" /></button>
          </div>
          <button disabled={!variant?.in_stock || !open}
                  onClick={() => { if (!variant) return; cart.add({ variantId: variant.variant_id, productId: p.id, name: p.name, variantLabel: label,
                    price: variant.price_cents, image: images[0] ?? null }, qty); setAdded(true); }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-pink px-6 py-3.5 font-semibold text-white shadow-lg shadow-pink/30 hover:bg-pink-strong disabled:opacity-50">
            <ShoppingBag className="h-5 w-5" /> {!variant?.in_stock ? "Agotado" : !open ? "Pedidos en línea pausados" : "Agregar al carrito"}
          </button>
        </div>
        {added && (
          <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-2.5 text-sm text-success">
            <Check className="h-4 w-4" /> Agregado. <Link href="/tienda/carrito" className="font-semibold underline">Ver carrito ({cart.count})</Link>
          </p>
        )}
        {whatsapp && <a href={wa} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-success hover:underline">
          <MessageCircle className="h-4 w-4" /> Preguntar por WhatsApp</a>}
      </div>
    </div>
  );
}
