import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import type { StockAlert } from "@/lib/types";
import { ProductThumb } from "./product-thumb";

export function StockAlerts({ alerts }: { alerts: StockAlert[] }) {
  return (
    <Card className="h-full">
      <CardHeader
        icon={<TriangleAlert className="h-5 w-5 text-danger" />}
        title="Alertas de inventario"
        action={<Link href="/inventario" className="text-xs font-medium text-pink-strong hover:underline">Ver inventario →</Link>}
      />
      <ul className="divide-y divide-line/70 px-5 pb-3 pt-2">
        {alerts.map((a) => (
          <li key={a.sku} className="flex items-center gap-3 py-2.5">
            <ProductThumb category={a.category} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{a.name}</p>
              <p className="truncate text-xs text-muted">
                Talla {a.size} · {a.color} · mín. {a.minStock}
              </p>
            </div>
            <Badge tone={a.stock === 0 ? "danger" : "warning"} className="tabular">
              {a.stock === 0 ? "Agotado" : `Stock: ${a.stock}`}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
