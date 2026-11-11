"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleCheck, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { SubmitButton } from "@/components/ui/form";
import { formatMoney, formatNumber } from "@/lib/format";
import { importProducts, type ImportResult } from "./actions";

export function ImportForm() {
  const [state, action] = useActionState<ImportResult, FormData>(importProducts, null);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-blush bg-blush-soft/40 px-6 py-8 text-center hover:bg-blush-soft">
          <FileSpreadsheet className="h-9 w-9 text-pink" />
          <span className="font-medium text-plum">Seleccione el archivo de Excel (.xlsx) o CSV</span>
          <input type="file" name="file" accept=".xlsx,.csv" required className="text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dry_run" defaultChecked className="h-4 w-4 accent-pink" />
          Solo revisar (comprueba el archivo sin guardar nada)
        </label>
        <SubmitButton pendingText="Procesando…">Procesar archivo</SubmitButton>
      </form>

      {state?.error && (
        <div role="alert" className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4" /> {state.error}</p>
          {state.errors && <ul className="mt-2 list-disc space-y-0.5 pl-6">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
      {state?.ok && state.summary && (
        <div role="status" className="rounded-2xl bg-success-soft p-4 text-sm text-success">
          <p className="flex items-center gap-2 font-semibold"><CircleCheck className="h-4 w-4" />
            {state.dryRun ? "El archivo está correcto. Desmarque «Solo revisar» y procéselo de nuevo para guardarlo." : "¡Catálogo cargado!"}</p>
          <ul className="mt-2 grid gap-1 text-ink sm:grid-cols-2">
            <li>{formatNumber(state.summary.products)} productos ({formatNumber(state.summary.newProducts)} nuevos)</li>
            <li>{formatNumber(state.summary.variants)} tallas/colores</li>
            <li>{formatNumber(state.summary.units)} unidades en existencia</li>
            <li>Invertido al costo: {formatMoney(state.summary.costValue)}</li>
            <li>Valor a precio de venta: {formatMoney(state.summary.retailValue)}</li>
            {state.summary.newCategories.length > 0 && <li>Categorías nuevas: {state.summary.newCategories.join(", ")}</li>}
          </ul>
          {!state.dryRun && <Link href="/productos" className="mt-3 inline-block font-semibold text-pink-strong underline">Ver productos →</Link>}
        </div>
      )}
    </div>
  );
}
