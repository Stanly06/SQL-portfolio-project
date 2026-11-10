import { Footprints, Gem, Shirt, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Miniatura del producto. Mientras no existan fotografías reales (Fase 3),
 * se muestra un icono de la categoría sobre un fondo de la paleta.
 */
const BY_CATEGORY: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  Blusas: { icon: Shirt, bg: "bg-blush", fg: "text-pink-strong" },
  Vestidos: { icon: Sparkles, bg: "bg-lavender-soft", fg: "text-lavender" },
  Jeans: { icon: Shirt, bg: "bg-[#e6effc]", fg: "text-[#2f6fd1]" },
  Pantalones: { icon: Shirt, bg: "bg-canvas", fg: "text-plum" },
  Calzados: { icon: Footprints, bg: "bg-gold-soft", fg: "text-gold" },
  Perfumes: { icon: Sparkles, bg: "bg-[#f6f0fd]", fg: "text-lavender" },
  Accesorios: { icon: Gem, bg: "bg-blush-soft", fg: "text-pink" },
};

export function ProductThumb({ category, photoUrl, className }: { category: string; photoUrl?: string; className?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className={cn("h-12 w-12 rounded-xl object-cover", className)} />;
  }
  const c = BY_CATEGORY[category] ?? BY_CATEGORY.Accesorios;
  const Icon = c.icon;
  return (
    <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl", c.bg, className)}>
      <Icon className={cn("h-6 w-6", c.fg)} strokeWidth={1.7} />
    </span>
  );
}
