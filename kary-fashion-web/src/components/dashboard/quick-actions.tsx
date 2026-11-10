import Link from "next/link";
import { ChevronRight, FilePlus2, PackagePlus, Plus, ShoppingCart, UserPlus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";

const ACTIONS = [
  { label: "Registrar compra", href: "/compras", icon: ShoppingCart },
  { label: "Agregar producto", href: "/productos", icon: PackagePlus },
  { label: "Registrar cliente", href: "/clientes", icon: UserPlus },
  { label: "Crear factura", href: "/facturacion", icon: FilePlus2 },
];

export function QuickActions() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader title="Acciones rápidas" />
      <div className="flex flex-1 flex-col gap-2.5 p-5 pt-4">
        <Link
          href="/ventas"
          className="group flex items-center gap-3 rounded-xl bg-gradient-to-r from-pink to-[#f77fb0] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-pink/25 transition-transform hover:-translate-y-0.5"
        >
          <Plus className="h-5 w-5" /> Registrar venta
          <ChevronRight className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
        {ACTIONS.map(({ label, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="group flex items-center gap-3 rounded-xl bg-blush-soft/70 px-4 py-3 text-sm font-medium text-plum transition-colors hover:bg-blush"
          >
            <Icon className="h-5 w-5 text-plum/80" strokeWidth={1.8} /> {label}
            <ChevronRight className="ml-auto h-4 w-4 text-pink opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
