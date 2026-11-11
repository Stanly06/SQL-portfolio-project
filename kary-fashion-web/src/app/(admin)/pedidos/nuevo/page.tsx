import { NeedsDatabase, PageHeader } from "@/components/ui/page";
import { loadAs } from "@/lib/server/page";
import { OrderForm, type OrderVariant } from "../order-form";

export const metadata = { title: "Nuevo pedido" };

export default async function NewOrderPage(props: PageProps<"/pedidos/nuevo">) {
  const initialCustomer = Number((await props.searchParams).cliente) || undefined;
  const res = await loadAs(async (tx) => ({
    customers: await tx<{ id: number; full_name: string; phone: string | null }[]>`select id, full_name, phone from public.customers order by full_name`,
    variants: await tx<OrderVariant[]>`
      select pv.id, p.name || coalesce(' · ' || pv.color, '') || coalesce(' · T/' || pv.size, '') as label, pv.price_cents, pv.stock
      from public.product_variants pv join public.products p on p.id = pv.product_id
      where pv.active and pv.deleted_at is null and p.deleted_at is null and p.status = 'active' order by p.name, pv.color, pv.size`,
    minPct: await tx<{ v: number }[]>`select coalesce((value ->> 'min_deposit_pct')::int, 50) as v from public.settings where key = 'orders'`,
  }));
  if (!res) return <NeedsDatabase />;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nuevo pedido" back={{ href: "/pedidos", label: "Pedidos" }}
                  description="El pedido se factura al entregarlo: ahí se cobra el balance y se descuenta el inventario." />
      <OrderForm customers={res.data.customers} variants={res.data.variants} minDepositPct={res.data.minPct[0]?.v ?? 50} initialCustomer={initialCustomer} />
    </div>
  );
}
