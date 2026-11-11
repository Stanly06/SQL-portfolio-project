import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState, NeedsDatabase, PageHeader, Panel, Stat, TableWrap } from "@/components/ui/page";
import { RangeFilter } from "@/components/ui/range-filter";
import { formatMoney } from "@/lib/format";
import { formatDateTime } from "@/lib/labels";
import { loadAs } from "@/lib/server/page";
import { parseRange } from "@/lib/server/range";

export const metadata = { title: "Facturación" };

const KIND: Record<string, string> = { commercial: "Comercial", B01: "Crédito fiscal (B01)", B02: "Consumo (B02)", E31: "e-CF crédito (E31)", E32: "e-CF consumo (E32)" };

export default async function InvoicesPage(props: PageProps<"/facturacion">) {
  const sp = await props.searchParams;
  const r = parseRange(sp);
  const q = String(sp.q ?? "").trim();
  const res = await loadAs((tx) => tx<{ id: number; number: string; kind: string; ncf: string | null; ncf_status: string; issued_at: Date;
    sale_id: number; sale_number: number; status: string; total_cents: number; customer: string | null }[]>`
    select i.id, i.number, i.kind::text, i.ncf, i.ncf_status::text, i.issued_at, s.id as sale_id, s.number as sale_number, s.status::text,
           s.total_cents, c.full_name as customer
    from public.invoices i join public.sales s on s.id = i.sale_id left join public.customers c on c.id = s.customer_id
    where app.biz_date(i.issued_at) between ${r.from}::date and ${r.to}::date
      and (${q} = '' or i.number ilike '%' || ${q} || '%' or c.full_name ilike '%' || ${q} || '%' or i.ncf ilike '%' || ${q} || '%')
    order by i.id desc limit 500`);
  if (!res) return <NeedsDatabase />;
  const ok = res.data.filter((x) => x.status === "completed");
  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader title="Facturación" description="Todas las facturas emitidas. Abra una para imprimirla, guardarla en PDF o enviarla por WhatsApp." />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <RangeFilter basePath="/facturacion" preset={r.preset} from={r.from} to={r.to} />
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="No. de factura, cliente o NCF" className="input w-64 py-2" />
          <button className="rounded-xl border border-line bg-white px-4 text-sm font-medium text-plum hover:bg-blush-soft">Buscar</button></form>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Facturas válidas" value={ok.length} />
        <Stat label="Monto facturado" value={formatMoney(ok.reduce((a, x) => a + x.total_cents, 0))} tone="pink" />
        <Stat label="Anuladas" value={res.data.length - ok.length} />
      </div>
      <p className="rounded-xl bg-lavender-soft px-4 py-2.5 text-sm text-plum">
        El negocio no tiene RNC: las facturas son comerciales, sin ITBIS ni NCF. Si se registra en la DGII se activa en Configuración.
      </p>
      <Panel>
        {res.data.length === 0 ? <EmptyState title="Sin facturas en este período" /> : (
          <TableWrap><table className="table-base">
            <thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th className="text-right">Total</th><th>Estado</th></tr></thead>
            <tbody>{res.data.map((x) => (
              <tr key={x.id} className={x.status === "cancelled" ? "opacity-60" : ""}>
                <td><Link href={`/ventas/${x.sale_id}`} className="font-medium hover:text-pink-strong">{x.number}</Link>
                  <span className="block text-xs text-muted">Venta #{x.sale_number}{x.ncf && ` · NCF ${x.ncf}`}</span></td>
                <td className="whitespace-nowrap text-muted">{formatDateTime(x.issued_at)}</td>
                <td>{x.customer ?? <span className="text-muted">Cliente general</span>}</td>
                <td className="text-muted">{KIND[x.kind] ?? x.kind}</td>
                <td className="tabular text-right font-semibold">{formatMoney(x.total_cents)}</td>
                <td>{x.status === "cancelled" ? <Badge tone="danger">Anulada</Badge> : x.ncf_status === "pending_authorization"
                  ? <Badge tone="warning">e-CF pendiente</Badge> : <Badge tone="success">Válida</Badge>}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        )}
      </Panel>
    </div>
  );
}
