"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/server/actions";

export interface Option { id: number; name: string }
export interface ProductValues {
  id?: number; name?: string; sku_base?: string; category_id?: number; brand?: string | null; supplier_id?: number | null;
  description?: string | null; image_url?: string | null; status?: string; published?: boolean;
}

export function ProductFields({ p, categories, suppliers }: { p: ProductValues; categories: Option[]; suppliers: Option[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre del producto" className="sm:col-span-2">
        <input name="name" required defaultValue={p.name ?? ""} placeholder="Blusa crop de lino" className="input" />
      </Field>
      <Field label="Código base (SKU)" hint="Se usa para generar el código de cada talla/color.">
        <input name="sku_base" required defaultValue={p.sku_base ?? ""} placeholder="BLU-0102" className="input uppercase" />
      </Field>
      <Field label="Categoría">
        <select name="category_id" required defaultValue={p.category_id ?? ""} className="input">
          <option value="" disabled>Seleccione…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Marca">
        <input name="brand" defaultValue={p.brand ?? ""} className="input" />
      </Field>
      <Field label="Proveedor">
        <select name="supplier_id" defaultValue={p.supplier_id ?? ""} className="input">
          <option value="">Sin proveedor</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Descripción" className="sm:col-span-2">
        <textarea name="description" rows={2} defaultValue={p.description ?? ""} className="input" />
      </Field>
      <Field label="Enlace de la foto" hint="Por ahora, un enlace (https://…). La subida de fotos llega con la tienda online.">
        <input name="image_url" type="url" defaultValue={p.image_url ?? ""} placeholder="https://…" className="input" />
      </Field>
      <Field label="Estado">
        <select name="status" defaultValue={p.status ?? "active"} className="input">
          <option value="active">Activo (se puede vender)</option>
          <option value="draft">Borrador</option>
          <option value="archived">Archivado</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
        <input type="checkbox" name="published" defaultChecked={p.published ?? false} className="h-4 w-4 accent-pink" />
        Publicar en la tienda online (cuando esté disponible)
      </label>
    </div>
  );
}

export function VariantInputs({ showSku = false }: { showSku?: boolean }) {
  return (
    <>
      {showSku && <input name="v_sku" placeholder="SKU (auto)" className="input" aria-label="SKU" />}
      <input name="v_color" placeholder="Color" className="input" aria-label="Color" />
      <input name="v_size" placeholder="Talla" className="input" aria-label="Talla" />
      <input name="v_price" inputMode="decimal" placeholder="Precio" className="input" aria-label="Precio de venta" />
      <input name="v_cost" inputMode="decimal" placeholder="Costo" className="input" aria-label="Costo por unidad" />
      <input name="v_qty" inputMode="numeric" placeholder="Existencia" className="input" aria-label="Existencia inicial" />
      <input name="v_min" inputMode="numeric" placeholder="Mín. 2" className="input" aria-label="Existencia mínima" />
    </>
  );
}

export function NewProductForm({ action, categories, suppliers }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>; categories: Option[]; suppliers: Option[];
}) {
  const [state, formAction] = useActionState(action, null);
  const [rows, setRows] = useState([0, 1]);
  const [next, setNext] = useState(2);

  return (
    <form action={formAction} className="space-y-6">
      <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-4 text-[15px] font-semibold">Datos del producto</h2>
        <ProductFields p={{}} categories={categories} suppliers={suppliers} />
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-[15px] font-semibold">Tallas y colores</h2>
        <p className="mb-4 mt-1 text-xs text-muted">
          Cada fila es una variante con su propio código y existencia. El costo y la existencia inicial son para la mercancía que ya
          está en la tienda; la mercancía nueva se registra en <b>Compras</b>.
        </p>
        <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_40px] gap-2 px-1 pb-1 text-xs font-semibold text-plum md:grid">
          <span>Color</span><span>Talla</span><span>Precio venta</span><span>Costo unidad</span><span>Existencia</span><span>Mínimo</span><span />
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r} className="grid grid-cols-2 gap-2 rounded-xl bg-canvas/60 p-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_40px] md:bg-transparent md:p-0">
              <VariantInputs />
              <button type="button" onClick={() => setRows(rows.filter((x) => x !== r))} disabled={rows.length === 1}
                      className="grid place-items-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                      aria-label="Quitar variante">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => { setRows([...rows, next]); setNext(next + 1); }}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-pink-strong hover:underline">
          <Plus className="h-4 w-4" /> Agregar talla/color
        </button>
      </section>

      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton>Guardar producto</SubmitButton></div>
    </form>
  );
}
