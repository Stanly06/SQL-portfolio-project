import { NeedsDatabase, PageHeader } from "@/components/ui/page";
import { loadAs } from "@/lib/server/page";
import { todayRD } from "@/lib/server/dashboard";
import { PurchaseForm, type VariantOption } from "../purchase-form";

export const metadata = { title: "Nueva compra" };

export default async function NewPurchasePage(props: PageProps<"/compras/nueva">) {
  const pre = Number((await props.searchParams).variante) || undefined;
  const res = await loadAs(async (tx) => ({
    suppliers: await tx<{ id: number; name: string }[]>`select id, name from public.suppliers where active order by name`,
    variants: await tx<VariantOption[]>`
      select pv.id, p.name || coalesce(' · ' || pv.color, '') || coalesce(' · T/' || pv.size, '') || '  [' || pv.sku || ']' as label,
             vc.last_cost_cents
      from public.product_variants pv join public.products p on p.id = pv.product_id
      left join public.variant_costs vc on vc.variant_id = pv.id
      where pv.deleted_at is null and p.deleted_at is null order by p.name, pv.color, pv.size`,
  }), { admin: true });
  if (!res) return <NeedsDatabase />;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nueva compra de mercancía" back={{ href: "/compras", label: "Compras" }}
                  description="Al recibirla se suma al inventario y se actualiza el costo promedio de cada artículo." />
      <PurchaseForm suppliers={res.data.suppliers} variants={res.data.variants} today={todayRD()} preselect={pre} />
    </div>
  );
}
