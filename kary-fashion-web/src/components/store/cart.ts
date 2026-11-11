"use client";

import { useSyncExternalStore } from "react";

/** Carrito de la tienda online: vive en el navegador de la clienta (localStorage). */
export interface CartItem {
  variantId: number; productId: number; name: string; variantLabel: string; price: number; image: string | null; qty: number;
}

const KEY = "kary:carrito";
const EVENT = "kary:carrito";
const EMPTY: CartItem[] = [];
let cache: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY };

function read(): CartItem[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return EMPTY; }
  if (raw === cache.raw) return cache.items;
  let items: CartItem[] = EMPTY;
  try { items = raw ? (JSON.parse(raw) as CartItem[]).filter((i) => i && i.variantId && i.qty > 0) : EMPTY; } catch { items = EMPTY; }
  cache = { raw, items };
  return items;
}

function write(items: CartItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    items,
    count: items.reduce((a, i) => a + i.qty, 0),
    subtotal: items.reduce((a, i) => a + i.qty * i.price, 0),
    add(item: Omit<CartItem, "qty">, qty = 1) {
      const cur = read();
      const found = cur.find((i) => i.variantId === item.variantId);
      write(found ? cur.map((i) => (i.variantId === item.variantId ? { ...i, qty: Math.min(10, i.qty + qty) } : i))
                  : [...cur, { ...item, qty: Math.min(10, qty) }]);
    },
    setQty(variantId: number, qty: number) {
      write(read().map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(1, Math.min(10, qty)) } : i)));
    },
    remove(variantId: number) { write(read().filter((i) => i.variantId !== variantId)); },
    clear() { write([]); },
  };
}
