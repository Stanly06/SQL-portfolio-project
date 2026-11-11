"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { addVariant, archiveProduct, updateProduct, updateVariant } from "../actions";
import { ProductFields, VariantInputs, type Option, type ProductValues } from "../product-form";

export function VariantRowForm({ v }: { v: { id: number; price_cents: number; min_stock: number; active: boolean } }) {
  const [state, action] = useActionState(updateVariant, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={v.id} />
      <input name="price" defaultValue={(v.price_cents / 100).toFixed(2)} inputMode="decimal" aria-label="Precio"
             className="input w-28 py-1.5" />
      <input name="min_stock" defaultValue={v.min_stock} inputMode="numeric" aria-label="Existencia mínima" className="input w-16 py-1.5" />
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="checkbox" name="active" defaultChecked={v.active} className="accent-pink" /> activa
      </label>
      <SubmitButton variant="outline" pendingText="…" className="px-3 py-1.5 text-xs">Guardar</SubmitButton>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.message && <span className="text-xs text-success">✓</span>}
    </form>
  );
}

export function AddVariantForm({ productId }: { productId: number }) {
  const [state, action] = useActionState(addVariant, null);
  return (
    <form action={action} className="mt-6 rounded-2xl bg-cream p-4">
      <p className="mb-2 text-sm font-semibold text-plum">Agregar talla o color</p>
      <input type="hidden" name="product_id" value={productId} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
        <VariantInputs showSku />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <SubmitButton variant="outline">Agregar variante</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function EditProductForm({ p, categories, suppliers }: { p: ProductValues; categories: Option[]; suppliers: Option[] }) {
  const [state, action] = useActionState(updateProduct, null);
  return (
    <>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={p.id} />
        <ProductFields p={p} categories={categories} suppliers={suppliers} />
        <FormMessage state={state} />
        <div className="flex justify-end"><SubmitButton>Guardar cambios</SubmitButton></div>
      </form>
      <form action={archiveProduct} className="mt-6 border-t border-line pt-4">
        <input type="hidden" name="id" value={p.id} />
        <p className="mb-2 text-xs text-muted">Archivar oculta el producto del catálogo. Su historial de ventas e inventario se conserva.</p>
        <SubmitButton variant="outline" confirm="¿Archivar este producto?">Archivar producto</SubmitButton>
      </form>
    </>
  );
}
