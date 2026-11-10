import Link from "next/link";
import { Crown } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { TopProduct } from "@/lib/types";
import { ProductThumb } from "./product-thumb";

export function TopProducts({ products }: { products: TopProduct[] }) {
  const max = Math.max(...products.map((p) => p.units), 1);
  return (
    <Card className="h-full">
      <CardHeader
        icon={<Crown className="h-5 w-5 text-gold" />}
        title="Productos más vendidos"
        action={<Link href="/reportes" className="text-xs font-medium text-pink-strong hover:underline">Ver reporte →</Link>}
      />
      <ol className="space-y-3 px-5 pb-5 pt-3">
        {products.map((p, i) => (
          <li key={p.sku} className="flex items-center gap-3">
            <span className="w-4 text-center font-[family-name:var(--font-display)] text-sm font-bold text-plum/60">{i + 1}</span>
            <ProductThumb category={p.category} className="h-11 w-11" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                <p className="tabular shrink-0 text-sm font-semibold text-ink">{formatMoney(p.revenue)}</p>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-pink to-lavender"
                    style={{ width: `${(p.units / max) * 100}%` }}
                  />
                </div>
                <span className="tabular w-16 shrink-0 text-right text-xs text-muted">{p.units} unid.</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
