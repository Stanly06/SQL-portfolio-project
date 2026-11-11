"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Minus, Plus, ScanLine, Search, ShoppingBag, Trash2, User } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { registerSale } from "./actions";

export interface PosVariant { id: number; sku: string; name: string; size: string | null; color: string | null; price_cents: number; stock: number; category: string }
export interface PosCustomer { id: number; full_name: string; phone: string | null }

const toCents = (s: string) => Math.round((Number(String(s).replace(/,/g, "")) || 0) * 100);
const label = (v: PosVariant) => [v.color, v.size && `T/${v.size}`].filter(Boolean).join(" · ") || "Única";

export function Pos({ variants, customers, fiscalKinds, maxDiscountPct, isAdmin, initialCustomer }: {
  variants: PosVariant[]; customers: PosCustomer[]; fiscalKinds: { kind: string; description: string }[];
  maxDiscountPct: number; isAdmin: boolean; initialCustomer?: number;
}) {
  const [state, action] = useActionState(registerSale, null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<{ v: PosVariant; qty: number; discount: string }[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(initialCustomer ?? null);
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [cash, setCash] = useState("");
  const [transfer, setTransfer] = useState({ amount: "", reference: "" });
  const [card, setCard] = useState({ amount: "", reference: "" });
  const [channel, setChannel] = useState("store");
  const [kind, setKind] = useState("commercial");
  const [notes, setNotes] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return variants.filter((v) => `${v.name} ${v.sku} ${v.color ?? ""} ${v.size ?? ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query, variants]);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const customerResults = customerQuery.trim()
    ? customers.filter((c) => `${c.full_name} ${c.phone ?? ""}`.toLowerCase().includes(customerQuery.toLowerCase())).slice(0, 6)
    : [];

  function add(v: PosVariant) {
    setCart((c) => {
      const found = c.find((x) => x.v.id === v.id);
      if (found) return c.map((x) => (x.v.id === v.id ? { ...x, qty: Math.min(x.qty + 1, v.stock) } : x));
      return [...c, { v, qty: 1, discount: "" }];
    });
    setQuery("");
    searchRef.current?.focus();
  }

  const subtotal = cart.reduce((a, x) => a + x.qty * x.v.price_cents, 0);
  const lineDiscounts = cart.reduce((a, x) => a + toCents(x.discount), 0);
  const total = Math.max(subtotal - lineDiscounts - toCents(discount) + toCents(shipping), 0);
  const other = toCents(transfer.amount) + toCents(card.amount);
  const cashDue = Math.max(total - other, 0);
  const cashReceived = cash.trim() ? toCents(cash) : cashDue;
  const change = cashDue > 0 ? cashReceived - cashDue : 0;
  const discountPct = subtotal ? ((lineDiscounts + toCents(discount)) / subtotal) * 100 : 0;
  const problems: string[] = [];
  if (other > total) problems.push("Transferencia/tarjeta superan el total.");
  if (cashDue > 0 && cashReceived < cashDue) problems.push(`Faltan ${formatMoney(cashDue - cashReceived)} en efectivo.`);
  if (!isAdmin && discountPct > maxDiscountPct) problems.push(`El descuento máximo para empleadas es ${maxDiscountPct}%.`);
  if (kind === "B01" || kind === "E31") { if (!customer) problems.push("El crédito fiscal requiere seleccionar un cliente con RNC."); }

  const payload = JSON.stringify({
    customer_id: customerId, channel, invoice_kind: kind, notes, discount, shipping, cash_received: cash, transfer, card,
    items: cart.map((x) => ({ variant_id: x.v.id, quantity: x.qty, discount: x.discount })),
  });

  return (
    <form action={action} className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <input type="hidden" name="payload" value={payload} />
      {/* Izquierda: búsqueda y carrito */}
      <div className="space-y-4">
        <div className="relative">
          <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-sm focus-within:border-pink/50 focus-within:ring-4 focus-within:ring-pink/10">
            <Search className="h-5 w-5 text-muted" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
                   onKeyDown={(e) => {
                     if (e.key === "Enter") {
                       e.preventDefault();
                       const exact = variants.find((v) => v.sku.toLowerCase() === query.trim().toLowerCase());
                       if (exact) add(exact); else if (results[0]) add(results[0]);
                     }
                   }}
                   placeholder="Buscar producto o escanear código…" aria-label="Buscar producto"
                   className="w-full bg-transparent text-[15px] outline-none" />
            <ScanLine className="h-5 w-5 text-muted" />
          </label>
          {results.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]">
              {results.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => add(v)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-blush-soft">
                    <span><span className="block text-sm font-medium">{v.name}</span>
                      <span className="text-xs text-muted">{label(v)} · {v.sku} · {v.stock} disponibles</span></span>
                    <span className="tabular text-sm font-semibold">{formatMoney(v.price_cents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
          {cart.length === 0 ? (
            <div className="grid place-items-center gap-2 px-6 py-16 text-center text-muted">
              <ShoppingBag className="h-10 w-10 text-blush" />
              <p className="text-sm">Busque un producto o escanee su código para empezar.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {cart.map((x) => (
                <li key={x.v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium">{x.v.name}</p>
                    <p className="text-xs text-muted">{label(x.v)} · {formatMoney(x.v.price_cents)} c/u</p>
                  </div>
                  <div className="flex items-center rounded-xl border border-line">
                    <button type="button" aria-label="Menos" onClick={() => setCart(cart.map((y) => y.v.id === x.v.id ? { ...y, qty: Math.max(1, y.qty - 1) } : y))}
                            className="p-2 text-plum hover:text-pink"><Minus className="h-4 w-4" /></button>
                    <span className="tabular w-8 text-center text-sm font-semibold">{x.qty}</span>
                    <button type="button" aria-label="Más" disabled={x.qty >= x.v.stock}
                            onClick={() => setCart(cart.map((y) => y.v.id === x.v.id ? { ...y, qty: y.qty + 1 } : y))}
                            className="p-2 text-plum hover:text-pink disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                  </div>
                  <input value={x.discount} onChange={(e) => setCart(cart.map((y) => y.v.id === x.v.id ? { ...y, discount: e.target.value } : y))}
                         inputMode="decimal" placeholder="Desc." aria-label="Descuento de la línea" className="input w-24 py-1.5" />
                  <span className="tabular w-28 text-right text-sm font-semibold">{formatMoney(x.qty * x.v.price_cents - toCents(x.discount))}</span>
                  <button type="button" aria-label="Quitar" onClick={() => setCart(cart.filter((y) => y.v.id !== x.v.id))}
                          className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Derecha: cliente, pago y total */}
      <aside className="space-y-4">
        <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
          <p className="label flex items-center gap-1.5"><User className="h-4 w-4" /> Cliente</p>
          {customer ? (
            <div className="flex items-center justify-between rounded-xl bg-blush-soft px-3 py-2 text-sm">
              <span><b>{customer.full_name}</b> <span className="text-muted">{customer.phone}</span></span>
              <button type="button" onClick={() => setCustomerId(null)} className="text-xs text-pink-strong hover:underline">Cambiar</button>
            </div>
          ) : (
            <div className="relative">
              <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Cliente general (opcional): buscar…" className="input" />
              {customerResults.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-pop)]">
                  {customerResults.map((c) => (
                    <li key={c.id}><button type="button" onClick={() => { setCustomerId(c.id); setCustomerQuery(""); }}
                                           className="w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-blush-soft">
                      {c.full_name} <span className="text-xs text-muted">{c.phone}</span></button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal" className="input">
              <option value="store">En tienda</option><option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="online">Web</option>
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Comprobante" className="input">
              <option value="commercial">Factura comercial</option>
              {fiscalKinds.map((f) => <option key={f.kind} value={f.kind}>{f.kind} · {f.description}</option>)}
            </select>
          </div>
        </section>

        <section className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">Descuento general
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0.00" className="input mt-1" /></label>
            <label className="text-xs text-muted">Envío
              <input value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="decimal" placeholder="0.00" className="input mt-1" /></label>
          </div>
          <p className="text-sm font-semibold text-plum">Pago</p>
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <label className="text-xs text-muted">Transferencia
              <input value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} inputMode="decimal" placeholder="0.00" className="input mt-1" /></label>
            <label className="text-xs text-muted">Referencia
              <input value={transfer.reference} onChange={(e) => setTransfer({ ...transfer, reference: e.target.value })} className="input mt-1" /></label>
            <label className="text-xs text-muted">Tarjeta
              <input value={card.amount} onChange={(e) => setCard({ ...card, amount: e.target.value })} inputMode="decimal" placeholder="0.00" className="input mt-1" /></label>
            <label className="text-xs text-muted">Aprobación
              <input value={card.reference} onChange={(e) => setCard({ ...card, reference: e.target.value })} className="input mt-1" /></label>
          </div>
          <label className="block text-xs text-muted">Efectivo recibido {cashDue > 0 && <>(a cobrar {formatMoney(cashDue)})</>}
            <input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" placeholder={(cashDue / 100).toFixed(2)} className="input mt-1 text-base" /></label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nota (opcional)" className="input" />
        </section>

        <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-plum to-night p-5 text-white shadow-[var(--shadow-pop)]">
          <dl className="space-y-1 text-sm text-white/75">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular">{formatMoney(subtotal)}</dd></div>
            {(lineDiscounts + toCents(discount)) > 0 && <div className="flex justify-between"><dt>Descuentos ({discountPct.toFixed(1)}%)</dt><dd className="tabular">-{formatMoney(lineDiscounts + toCents(discount))}</dd></div>}
            {toCents(shipping) > 0 && <div className="flex justify-between"><dt>Envío</dt><dd className="tabular">{formatMoney(toCents(shipping))}</dd></div>}
          </dl>
          <div className="mt-2 flex items-end justify-between border-t border-white/15 pt-2">
            <span className="font-[family-name:var(--font-display)] text-lg">Total</span>
            <span className="tabular text-3xl font-bold">{formatMoney(total)}</span>
          </div>
          {change > 0 && <p className="mt-1 text-right text-sm text-blush">Cambio: <b className="tabular">{formatMoney(change)}</b></p>}
          {problems.length > 0 && <ul className="mt-3 space-y-1 text-xs text-warning">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
          <div className="mt-4"><FormMessage state={state} /></div>
          <SubmitButton pendingText="Registrando…" className={cn("mt-3 w-full py-3 text-base", (cart.length === 0 || problems.length > 0) && "pointer-events-none opacity-50")}>
            Cobrar {formatMoney(total)}
          </SubmitButton>
        </section>
      </aside>
    </form>
  );
}
