import Link from "next/link";
import { CheckCircle2, Circle, MessageCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { asAnon, isDatabaseConfigured } from "@/lib/server/db";
import { getStoreInfo, waLink } from "@/lib/server/store";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export const metadata = { title: "Tu pedido" };

const STEPS = [
  { key: "pending_payment", label: "Esperando tu transferencia" }, { key: "confirmed", label: "Pago confirmado" },
  { key: "preparing", label: "Preparando tu pedido" }, { key: "shipped", label: "Enviado" }, { key: "delivered", label: "Entregado" },
];
const ORDER = ["new", "pending_payment", "confirmed", "preparing", "shipped", "delivered"];

type Tracked = { number: string; status: string; total_cents: number; shipping_cents: number; paid_cents: number; balance_cents: number;
  created_at: string; shipping_address: string | null; items: { description: string; quantity: number; unit_price_cents: number }[] };

export default async function OrderStatusPage(props: PageProps<"/tienda/pedido/[numero]">) {
  const { numero } = await props.params;
  const sp = await props.searchParams;
  const tel = String(sp.tel ?? "");
  const info = await getStoreInfo();
  const order = isDatabaseConfigured() && tel
    ? await asAnon(async (tx) => (await tx<{ r: Tracked | null }[]>`select public.track_order(${numero}, ${tel}) as r`)[0].r)
    : null;
  if (!order || !info) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">No encontramos ese pedido</h1>
        <p className="mt-2 text-muted">Revisa el número y el teléfono.</p>
        <Link href="/tienda/seguimiento" className="mt-5 inline-block rounded-full bg-pink px-6 py-3 text-sm font-semibold text-white">Buscar de nuevo</Link>
      </div>
    );
  }
  const idx = ORDER.indexOf(order.status);
  const cancelled = order.status === "cancelled" || order.status === "returned";
  const pending = order.status === "pending_payment" || order.status === "new";
  const msg = `Hola Kary Fashion, hice el pedido ${order.number} por ${formatMoney(order.total_cents)}. Te envío el comprobante de la transferencia.`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {sp.nuevo && <div className="mb-6 rounded-3xl bg-success-soft p-5 text-success">
        <p className="text-lg font-semibold">¡Gracias! Recibimos tu pedido {order.number}.</p>
        <p className="text-sm">Guarda este número para ver cómo va. Para confirmarlo, haz la transferencia y envíanos el comprobante por WhatsApp.</p>
      </div>}
      <h1 className="text-3xl font-bold">Pedido {order.number}</h1>
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {pending && (
            <section className="rounded-3xl border-2 border-pink/40 bg-white p-6 shadow-[var(--shadow-card)]">
              <h2 className="text-lg font-semibold">Paga por transferencia</h2>
              <p className="mt-1 text-sm text-muted">Monto a transferir: <b className="tabular text-xl text-pink-strong">{formatMoney(order.balance_cents)}</b></p>
              {info.account_number ? (
                <dl className="mt-4 space-y-1.5 text-sm">
                  {info.bank_name && <div className="flex justify-between gap-3"><dt className="text-muted">Banco</dt><dd className="font-medium">{info.bank_name}</dd></div>}
                  {info.account_type && <div className="flex justify-between gap-3"><dt className="text-muted">Tipo de cuenta</dt><dd className="font-medium">{info.account_type}</dd></div>}
                  <div className="flex items-center justify-between gap-3"><dt className="text-muted">Cuenta</dt>
                    <dd className="flex items-center gap-2 font-mono font-semibold">{info.account_number}<CopyButton text={info.account_number} /></dd></div>
                  {info.account_holder && <div className="flex justify-between gap-3"><dt className="text-muted">A nombre de</dt><dd className="font-medium">{info.account_holder}</dd></div>}
                </dl>
              ) : <p className="mt-3 rounded-xl bg-lavender-soft px-3 py-2 text-sm text-plum">Te enviamos los datos de la cuenta por WhatsApp.</p>}
              {info.whatsapp && <a href={waLink(info.whatsapp, msg)} target="_blank" rel="noreferrer"
                                   className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-success px-6 py-3 font-semibold text-white hover:opacity-90">
                <MessageCircle className="h-5 w-5" /> Enviar comprobante por WhatsApp</a>}
            </section>
          )}
          <section className="rounded-3xl bg-white p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-lg font-semibold">Estado</h2>
            {cancelled ? <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Este pedido fue cancelado. Escríbenos si tienes dudas.</p> : (
              <ol className="mt-4 space-y-3">{STEPS.map((s) => {
                const done = ORDER.indexOf(s.key) <= idx;
                return (
                  <li key={s.key} className={cn("flex items-center gap-3 text-sm", done ? "text-ink" : "text-muted")}>
                    {done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-blush" />}
                    <span className={cn(ORDER.indexOf(s.key) === idx && "font-semibold text-pink-strong")}>{s.label}</span>
                  </li>);
              })}</ol>
            )}
          </section>
        </div>
        <aside className="h-fit rounded-3xl bg-white p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-semibold">Tu compra</h2>
          <ul className="mt-3 space-y-2 text-sm">{order.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-3"><span>{i.quantity} × {i.description}</span><span className="tabular">{formatMoney(i.quantity * i.unit_price_cents)}</span></li>))}</ul>
          <dl className="mt-3 space-y-1 border-t border-blush pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Envío</dt><dd className="tabular">{formatMoney(order.shipping_cents)}</dd></div>
            <div className="flex justify-between font-bold text-plum"><dt>Total</dt><dd className="tabular">{formatMoney(order.total_cents)}</dd></div>
            <div className="flex justify-between text-success"><dt>Pagado</dt><dd className="tabular">{formatMoney(order.paid_cents)}</dd></div>
          </dl>
          {order.shipping_address && <p className="mt-3 text-xs text-muted">Entrega: {order.shipping_address}</p>}
        </aside>
      </div>
    </div>
  );
}
