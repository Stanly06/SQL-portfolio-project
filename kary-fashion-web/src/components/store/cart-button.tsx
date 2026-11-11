"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart";

export function CartButton() {
  const { count } = useCart();
  return (
    <Link href="/tienda/carrito" className="relative inline-flex items-center gap-2 rounded-full bg-plum px-4 py-2 text-sm font-semibold text-white hover:bg-plum-soft"
          aria-label={`Carrito, ${count} artículos`}>
      <ShoppingBag className="h-4 w-4" /> <span className="hidden sm:inline">Carrito</span>
      {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-pink px-1 text-[11px]">{count}</span>}
    </Link>
  );
}
