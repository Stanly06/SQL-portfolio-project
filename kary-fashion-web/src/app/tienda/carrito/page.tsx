"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/components/store/cart";
import { formatMoney } from "@/lib/format";

export default function CartPage() {
  const cart = useCart();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">Tu carrito</h1>
      {cart.items.length === 0 ? (
        <div className="mt-10 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-blush" />
          <p className="mt-3 text-muted">Tu carrito está vacío.</p>
          <Link href="/tienda/catalogo" className="mt-4 inline-block rounded-full bg-pink px-6 py-3 text-sm font-semibold text-white">Ver catálogo</Link>
        </div>
      ) : (
        <>
          <ul className="mt-6 divide-y divide-blush rounded-3xl bg-white p-2 shadow-[var(--shadow-card)]">
            {cart.items.map((i) => (
              <li key={i.variantId} className="flex items-center gap-4 p-3">
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-blush-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/tienda/producto/${i.productId}`} className="font-medium text-ink hover:text-pink-strong">{i.name}</Link>
                  <p className="text-xs text-muted">{i.variantLabel}</p>
                  <p className="tabular text-sm text-pink-strong">{formatMoney(i.price)}</p>
                </div>
                <div className="flex items-center rounded-full border border-blush">
                  <button onClick={() => cart.setQty(i.variantId, i.qty - 1)} className="p-2" aria-label="Menos"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="tabular w-6 text-center text-sm font-semibold">{i.qty}</span>
                  <button onClick={() => cart.setQty(i.variantId, i.qty + 1)} className="p-2" aria-label="Más"><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <button onClick={() => cart.remove(i.variantId)} className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
            <p><span className="text-muted">Subtotal</span> <b className="tabular ml-2 text-xl text-plum">{formatMoney(cart.subtotal)}</b>
              <span className="block text-xs text-muted">El envío se calcula en el siguiente paso.</span></p>
            <Link href="/tienda/checkout" className="rounded-full bg-pink px-8 py-3 font-semibold text-white shadow-lg shadow-pink/30 hover:bg-pink-strong">Hacer pedido</Link>
          </div>
        </>
      )}
    </div>
  );
}
