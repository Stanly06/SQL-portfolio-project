import Link from "next/link";
import { Plus } from "lucide-react";
import { OrderStatusBadge } from "@/components/dashboard/order-status";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { formatMoney } from "@/lib/format";
import { CHANNEL, formatDay } from "@/lib/labels";
import { ORDER_STATUS_DB } from "@/lib/server/dashboard";
import { loadAs } from "@/lib/server/page";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pedidos" };

const TABS = [
  { key: "activos", label: "Activos", where: ["new", "pending_payment", "confirmed", "preparing", "shipped"] },
  { key: "pago", label: "Pendiente de pago", where: ["pending_payment", "new"] },
  { key: "preparar", label: "Por preparar", where: ["confirmed", "preparing"] },
  { key: "enviados", label: "Enviados", where: ["shipped"] },
  { key: "entregados", label: "Entregados", where: ["delivered"] },
  { key: "cancelados", label: "Cancelados/devueltos", where: ["cancelled", "returned"] },
];

export default async function OrdersPage(props: PageProps<"/pedidos">) {
  const tabKey = String((await props.searchParams).estado ?? "activos");
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const res = await loadAs(async (tx) => ({
    rows: await tx<{ id: number; number: string; customer: string; channel: string; status: string; total_cents: number;
      paid_cents: number; balance_cents: number; expected_date: Date | null; created_at: Date; is_special_order: boolean }[]>`
      select b.id, b.number, b.customer, b.channel::text, b.status::text, b.total_cents, b.paid_cents, b.balance_cents,
             b.expected_date, b.created_at, o.is_special_order
      from public.order_balances b join public.orders o on o.id = b.id
      where b.status::text = any(${tab.where}) order by coalesce(b.expected_date, b.created_at::date), b.created_at desc limit 300`,
    counts: await tx<{ status: string; n: number; balance: number }[]>`
      select status::text, count(*)::int as n, coalesce(sum(balance_cents), 0)::int8 as balance from public.order_balances group by status`,
  }));
  if (!res) return <NeedsDatabase />;
  const count = (keys: string[]) => res.data.counts.filter((c) => keys.includes(c.status)).reduce((a, c) => a + c.n, 0);
  const receivable = res.data.counts.filter((c) => TABS[0].where.includes(c.status)).reduce((a, c) => a + c.balance, 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader title="Pedidos" description="Pedidos por WhatsApp, redes, web y encargos con anticipo."
                  actions={<ButtonLink href="/pedidos/nuevo"><Plus className="h-4 w-4" /> Nuevo pedido</ButtonLink>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pedidos activos" value={count(TABS[0].where)} />
        <Stat label="Por preparar" value={count(TABS[2].where)} />
        <Stat label="Por cobrar" value={formatMoney(receivable)} tone="pink" />
      </div>
      <nav className="flex flex-wrap gap-1 rounded-2xl bg-white p-1 shadow-sm" aria-label="Estados">
        {TABS.map((t) => (
          <Link key={t.key} href={`/pedidos?estado=${t.key}`}
                className={cn("rounded-xl px-3 py-1.5 text-sm", t.key === tab.key ? "bg-blush font-semibold text-pink-strong" : "text-muted hover:text-plum")}>
            {t.label} <span className="tabular text-xs opacity-70">{count(t.where)}</span>
          </Link>
        ))}
      </nav>
      <Panel>
        {res.data.rows.length === 0 ? <EmptyState title="No hay pedidos en este estado" /> : (
          <TableWrap><table className="table-base">
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Canal</th><th>Estado</th><th>Entrega</th><th className="text-right">Total</th><th className="text-right">Pagado</th><th className="text-right">Pendiente</th></tr></thead>
            <tbody>{res.data.rows.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/pedidos/${o.id}`} className="font-medium hover:text-pink-strong">{o.number}</Link>
                  {o.is_special_order && <Badge tone="gold" className="ml-2">Encargo</Badge>}
                  <span className="block text-xs text-muted">{formatDay(o.created_at)}</span></td>
                <td>{o.customer}</td>
                <td className="text-muted">{CHANNEL[o.channel]}</td>
                <td><OrderStatusBadge status={ORDER_STATUS_DB[o.status]} /></td>
                <td className="text-muted">{o.expected_date ? formatDay(o.expected_date) : "—"}</td>
                <td className="tabular text-right">{formatMoney(o.total_cents)}</td>
                <td className="tabular text-right text-success">{formatMoney(o.paid_cents)}</td>
                <td className="tabular text-right font-semibold">{o.balance_cents > 0 ? formatMoney(o.balance_cents) : "—"}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        )}
      </Panel>
    </div>
  );
}
