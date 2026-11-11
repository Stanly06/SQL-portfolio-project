import "server-only";
import { buildIncomeStatement, changePct } from "@/lib/finance";
import type { CategorySlice, DashboardData, OrderStatus, Period, RecentOrder } from "@/lib/types";
import type { CurrentUser } from "./auth";
import { asUser, type Tx } from "./db";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre",
  "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const PALETTE = ["#F65B9A", "#A66BE3", "#49243E", "#F7A8C8", "#C99A2E", "#D6BDF2", "#C9C2CE", "#7A6F80"];

export const ORDER_STATUS_DB: Record<string, OrderStatus> = {
  new: "nuevo", pending_payment: "pendiente_pago", confirmed: "confirmado", preparing: "en_preparacion",
  shipped: "enviado", delivered: "entregado", cancelled: "cancelado", returned: "devuelto",
};
const CHANNEL_DB: Record<string, RecentOrder["channel"]> = {
  store: "tienda", online: "online", whatsapp: "whatsapp", instagram: "instagram", tiktok: "tiktok",
};

/** Fecha de hoy en República Dominicana (YYYY-MM-DD). */
export function todayRD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
}
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * 86_400_000));

/** Período actual (hasta hoy) y el período anterior equivalente. */
export function periodRange(period: Period, today = todayRD()) {
  const d = toDate(today);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (period === "day") return { from: today, to: today, prevFrom: addDays(today, -1), prevTo: addDays(today, -1),
    label: "Hoy", comparison: "vs. ayer", grain: "day" as const, chartFrom: addDays(today, -6) };
  if (period === "week") {
    const offset = (d.getUTCDay() + 6) % 7; // lunes = 0
    const from = addDays(today, -offset);
    return { from, to: today, prevFrom: addDays(from, -7), prevTo: addDays(today, -7), label: "Esta semana",
      comparison: "vs. semana anterior", grain: "day" as const, chartFrom: from };
  }
  if (period === "month") {
    const from = iso(new Date(Date.UTC(y, m, 1)));
    const prevFrom = iso(new Date(Date.UTC(y, m - 1, 1)));
    const prevLast = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from, to: today, prevFrom, prevTo: iso(new Date(Date.UTC(y, m - 1, Math.min(day, prevLast)))),
      label: `${MESES_LARGOS[m]} ${y}`, comparison: "vs. mes anterior", grain: "day" as const, chartFrom: from };
  }
  return { from: `${y}-01-01`, to: today, prevFrom: `${y - 1}-01-01`, prevTo: iso(new Date(Date.UTC(y - 1, m, day))),
    label: `Año ${y}`, comparison: `vs. ${y - 1}`, grain: "month" as const, chartFrom: `${y}-01-01` };
}

async function salesTotals(tx: Tx, from: string, to: string) {
  const [r] = await tx<{ n: number; total: number; subtotal: number; discount: number; shipping: number; tax: number }[]>`
    select count(*)::int as n, coalesce(sum(total_cents), 0)::int8 as total, coalesce(sum(subtotal_cents), 0)::int8 as subtotal,
           coalesce(sum(discount_cents), 0)::int8 as discount, coalesce(sum(shipping_cents), 0)::int8 as shipping,
           coalesce(sum(tax_cents), 0)::int8 as tax
    from public.sales
    where status = 'completed' and app.biz_date(sale_date) between ${from}::date and ${to}::date`;
  return r;
}

type IncomeRow = {
  gross_sales_cents: number; discounts_cents: number; returns_cents: number; sales_tax_cents: number;
  cost_of_goods_sold_cents: number; operating_expenses_cents: number; financial_expenses_cents: number;
  income_tax_cents: number; inventory_purchases_cents: number;
};

async function income(tx: Tx, from: string, to: string) {
  const [r] = await tx<IncomeRow[]>`select * from public.income_statement(${from}::date, ${to}::date)`;
  return buildIncomeStatement({
    grossSales: r.gross_sales_cents, discounts: r.discounts_cents, returns: r.returns_cents, salesTax: r.sales_tax_cents,
    costOfGoodsSold: r.cost_of_goods_sold_cents, operatingExpenses: r.operating_expenses_cents,
    financialExpenses: r.financial_expenses_cents, incomeTax: r.income_tax_cents,
    inventoryPurchases: r.inventory_purchases_cents,
  });
}

export async function getLiveDashboard(period: Period, user: CurrentUser): Promise<DashboardData> {
  const r = periodRange(period);
  return asUser(user.id, async (tx) => {
    const [cur, prev] = await Promise.all([salesTotals(tx, r.from, r.to), salesTotals(tx, r.prevFrom, r.prevTo)]);

    let inc, prevInc;
    if (user.isAdmin) {
      [inc, prevInc] = [await income(tx, r.from, r.to), await income(tx, r.prevFrom, r.prevTo)];
    } else {
      // Empleadas: solo ventas, sin costos ni ganancias
      const base = (t: typeof cur) => buildIncomeStatement({
        grossSales: t.subtotal + t.shipping - t.tax, discounts: t.discount, returns: 0, salesTax: t.tax,
        costOfGoodsSold: 0, operatingExpenses: 0, financialExpenses: 0, incomeTax: 0, inventoryPurchases: 0,
      });
      [inc, prevInc] = [base(cur), base(prev)];
    }

    const series = await tx<{ bucket: Date; sales: number; profit: number }[]>`
      with g as (
        select generate_series(date_trunc(${r.grain}, ${r.chartFrom}::date::timestamp),
                               date_trunc(${r.grain}, ${r.to}::date::timestamp), ('1 ' || ${r.grain})::interval)::date as bucket
      ), l as (
        select date_trunc(${r.grain}, app.biz_date(s.sale_date)::timestamp)::date as bucket,
               sum(si.line_total_cents) as sales
          from public.sales s join public.staff_sale_items si on si.sale_id = s.id
         where s.status = 'completed' and app.biz_date(s.sale_date) between ${r.chartFrom}::date and ${r.to}::date
         group by 1
      ), p as (
        select date_trunc(${r.grain}, business_date::timestamp)::date as bucket, sum(gross_profit_cents) as profit
          from public.sales_lines where business_date between ${r.chartFrom}::date and ${r.to}::date group by 1
      )
      select g.bucket, coalesce(l.sales, 0)::int8 as sales, coalesce(p.profit, 0)::int8 as profit
        from g left join l using (bucket) left join p using (bucket) order by g.bucket`;

    const [orders] = await tx<{ total: number; prev: number; active: number; delivered: number }[]>`
      select count(*) filter (where app.biz_date(created_at) between ${r.from}::date and ${r.to}::date)::int as total,
             count(*) filter (where app.biz_date(created_at) between ${r.prevFrom}::date and ${r.prevTo}::date)::int as prev,
             count(*) filter (where status in ('new','pending_payment','confirmed','preparing','shipped'))::int as active,
             count(*) filter (where status = 'delivered' and app.biz_date(updated_at) between ${r.from}::date and ${r.to}::date)::int as delivered
      from public.orders`;

    const [stock] = await tx<{ units: number; low: number; out: number; skus: number }[]>`
      select coalesce(sum(greatest(pv.stock, 0)), 0)::int as units,
             count(*) filter (where pv.stock <= pv.min_stock)::int as low,
             count(*) filter (where pv.stock <= 0)::int as out, count(*)::int as skus
      from public.product_variants pv join public.products p on p.id = pv.product_id
      where pv.active and pv.deleted_at is null and p.deleted_at is null`;

    const cats = await tx<{ category: string; units: number }[]>`
      select c.name::text as category, coalesce(sum(greatest(pv.stock, 0)), 0)::int as units
      from public.categories c
      join public.products p on p.category_id = c.id and p.deleted_at is null
      join public.product_variants pv on pv.product_id = p.id and pv.active and pv.deleted_at is null
      group by c.name having sum(greatest(pv.stock, 0)) > 0 order by 2 desc`;

    const recent = await tx<{ number: string; customer: string; created_at: Date; total_cents: number; status: string; channel: string }[]>`
      select number, customer, created_at, total_cents, status, channel from public.order_balances
      order by created_at desc limit 6`;

    const alerts = await tx<{ sku: string; name: string; size: string | null; color: string | null; stock: number; min_stock: number; category: string }[]>`
      select sku, name, size, color, stock, min_stock, category from public.low_stock_alerts order by stock, name limit 5`;

    const top = await tx<{ sku: string; name: string; category: string; units: number; revenue: number }[]>`
      select p.sku_base::text as sku, p.name, c.name::text as category, sum(si.quantity)::int as units,
             sum(si.line_total_cents)::int8 as revenue
      from public.staff_sale_items si
      join public.sales s on s.id = si.sale_id and s.status = 'completed'
      join public.product_variants pv on pv.id = si.variant_id
      join public.products p on p.id = pv.product_id
      join public.categories c on c.id = p.category_id
      where app.biz_date(s.sale_date) between ${r.from}::date and ${r.to}::date
      group by p.id, c.name order by units desc, revenue desc limit 5`;

    const [recv] = await tx<{ balance: number; pending_payment: number }[]>`
      select coalesce(sum(balance_cents) filter (where status in ('new','pending_payment','confirmed','preparing','shipped')), 0)::int8 as balance,
             count(*) filter (where status = 'pending_payment')::int as pending_payment
      from public.order_balances`;

    const notifications: DashboardData["notifications"] = [];
    if (stock.out > 0) notifications.push({ id: "out", title: "Agotados", detail: `${stock.out} variantes sin existencia`, tone: "danger" });
    if (stock.low > 0) notifications.push({ id: "low", title: "Stock bajo", detail: `${stock.low} variantes en o por debajo del mínimo`, tone: "warning" });
    if (recv.pending_payment > 0) notifications.push({ id: "pay", title: "Pagos pendientes", detail: `${recv.pending_payment} pedidos esperan pago`, tone: "info" });
    if (notifications.length === 0) notifications.push({ id: "ok", title: "Todo en orden", detail: "No hay alertas por ahora.", tone: "success" });

    const chart = series.map((p) => {
      const d = new Date(p.bucket);
      const label = r.grain === "month" ? MESES[d.getUTCMonth()]
        : period === "week" ? DIAS[d.getUTCDay()] : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      return { label, sales: p.sales, profit: user.isAdmin ? p.profit : 0 };
    });

    return {
      isDemo: false,
      canSeeFinancials: user.isAdmin,
      receivables: recv.balance,
      period,
      periodLabel: r.label,
      comparisonLabel: r.comparison,
      kpis: {
        sales: { value: inc.netRevenue, changePct: changePct(inc.netRevenue, prevInc.netRevenue) },
        orders: { total: orders.total, pending: orders.active, completed: orders.delivered, changePct: changePct(orders.total, orders.prev) },
        stock: { units: stock.units, lowStock: stock.low, outOfStock: stock.out, skus: stock.skus },
        netProfit: { value: inc.netProfit, marginPct: inc.netMarginPct, changePct: changePct(inc.netProfit, prevInc.netProfit) },
      },
      income: inc,
      chart,
      inventoryByCategory: cats.map((c, i): CategorySlice => ({ ...c, color: PALETTE[i % PALETTE.length] })),
      recentOrders: recent.map((o) => ({
        code: o.number, customer: o.customer, date: new Date(o.created_at).toISOString().slice(0, 10),
        total: o.total_cents, status: ORDER_STATUS_DB[o.status], channel: CHANNEL_DB[o.channel] ?? "tienda",
      })),
      stockAlerts: alerts.map((a) => ({ sku: a.sku, name: a.name, size: a.size ?? "Única", color: a.color ?? "—",
        stock: a.stock, minStock: a.min_stock, category: a.category })),
      topProducts: top,
      notifications,
    };
  });
}

/** Contadores del menú y notificaciones (consulta liviana para todas las páginas). */
export async function getShellData(user: CurrentUser) {
  return asUser(user.id, async (tx) => {
    const [r] = await tx<{ active_orders: number; low: number; out: number; pending_payment: number }[]>`
      select (select count(*) from public.orders where status in ('new','pending_payment','confirmed','preparing'))::int as active_orders,
             (select count(*) from public.low_stock_alerts)::int as low,
             (select count(*) from public.low_stock_alerts where stock <= 0)::int as out,
             (select count(*) from public.orders where status = 'pending_payment')::int as pending_payment`;
    const notifications: DashboardData["notifications"] = [];
    if (r.out > 0) notifications.push({ id: "out", title: "Agotados", detail: `${r.out} variantes sin existencia`, tone: "danger" });
    if (r.low > 0) notifications.push({ id: "low", title: "Stock bajo", detail: `${r.low} variantes en o por debajo del mínimo`, tone: "warning" });
    if (r.pending_payment > 0) notifications.push({ id: "pay", title: "Pagos pendientes", detail: `${r.pending_payment} pedidos esperan pago`, tone: "info" });
    if (notifications.length === 0) notifications.push({ id: "ok", title: "Todo en orden", detail: "No hay alertas por ahora.", tone: "success" });
    return { badges: { orders: r.active_orders, stock: r.low }, notifications };
  });
}
