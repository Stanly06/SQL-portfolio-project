import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { asUser } from "@/lib/server/db";

/** Buscador global: productos, pedidos, clientes y facturas, con los permisos de cada rol. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json([], { status: 401 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json([]);
  const like = `%${q}%`;
  const rows = await asUser(user.id, (tx) => tx<{ type: string; title: string; subtitle: string; href: string }[]>`
    (select 'producto' as type, p.name as title, p.sku_base || ' · ' || c.name as subtitle, '/productos/' || p.id as href
       from public.products p join public.categories c on c.id = p.category_id
      where p.deleted_at is null and (p.name ilike ${like} or p.sku_base ilike ${like}) limit 4)
    union all
    (select 'cliente', full_name, coalesce(phone, ''), '/clientes/' || id from public.customers
      where full_name ilike ${like} or phone ilike ${like} limit 4)
    union all
    (select 'pedido', o.number || ' · ' || c.full_name, 'Pedido', '/pedidos/' || o.id
       from public.orders o join public.customers c on c.id = o.customer_id
      where o.number ilike ${like} or c.full_name ilike ${like} limit 4)
    union all
    (select 'factura', 'Venta #' || s.number || coalesce(' · ' || i.ncf, ''), coalesce(c.full_name, 'Cliente general'), '/ventas/' || s.id
       from public.sales s join public.invoices i on i.sale_id = s.id left join public.customers c on c.id = s.customer_id
      where s.number::text = ${q.replace(/^#/, "")} or i.number ilike ${like} or i.ncf ilike ${like} limit 4)`);
  return NextResponse.json(rows);
}
