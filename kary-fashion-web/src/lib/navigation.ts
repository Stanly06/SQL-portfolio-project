import {
  Banknote,
  Boxes,
  ChartColumn,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Fase del plan de desarrollo en la que se construye el módulo. */
  phase: number;
  description: string;
  badgeKey?: "orders" | "stock";
  /** Solo dueña y administradoras (costos, proveedores, finanzas). */
  adminOnly?: boolean;
  children?: NavChild[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: LayoutDashboard, phase: 1, description: "Resumen general de la tienda." },
  { label: "Pedidos", href: "/pedidos", icon: ShoppingBag, phase: 3, badgeKey: "orders",
    description: "Tablero de pedidos por estado: nuevo, pago pendiente, preparación, enviado y entregado." },
  { label: "Ventas", href: "/ventas", icon: Receipt, phase: 3,
    description: "Registro de ventas en tienda y online, pagos combinados, devoluciones y reembolsos." },
  { label: "Caja", href: "/caja", icon: Banknote, phase: 4,
    description: "Dinero recibido en el día por método de pago y cierre de caja." },
  { label: "Productos", href: "/productos", icon: Package, phase: 3,
    description: "Catálogo con variantes de talla y color, cada una con su SKU, foto, costo y precio." },
  { label: "Inventario", href: "/inventario", icon: Boxes, phase: 3, badgeKey: "stock",
    description: "Entradas, salidas, ajustes, historial de movimientos y costo promedio.",
    children: [
      { label: "Existencias", href: "/inventario" },
      { label: "Movimientos", href: "/inventario/movimientos" },
    ] },
  { label: "Compras", adminOnly: true, href: "/compras", icon: ShoppingCart, phase: 3,
    description: "Órdenes de compra, recepción de mercancía y prorrateo de transporte." },
  { label: "Clientes", href: "/clientes", icon: Users, phase: 3,
    description: "CRM: historial de compras, total gastado y clientes recurrentes." },
  { label: "Proveedores", adminOnly: true, href: "/proveedores", icon: Truck, phase: 3,
    description: "Datos de contacto e historial de compras por proveedor." },
  { label: "Facturación", href: "/facturacion", icon: FileText, phase: 4,
    description: "Facturas en PDF y comprobantes fiscales (NCF / e-CF) de la DGII." },
  { label: "Gastos", adminOnly: true, href: "/gastos", icon: Wallet, phase: 4,
    description: "Gastos operativos por categoría con comprobante opcional." },
  { label: "Ganancias", adminOnly: true, href: "/ganancias", icon: TrendingUp, phase: 4,
    description: "Estado de resultados: ganancia bruta, operativa y neta, márgenes." },
  { label: "Reportes", adminOnly: true, href: "/reportes", icon: ChartColumn, phase: 4,
    description: "Análisis por período, producto, categoría y cliente. Exportación a Excel, CSV y PDF." },
  { label: "Tienda Online", adminOnly: true, href: "/tienda-online", icon: Store, phase: 5,
    description: "Productos publicados, fotos mejoradas y pedidos de la web." },
  { label: "Configuración", adminOnly: true, href: "/configuracion", icon: Settings, phase: 3,
    description: "Datos del negocio, reglas de venta, impuestos y usuarios." },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === "/") return NAV_ITEMS[0];
  return NAV_ITEMS.filter((i) => i.href !== "/").find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );
}
