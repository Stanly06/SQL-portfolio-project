export const PAYMENT_METHOD: Record<string, string> = {
  cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", gateway: "Pago en línea",
};
export const CHANNEL: Record<string, string> = {
  store: "Tienda", online: "Web", whatsapp: "WhatsApp", instagram: "Instagram", tiktok: "TikTok",
};
export const MOVEMENT: Record<string, string> = {
  initial: "Existencia inicial", purchase: "Compra", sale: "Venta", return: "Devolución",
  adjustment: "Ajuste", sale_cancellation: "Anulación de venta", purchase_reversal: "Reverso de compra",
};
export const PURCHASE_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  draft: { label: "Borrador", tone: "neutral" }, ordered: { label: "Pedida", tone: "info" },
  received: { label: "Recibida", tone: "success" }, cancelled: { label: "Cancelada", tone: "danger" },
};
export const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Nuevo", pending_payment: "Pendiente de pago", confirmed: "Confirmado", preparing: "En preparación",
  shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", returned: "Devuelto",
};
export const PRODUCT_STATUS: Record<string, string> = { draft: "Borrador", active: "Activo", archived: "Archivado" };

export function variantLabel(v: { size?: string | null; color?: string | null }) {
  return [v.color, v.size && `T/${v.size}`].filter(Boolean).join(" · ") || "Única";
}

/** Fecha y hora en formato dominicano. */
export function formatDateTime(d: Date | string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(d));
}
export function formatDay(d: Date | string): string {
  return new Intl.DateTimeFormat("es-DO", { timeZone: "America/Santo_Domingo", day: "2-digit", month: "short", year: "numeric" })
    .format(typeof d === "string" && d.length === 10 ? new Date(`${d}T12:00:00Z`) : new Date(d));
}
