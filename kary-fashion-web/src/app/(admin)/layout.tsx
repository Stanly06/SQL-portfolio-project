import { AppShell } from "@/components/layout/app-shell";
import type { SearchEntry } from "@/components/layout/global-search";
import { getDashboardData } from "@/lib/dashboard-repository";
import { formatMoney } from "@/lib/format";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const data = await getDashboardData("month");

  // Índice del buscador global (en la Fase 2 será una búsqueda en la base de datos)
  const searchIndex: SearchEntry[] = [
    ...data.recentOrders.map((o) => ({
      type: "pedido" as const,
      title: `${o.code} · ${o.customer}`,
      subtitle: `Pedido por ${formatMoney(o.total)}`,
      href: "/pedidos",
    })),
    ...data.recentOrders.map((o) => ({
      type: "cliente" as const,
      title: o.customer,
      subtitle: `Último pedido ${o.code}`,
      href: "/clientes",
    })),
    ...data.topProducts.map((p) => ({
      type: "producto" as const,
      title: p.name,
      subtitle: `${p.sku} · ${p.category}`,
      href: "/productos",
    })),
    ...data.stockAlerts.map((p) => ({
      type: "producto" as const,
      title: `${p.name} · ${p.color} · ${p.size}`,
      subtitle: `${p.sku} · ${p.stock} en stock`,
      href: "/inventario",
    })),
    { type: "factura", title: "FAC-000231", subtitle: "Factura de demostración · KF-1054", href: "/facturacion" },
  ];

  return (
    <AppShell
      badges={{ orders: data.kpis.orders.pending, stock: data.kpis.stock.lowStock }}
      searchIndex={searchIndex}
      notifications={data.notifications}
    >
      {children}
    </AppShell>
  );
}
