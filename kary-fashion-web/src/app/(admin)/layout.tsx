import { AppShell } from "@/components/layout/app-shell";
import type { SearchEntry } from "@/components/layout/global-search";
import { logout } from "@/app/login/actions";
import { getDashboardData } from "@/lib/dashboard-repository";
import { formatMoney } from "@/lib/format";
import { authMode, requireUser, ROLE_LABEL } from "@/lib/server/auth";
import { getShellData } from "@/lib/server/dashboard";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const mode = authMode();

  if (mode !== "demo") {
    const user = await requireUser();
    const shell = await getShellData(user);
    return (
      <AppShell
        badges={shell.badges}
        searchIndex={[]}
        notifications={shell.notifications}
        user={{ name: user.fullName, roleLabel: ROLE_LABEL[user.role], isAdmin: user.isAdmin }}
        logoutAction={logout}
        banner={mode === "dev" ? (
          <p className="bg-warning-soft px-4 py-1.5 text-center text-xs text-[#8a5410] lg:px-8">
            Modo desarrollo: base de datos local con datos de prueba.
          </p>
        ) : undefined}
      >
        {children}
      </AppShell>
    );
  }

  // Modo demostración (sin base de datos): mismo diseño con datos de ejemplo
  const data = await getDashboardData("month");
  const searchIndex: SearchEntry[] = [
    ...data.recentOrders.map((o) => ({ type: "pedido" as const, title: `${o.code} · ${o.customer}`,
      subtitle: `Pedido por ${formatMoney(o.total)}`, href: "/pedidos" })),
    ...data.topProducts.map((p) => ({ type: "producto" as const, title: p.name, subtitle: `${p.sku} · ${p.category}`,
      href: "/productos" })),
  ];
  return (
    <AppShell badges={{ orders: data.kpis.orders.pending, stock: data.kpis.stock.lowStock }} searchIndex={searchIndex}
              notifications={data.notifications} user={null}>
      {children}
    </AppShell>
  );
}
