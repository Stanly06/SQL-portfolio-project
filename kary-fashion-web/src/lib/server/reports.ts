import "server-only";
import type { Tx } from "./db";

export type ColType = "text" | "int" | "money" | "pct" | "date";
export interface Column { key: string; label: string; type: ColType }
export interface Report { title: string; description: string; columns: Column[]; rows: Record<string, string | number | Date | null>[]; dated: boolean }

export const REPORT_VIEWS = [
  { key: "ventas", label: "Ventas por día" },
  { key: "productos", label: "Productos" },
  { key: "categorias", label: "Categorías" },
  { key: "clientes", label: "Clientes" },
  { key: "vendedoras", label: "Vendedoras" },
  { key: "pagos", label: "Métodos de pago" },
  { key: "pedidos", label: "Pedidos" },
  { key: "sin-movimiento", label: "Sin movimiento" },
  { key: "inventario", label: "Inventario" },
] as const;
export type ReportView = (typeof REPORT_VIEWS)[number]["key"];

const c = (key: string, label: string, type: ColType = "text"): Column => ({ key, label, type });
const ORDER_STATUS: Record<string, string> = { new: "Nuevo", pending_payment: "Pendiente de pago", confirmed: "Confirmado",
  preparing: "En preparación", shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", returned: "Devuelto" };
const METHOD: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", gateway: "Pago en línea" };

/** Cada reporte es una consulta con los permisos de la usuaria (solo administración ve costos). */
export async function runReport(tx: Tx, view: ReportView, from: string, to: string): Promise<Report> {
  switch (view) {
    case "ventas": return { title: "Ventas por día", dated: true, description: "Facturas, unidades, ventas y ganancia de cada día.",
      columns: [c("day", "Día", "date"), c("invoices", "Facturas", "int"), c("units", "Unidades", "int"), c("revenue", "Ventas", "money"),
        c("cost", "Costo", "money"), c("profit", "Ganancia bruta", "money"), c("margin", "Margen", "pct")],
      rows: await tx`select business_date as day, count(distinct sale_id)::int as invoices, sum(quantity)::int as units,
          sum(line_total_cents)::int8 as revenue, sum(cost_cents)::int8 as cost, sum(gross_profit_cents)::int8 as profit,
          round(100.0 * sum(gross_profit_cents) / nullif(sum(line_total_cents), 0), 1)::float8 as margin
        from public.sales_lines where business_date between ${from}::date and ${to}::date group by 1 order by 1 desc` };
    case "productos": return { title: "Rentabilidad y rotación por producto", dated: true,
      description: "Qué se vende, cuánto deja y qué parte de la mercancía ya salió.",
      columns: [c("product", "Producto"), c("category", "Categoría"), c("units", "Vendidas", "int"), c("revenue", "Ventas", "money"),
        c("profit", "Ganancia", "money"), c("margin", "Margen", "pct"), c("stock", "Existencia", "int"), c("sell_through", "Vendido del total", "pct")],
      rows: await tx`select p.name as product, cat.name::text as category, coalesce(s.units, 0)::int as units, coalesce(s.revenue, 0)::int8 as revenue,
          coalesce(s.profit, 0)::int8 as profit, round(100.0 * s.profit / nullif(s.revenue, 0), 1)::float8 as margin,
          st.stock::int as stock, round(100.0 * coalesce(s.units, 0) / nullif(coalesce(s.units, 0) + st.stock, 0), 1)::float8 as sell_through
        from public.products p join public.categories cat on cat.id = p.category_id
        join lateral (select coalesce(sum(greatest(stock, 0)), 0) as stock from public.product_variants v where v.product_id = p.id and v.deleted_at is null) st on true
        left join lateral (select sum(quantity) as units, sum(line_total_cents) as revenue, sum(gross_profit_cents) as profit
                           from public.sales_lines l where l.product_id = p.id and l.business_date between ${from}::date and ${to}::date) s on true
        where p.deleted_at is null order by revenue desc nulls last, p.name` };
    case "categorias": return { title: "Margen por categoría", dated: true, description: "Ventas, costo y ganancia de cada categoría.",
      columns: [c("category", "Categoría"), c("units", "Unidades", "int"), c("revenue", "Ventas", "money"), c("cost", "Costo", "money"),
        c("profit", "Ganancia", "money"), c("margin", "Margen", "pct")],
      rows: await tx`select coalesce(cat.name::text, 'Encargos') as category, sum(l.quantity)::int as units, sum(l.line_total_cents)::int8 as revenue,
          sum(l.cost_cents)::int8 as cost, sum(l.gross_profit_cents)::int8 as profit,
          round(100.0 * sum(l.gross_profit_cents) / nullif(sum(l.line_total_cents), 0), 1)::float8 as margin
        from public.sales_lines l left join public.categories cat on cat.id = l.category_id
        where l.business_date between ${from}::date and ${to}::date group by 1 order by revenue desc` };
    case "clientes": return { title: "Ventas por cliente", dated: true, description: "Quién compra más y quién vuelve (3 compras o más = recurrente).",
      columns: [c("customer", "Cliente"), c("phone", "Teléfono"), c("purchases", "Compras", "int"), c("total", "Total gastado", "money"),
        c("avg", "Ticket promedio", "money"), c("last", "Última compra", "date"), c("recurrent", "Recurrente")],
      rows: await tx`select cu.full_name as customer, cu.phone, count(*)::int as purchases, sum(s.total_cents)::int8 as total,
          (sum(s.total_cents) / count(*))::int8 as avg, max(app.biz_date(s.sale_date)) as last,
          case when (select count(*) from public.sales s2 where s2.customer_id = cu.id and s2.status = 'completed') >= 3 then 'Sí' else 'No' end as recurrent
        from public.sales s join public.customers cu on cu.id = s.customer_id
        where s.status = 'completed' and app.biz_date(s.sale_date) between ${from}::date and ${to}::date
        group by cu.id order by total desc` };
    case "vendedoras": return { title: "Ventas por vendedora", dated: true, description: "Facturas y monto vendido por cada persona.",
      columns: [c("seller", "Vendedora"), c("invoices", "Facturas", "int"), c("total", "Vendido", "money"), c("avg", "Ticket promedio", "money")],
      rows: await tx`select pr.full_name as seller, count(*)::int as invoices, sum(s.total_cents)::int8 as total, (sum(s.total_cents) / count(*))::int8 as avg
        from public.sales s join public.profiles pr on pr.id = s.sold_by
        where s.status = 'completed' and app.biz_date(s.sale_date) between ${from}::date and ${to}::date group by pr.id order by total desc` };
    case "pagos": {
      const rows = await tx<{ method: string; payments: number; total: number }[]>`select method::text, count(*)::int as payments, sum(amount_cents)::int8 as total
        from public.payments where status = 'confirmed' and app.biz_date(received_at) between ${from}::date and ${to}::date group by 1 order by total desc`;
      return { title: "Cobros por método de pago", dated: true, description: "Incluye pagos de ventas y anticipos de pedidos.",
        columns: [c("method", "Método"), c("payments", "Pagos", "int"), c("total", "Monto", "money")],
        rows: rows.map((r) => ({ ...r, method: METHOD[r.method] ?? r.method })) };
    }
    case "pedidos": {
      const rows = await tx<{ status: string; orders: number; total: number; balance: number }[]>`select status::text, count(*)::int as orders,
          sum(total_cents)::int8 as total, sum(greatest(balance_cents, 0))::int8 as balance
        from public.order_balances where app.biz_date(created_at) between ${from}::date and ${to}::date group by 1 order by orders desc`;
      return { title: "Pedidos por estado", dated: true, description: "Incluye los cancelados y devueltos del período.",
        columns: [c("status", "Estado"), c("orders", "Pedidos", "int"), c("total", "Valor", "money"), c("balance", "Pendiente de cobro", "money")],
        rows: rows.map((r) => ({ ...r, status: ORDER_STATUS[r.status] ?? r.status })) };
    }
    case "sin-movimiento": return { title: "Mercancía sin movimiento", dated: true,
      description: "Tallas y colores con existencia que no se vendieron en el período: candidatas a oferta.",
      columns: [c("product", "Producto"), c("variant", "Talla / color"), c("stock", "Existencia", "int"), c("cost_value", "Dinero detenido (costo)", "money"),
        c("last_sale", "Última venta", "date")],
      rows: await tx`select p.name as product, concat_ws(' · ', v.color, v.size) as variant, v.stock,
          (v.stock::int8 * coalesce(vc.avg_cost_cents, 0))::int8 as cost_value,
          (select max(business_date) from public.sales_lines l where l.variant_id = v.id) as last_sale
        from public.product_variants v join public.products p on p.id = v.product_id
        left join public.variant_costs vc on vc.variant_id = v.id
        where v.stock > 0 and v.deleted_at is null and p.deleted_at is null
          and not exists (select 1 from public.sales_lines l where l.variant_id = v.id and l.business_date between ${from}::date and ${to}::date)
        order by cost_value desc` };
    case "inventario": return { title: "Inventario valorizado", dated: false, description: "Existencia actual al costo y a precio de venta.",
      columns: [c("sku", "Código"), c("product", "Producto"), c("variant", "Talla / color"), c("stock", "Existencia", "int"),
        c("unit_cost", "Costo unidad", "money"), c("price", "Precio", "money"), c("cost_value", "Valor al costo", "money"), c("retail_value", "Valor de venta", "money")],
      rows: await tx`select v.sku::text, p.name as product, concat_ws(' · ', v.color, v.size) as variant, v.stock,
          coalesce(vc.avg_cost_cents, 0)::int8 as unit_cost, v.price_cents as price,
          (greatest(v.stock, 0)::int8 * coalesce(vc.avg_cost_cents, 0))::int8 as cost_value, (greatest(v.stock, 0)::int8 * v.price_cents)::int8 as retail_value
        from public.product_variants v join public.products p on p.id = v.product_id left join public.variant_costs vc on vc.variant_id = v.id
        where v.deleted_at is null and p.deleted_at is null and v.active order by p.name, v.color, v.size` };
  }
}

/** Columnas que no tiene sentido sumar (promedios y valores por unidad). */
export const NO_TOTAL = new Set(["avg", "price", "unit_cost", "margin", "sell_through"]);

export function isReportView(v: string): v is ReportView {
  return REPORT_VIEWS.some((x) => x.key === v);
}
