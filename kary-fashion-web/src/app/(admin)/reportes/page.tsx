import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { EmptyState, NeedsDatabase, PageHeader, Panel, TableWrap } from "@/components/ui/page";
import { PrintButton } from "@/components/ui/print-button";
import { RangeFilter } from "@/components/ui/range-filter";
import { formatCell } from "@/lib/report-format";
import { loadAs } from "@/lib/server/page";
import { parseRange, rangeQuery } from "@/lib/server/range";
import { isReportView, NO_TOTAL, REPORT_VIEWS, runReport } from "@/lib/server/reports";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reportes" };

export default async function ReportsPage(props: PageProps<"/reportes">) {
  const sp = await props.searchParams;
  const r = parseRange(sp);
  const vistaRaw = String(sp.vista ?? "ventas");
  const vista = isReportView(vistaRaw) ? vistaRaw : "ventas";
  const res = await loadAs((tx) => runReport(tx, vista, r.from, r.to), { admin: true });
  if (!res) return <NeedsDatabase />;
  const rep = res.data;
  const q = `vista=${vista}&${rangeQuery(r)}`;
  const totals = rep.columns.map((col) =>
    (col.type === "money" || col.type === "int") && !NO_TOTAL.has(col.key)
      ? rep.rows.reduce((a, row) => a + Number(row[col.key] ?? 0), 0) : null);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="print:hidden">
        <PageHeader title="Reportes" description="Elija el reporte y el período. Se puede descargar en Excel, CSV o guardar como PDF."
                    actions={<>
                      <a href={`/reportes/exportar?${q}&formato=xlsx`} download className="inline-flex items-center gap-2 rounded-xl bg-pink px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-strong">
                        <FileSpreadsheet className="h-4 w-4" /> Excel</a>
                      <a href={`/reportes/exportar?${q}&formato=csv`} download className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-plum hover:bg-blush-soft">
                        <Download className="h-4 w-4" /> CSV</a>
                      <PrintButton />
                    </>} />
        <nav className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-white p-1 shadow-sm" aria-label="Reportes">
          {REPORT_VIEWS.map((v) => (
            <Link key={v.key} href={`/reportes?vista=${v.key}&${rangeQuery(r)}`}
                  className={cn("rounded-xl px-3 py-1.5 text-sm", v.key === vista ? "bg-blush font-semibold text-pink-strong" : "text-muted hover:text-plum")}>{v.label}</Link>
          ))}
        </nav>
        {rep.dated && <RangeFilter basePath="/reportes" preset={r.preset} from={r.from} to={r.to} extra={{ vista }} />}
      </div>
      <Panel title={<>{rep.title} <span className="text-sm font-normal text-muted">· {rep.dated ? r.label : "hoy"}</span></>}>
        <p className="mb-4 text-sm text-muted">{rep.description}</p>
        {rep.rows.length === 0 ? <EmptyState title="Sin datos en este período" /> : (
          <TableWrap><table className="table-base">
            <thead><tr>{rep.columns.map((col) => <th key={col.key} className={col.type === "text" || col.type === "date" ? "" : "text-right"}>{col.label}</th>)}</tr></thead>
            <tbody>
              {rep.rows.map((row, i) => (
                <tr key={i}>{rep.columns.map((col) => (
                  <td key={col.key} className={cn(col.type !== "text" && col.type !== "date" && "tabular text-right", col.key === "profit" && "text-success font-medium")}>
                    {formatCell(row[col.key], col.type)}</td>))}</tr>
              ))}
              <tr className="bg-cream font-semibold text-plum">
                {rep.columns.map((col, i) => <td key={col.key} className={col.type !== "text" && col.type !== "date" ? "tabular text-right" : ""}>
                  {i === 0 ? `Total (${rep.rows.length})` : totals[i] != null && col.type !== "pct" ? formatCell(totals[i], col.type) : ""}</td>)}
              </tr>
            </tbody>
          </table></TableWrap>
        )}
      </Panel>
    </div>
  );
}
