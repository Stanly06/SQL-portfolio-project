import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/types";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  nuevo: { label: "Nuevo", tone: "pink" },
  pendiente_pago: { label: "Pendiente de pago", tone: "warning" },
  confirmado: { label: "Confirmado", tone: "info" },
  en_preparacion: { label: "En preparación", tone: "gold" },
  enviado: { label: "Enviado", tone: "lavender" },
  entregado: { label: "Entregado", tone: "success" },
  cancelado: { label: "Cancelado", tone: "danger" },
  devuelto: { label: "Devuelto", tone: "neutral" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
