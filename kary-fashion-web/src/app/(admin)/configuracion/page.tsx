import { Badge } from "@/components/ui/badge";
import { NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { formatDay } from "@/lib/labels";
import { ROLE_LABEL, type Role } from "@/lib/server/auth";
import { loadAs } from "@/lib/server/page";
import { BusinessForm, RulesForm, StoreForm, TaxForm, UserRoleForm } from "./forms";

export const metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const res = await loadAs(async (tx) => {
    const rows = await tx<{ key: string; value: Record<string, unknown> }[]>`select key, value from public.settings`;
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const staff = await tx<{ id: string; full_name: string; role: string; active: boolean; email: string; created_at: Date }[]>`
      select id, full_name, role, active, email, created_at from public.staff_directory
      where role <> 'customer' or active order by case role when 'owner' then 0 when 'admin' then 1 when 'employee' then 2 else 3 end, full_name`;
    return { s, staff };
  }, { admin: true });
  if (!res) return <NeedsDatabase />;
  const { s, staff } = res.data;
  const owner = res.user.isOwner;
  const tax = (s.tax ?? {}) as { charges_itbis?: boolean; itbis_rate_pct?: number };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Configuración" description={owner ? "Solo la dueña puede cambiar estos datos." : "Solo la dueña puede cambiar estos datos; usted puede consultarlos."} />
      <Panel title="Datos del negocio" actions={<span className="text-xs text-muted">Aparecen en las facturas</span>}>
        <BusinessForm b={(s.business ?? {}) as Record<string, string>} canEdit={owner} />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Reglas de venta">
          <RulesForm discount={Number((s.discounts as { employee_max_pct?: number })?.employee_max_pct ?? 10)}
                     deposit={Number((s.orders as { min_deposit_pct?: number })?.min_deposit_pct ?? 100)} canEdit={owner} />
        </Panel>
        <Panel title="Impuestos" actions={tax.charges_itbis ? <Badge tone="info">Cobra ITBIS</Badge> : <Badge tone="neutral">Sin ITBIS</Badge>}>
          <TaxForm charges={Boolean(tax.charges_itbis)} rate={Number(tax.itbis_rate_pct ?? 18)} canEdit={owner} />
        </Panel>
      </div>
      <div id="tienda" className="scroll-mt-24">
        <Panel title="Tienda online" actions={<a href="/tienda" target="_blank" rel="noreferrer" className="text-xs font-medium text-pink-strong hover:underline">Ver la tienda →</a>}>
          <StoreForm s={(s.store ?? {}) as Record<string, never>} canEdit={owner} />
        </Panel>
      </div>
      <Panel title="Usuarios y permisos">
        <p className="mb-4 text-sm text-muted">
          Cada persona entra con su propio correo. Cuando alguien crea su cuenta aparece aquí sin acceso al panel, y la dueña le asigna el rol.
          <b className="text-ink"> Dueña:</b> todo. <b className="text-ink">Administradora:</b> todo menos usuarios y configuración.
          <b className="text-ink"> Empleada:</b> vende y atiende pedidos, sin ver costos ni ganancias.
        </p>
        <TableWrap><table className="table-base">
          <thead><tr><th>Persona</th><th>Correo</th><th>Rol actual</th><th>Desde</th>{owner && <th>Cambiar acceso</th>}</tr></thead>
          <tbody>{staff.map((u) => (
            <tr key={u.id} className={u.active ? "" : "opacity-50"}>
              <td className="font-medium">{u.full_name}</td>
              <td className="text-muted">{u.email}</td>
              <td><Badge tone={u.role === "owner" ? "gold" : u.role === "admin" ? "lavender" : u.role === "employee" ? "pink" : "neutral"}>
                {ROLE_LABEL[u.role as Role] ?? "Sin acceso"}</Badge></td>
              <td className="text-muted">{formatDay(u.created_at)}</td>
              {owner && <td><UserRoleForm id={u.id} role={u.role} active={u.active} isSelf={u.id === res.user.id} /></td>}
            </tr>))}</tbody>
        </table></TableWrap>
      </Panel>
    </div>
  );
}
