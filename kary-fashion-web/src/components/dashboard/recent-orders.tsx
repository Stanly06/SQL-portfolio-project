import Link from "next/link";
import { ShoppingBag, User } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDateShort, formatMoney } from "@/lib/format";
import type { RecentOrder } from "@/lib/types";
import { OrderStatusBadge } from "./order-status";

const CHANNEL: Record<RecentOrder["channel"], string> = {
  online: "Web",
  tienda: "Tienda",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  return (
    <Card className="h-full">
      <CardHeader
        icon={<ShoppingBag className="h-5 w-5" />}
        title="Pedidos recientes"
        action={<Link href="/pedidos" className="text-xs font-medium text-pink-strong hover:underline">Ver todos →</Link>}
      />
      {/* Tabla en pantallas medianas y grandes */}
      <div className="hidden overflow-x-auto px-5 pb-4 pt-3 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-plum">
              <th className="py-2 pr-3"># Pedido</th>
              <th className="py-2 pr-3">Cliente</th>
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3 text-right">Total</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.code} className="border-b border-line/60 last:border-0 hover:bg-cream">
                <td className="whitespace-nowrap py-2.5 pr-3 font-medium text-ink">
                  {o.code}
                  <span className="block text-[11px] font-normal text-muted">{CHANNEL[o.channel]}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2 whitespace-nowrap text-ink">
                    <User className="h-4 w-4 text-pink" /> {o.customer}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{formatDateShort(o.date)}</td>
                <td className="tabular whitespace-nowrap py-2.5 pr-3 text-right font-medium text-ink">{formatMoney(o.total)}</td>
                <td className="whitespace-nowrap py-2.5"><OrderStatusBadge status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Lista compacta en celulares */}
      <ul className="divide-y divide-line px-5 pb-3 pt-2 md:hidden">
        {orders.map((o) => (
          <li key={o.code} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{o.customer}</p>
              <p className="text-xs text-muted">{o.code} · {formatDateShort(o.date)}</p>
            </div>
            <div className="text-right">
              <p className="tabular text-sm font-semibold text-ink">{formatMoney(o.total)}</p>
              <OrderStatusBadge status={o.status} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
