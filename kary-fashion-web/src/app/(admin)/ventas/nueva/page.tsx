import { NeedsDatabase, PageHeader } from "@/components/ui/page";
import { loadAs } from "@/lib/server/page";
import { Pos, type PosCustomer, type PosVariant } from "../pos";

export const metadata = { title: "Nueva venta" };

export default async function NewSalePage(props: PageProps<"/ventas/nueva">) {
  const initialCustomer = Number((await props.searchParams).cliente) || undefined;
  const res = await loadAs(async (tx) => ({
    variants: await tx<PosVariant[]>`
      select pv.id, pv.sku::text, p.name, pv.size, pv.color, pv.price_cents, pv.stock, c.name::text as category
      from public.product_variants pv join public.products p on p.id = pv.product_id join public.categories c on c.id = p.category_id
      where pv.active and pv.deleted_at is null and p.deleted_at is null and p.status = 'active' and pv.stock > 0
      order by p.name, pv.color, pv.size`,
    customers: await tx<PosCustomer[]>`select id, full_name, phone from public.customers order by full_name`,
    fiscal: await tx<{ kind: string; description: string }[]>`
      select kind, description from public.active_invoice_kinds order by kind`,
    maxDiscount: await tx<{ v: number }[]>`select coalesce((value ->> 'employee_max_pct')::int, 10) as v from public.settings where key = 'discounts'`,
  }));
  if (!res) return <NeedsDatabase />;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Nueva venta" back={{ href: "/ventas", label: "Ventas" }}
                  description="El precio y el costo se toman de la base de datos; la existencia se descuenta al cobrar." />
      <Pos variants={res.data.variants} customers={res.data.customers} fiscalKinds={res.data.fiscal}
           maxDiscountPct={res.data.maxDiscount[0]?.v ?? 10} isAdmin={res.user.isAdmin} initialCustomer={initialCustomer} />
    </div>
  );
}
