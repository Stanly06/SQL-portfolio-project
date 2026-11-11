import { Suspense } from "react";
import { Boxes, HandCoins, ShoppingBag, ShoppingCart, TrendingUp, TriangleAlert } from "lucide-react";
import { DemoBadge } from "@/components/dashboard/demo-badge";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { InventoryDonut } from "@/components/dashboard/inventory-donut";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { StockAlerts } from "@/components/dashboard/stock-alerts";
import { TopProducts } from "@/components/dashboard/top-products";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { Badge } from "@/components/ui/badge";
import { getDashboardData } from "@/lib/dashboard-repository";
import { formatMoney, formatNumber, formatPct } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { authMode, requireUser } from "@/lib/server/auth";
import { getLiveDashboard } from "@/lib/server/dashboard";
import { DashboardSkeleton } from "./dashboard-skeleton";

export const metadata = { title: "Inicio" };

export default function DashboardPage(props: PageProps<"/">) {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <WelcomeBanner isDemo={authMode() === "demo"} photoSrc="/brand/hero-moda.jpg" />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function DashboardContent({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { periodo } = await searchParams;
  const period = parsePeriod(periodo);
  const d = authMode() === "demo" ? await getDashboardData(period) : await getLiveDashboard(period, await requireUser());
  const { kpis } = d;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Resumen · <span className="text-pink-strong">{d.periodLabel}</span>
        </h2>
        {d.isDemo && <DemoBadge />}
      </div>

      {/* KPI */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores principales">
        <KpiCard
          tone="pink"
          icon={ShoppingCart}
          label={d.period === "month" ? "Ventas del mes" : `Ventas · ${d.periodLabel}`}
          value={formatMoney(kpis.sales.value)}
          changePct={kpis.sales.changePct}
          comparisonLabel={d.comparisonLabel}
        />
        <KpiCard
          tone="lavender"
          icon={ShoppingBag}
          label="Pedidos"
          value={formatNumber(kpis.orders.total)}
          changePct={kpis.orders.changePct}
          comparisonLabel={d.comparisonLabel}
          footer={
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="warning">{kpis.orders.pending} pendientes</Badge>
              <Badge tone="success">{kpis.orders.completed} completados</Badge>
            </span>
          }
          delay={60}
        />
        <KpiCard
          tone="cream"
          icon={Boxes}
          label="Productos en stock"
          value={`${formatNumber(kpis.stock.units)} unid.`}
          footer={
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="warning"><TriangleAlert className="h-3.5 w-3.5" /> {kpis.stock.lowStock} con stock bajo</Badge>
              <Badge tone="danger">{kpis.stock.outOfStock} agotados</Badge>
            </span>
          }
          delay={120}
        />
        {d.canSeeFinancials ? (
          <KpiCard
            tone="mint"
            icon={TrendingUp}
            label="Ganancia neta"
            value={formatMoney(kpis.netProfit.value)}
            changePct={kpis.netProfit.changePct}
            comparisonLabel={`· margen ${formatPct(kpis.netProfit.marginPct, false)}`}
            delay={180}
          />
        ) : (
          <KpiCard tone="mint" icon={HandCoins} label="Por cobrar en pedidos" value={formatMoney(d.receivables)} delay={180} />
        )}
      </section>

      {/* Gráficos + acciones */}
      <section className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-5"><SalesChart data={d.chart} period={d.period} showProfit={d.canSeeFinancials} /></div>
        <div className="lg:col-span-5 xl:col-span-4"><InventoryDonut data={d.inventoryByCategory} /></div>
        <div className="lg:col-span-12 xl:col-span-3"><QuickActions isAdmin={d.canSeeFinancials} /></div>
      </section>

      {/* Pedidos y alertas */}
      <section className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-12 xl:col-span-7"><RecentOrders orders={d.recentOrders} /></div>
        <div className="lg:col-span-12 xl:col-span-5"><StockAlerts alerts={d.stockAlerts} /></div>
      </section>

      {/* Productos y finanzas */}
      <section className="grid gap-4 lg:grid-cols-12">
        <div className={d.canSeeFinancials ? "lg:col-span-6 xl:col-span-5" : "lg:col-span-12"}><TopProducts products={d.topProducts} /></div>
        {d.canSeeFinancials && (
          <>
            <div className="lg:col-span-6 xl:col-span-4"><FinancialSummary income={d.income} periodLabel={d.periodLabel} /></div>
            <div className="lg:col-span-12 xl:col-span-3"><MarginCard grossMargin={d.income.grossMarginPct} operatingMargin={d.income.operatingMarginPct} netMargin={d.income.netMarginPct} /></div>
          </>
        )}
      </section>
    </>
  );
}

function MarginCard({ grossMargin, operatingMargin, netMargin }: { grossMargin: number; operatingMargin: number; netMargin: number }) {
  const rows = [
    { label: "Margen bruto", value: grossMargin, color: "from-pink to-[#f77fb0]" },
    { label: "Margen operativo", value: operatingMargin, color: "from-lavender to-[#c49cf0]" },
    { label: "Margen neto", value: netMargin, color: "from-success to-[#4cc592]" },
  ];
  return (
    <div className="h-full rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-[15px] font-semibold">Rentabilidad del período</h2>
      <p className="mt-1 text-xs text-muted">Porcentaje de cada peso vendido que queda como ganancia.</p>
      <div className="mt-5 space-y-5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-ink">{r.label}</span>
              <span className="tabular font-semibold text-ink">{formatPct(r.value, false)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-canvas">
              <div className={`h-full rounded-full bg-gradient-to-r ${r.color}`} style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
