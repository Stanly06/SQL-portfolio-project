"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Store, Truck } from "lucide-react";
import { Field, SubmitButton } from "@/components/ui/form";
import { useCart } from "@/components/store/cart";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { placeOrder, type CheckoutResult } from "./actions";

export function CheckoutForm({ deliveryFee, pickupAddress, open }: { deliveryFee: number; pickupAddress: string | null; open: boolean }) {
  const cart = useCart();
  const router = useRouter();
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("delivery");
  const [phone, setPhone] = useState("");
  const [state, action] = useActionState<CheckoutResult, FormData>(placeOrder, null);
  const done = useRef(false);

  useEffect(() => {
    if (state?.ok && state.number && !done.current) {
      done.current = true;
      cart.clear();
      router.push(`/tienda/pedido/${state.number}?tel=${encodeURIComponent(phone.replace(/\D/g, ""))}&nuevo=1`);
    }
  }, [state, cart, router, phone]);

  if (cart.items.length === 0 && !state?.ok) {
    return <p className="mt-6 text-muted">Tu carrito está vacío. <Link href="/tienda/catalogo" className="text-pink-strong underline">Ver catálogo</Link></p>;
  }
  const shipping = delivery === "delivery" ? deliveryFee : 0;

  return (
    <form action={action} className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
      <input type="hidden" name="items" value={JSON.stringify(cart.items.map((i) => ({ variantId: i.variantId, qty: i.qty })))} />
      <input type="hidden" name="delivery" value={delivery} />
      {/* campo trampa para robots: las personas no lo ven */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-px w-px" />
      <div className="space-y-5 rounded-3xl bg-white p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Tus datos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo" className="sm:col-span-2"><input name="full_name" required autoComplete="name" className="input" /></Field>
          <Field label="Teléfono / WhatsApp" hint="Te escribiremos aquí para confirmar.">
            <input name="phone" required type="tel" autoComplete="tel" placeholder="809-000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" /></Field>
          <Field label="Correo (opcional)"><input name="email" type="email" autoComplete="email" className="input" /></Field>
        </div>
        <h2 className="pt-2 text-lg font-semibold">Entrega</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["delivery", Truck, "Envío a domicilio", deliveryFee ? formatMoney(deliveryFee) : "Costo a confirmar"],
             ["pickup", Store, "Retiro en la tienda", pickupAddress ?? "Gratis"]] as const).map(([k, Icon, t, d]) => (
            <button type="button" key={k} onClick={() => setDelivery(k)}
                    className={cn("flex items-start gap-3 rounded-2xl border-2 p-4 text-left", delivery === k ? "border-pink bg-blush-soft" : "border-blush")}>
              <Icon className="mt-0.5 h-5 w-5 text-pink-strong" /><span><b className="block text-sm">{t}</b><span className="text-xs text-muted">{d}</span></span>
            </button>))}
        </div>
        {delivery === "delivery" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dirección" className="sm:col-span-2"><input name="address" required autoComplete="street-address" className="input" /></Field>
            <Field label="Provincia"><input name="province" className="input" placeholder="Valverde" /></Field>
            <Field label="Municipio / sector"><input name="municipality" className="input" placeholder="Mao" /></Field>
          </div>
        )}
        <Field label="Nota (opcional)"><textarea name="notes" rows={2} className="input" placeholder="Referencias, horario para recibir…" /></Field>
      </div>
      <aside className="h-fit space-y-4 rounded-3xl bg-white p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Resumen</h2>
        <ul className="space-y-2 text-sm">{cart.items.map((i) => (
          <li key={i.variantId} className="flex justify-between gap-3"><span>{i.qty} × {i.name}<span className="block text-xs text-muted">{i.variantLabel}</span></span>
            <span className="tabular">{formatMoney(i.qty * i.price)}</span></li>))}</ul>
        <dl className="space-y-1 border-t border-blush pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular">{formatMoney(cart.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Envío</dt><dd className="tabular">{formatMoney(shipping)}</dd></div>
          <div className="flex justify-between text-lg font-bold text-plum"><dt>Total</dt><dd className="tabular">{formatMoney(cart.subtotal + shipping)}</dd></div>
        </dl>
        <p className="rounded-xl bg-lavender-soft px-3 py-2 text-xs text-plum">Pagas por transferencia. Al enviar el pedido te mostramos la cuenta y lo confirmamos por WhatsApp.</p>
        {state?.error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
        <SubmitButton pendingText="Enviando pedido…" className={cn("w-full rounded-full py-3.5 text-base", !open && "pointer-events-none opacity-50")}>Enviar pedido</SubmitButton>
      </aside>
    </form>
  );
}
