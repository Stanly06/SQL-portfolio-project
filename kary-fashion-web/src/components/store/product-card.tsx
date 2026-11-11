import Link from "next/link";
import { ProductThumb } from "@/components/dashboard/product-thumb";
import { formatMoney } from "@/lib/format";
import type { StoreProduct } from "@/lib/server/store";

export function ProductCard({ p }: { p: StoreProduct }) {
  return (
    <Link href={`/tienda/producto/${p.id}`} className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] transition-transform hover:-translate-y-1">
      <div className="relative aspect-[4/5] overflow-hidden bg-blush-soft">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center"><ProductThumb category={p.category} className="h-24 w-24 rounded-3xl" /></div>
        )}
        {!p.in_stock && <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-muted">Agotado</span>}
        {p.compare_at && p.in_stock && <span className="absolute left-3 top-3 rounded-full bg-pink px-3 py-1 text-xs font-semibold text-white">Oferta</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">{p.category}</p>
        <h3 className="font-[family-name:var(--font-display)] text-[15px] font-semibold leading-snug text-ink">{p.name}</h3>
        <p className="mt-auto pt-1 text-sm">
          <b className="tabular text-pink-strong">{p.min_price === p.max_price ? formatMoney(p.min_price) : `Desde ${formatMoney(p.min_price)}`}</b>
          {p.compare_at && <s className="tabular ml-2 text-xs text-muted">{formatMoney(p.compare_at)}</s>}
        </p>
        {(p.colors.length > 1 || p.sizes.length > 0) && (
          <p className="text-xs text-muted">{[p.colors.length > 1 && `${p.colors.length} colores`, p.sizes.length > 0 && `Tallas ${p.sizes.join(", ")}`].filter(Boolean).join(" · ")}</p>
        )}
      </div>
    </Link>
  );
}
