/**
 * Tipos de dominio del dashboard. Todos los montos están en CENTAVOS de peso
 * dominicano (RD$) como enteros, para evitar errores de redondeo.
 * Estas interfaces son el contrato que la base de datos real (Fase 2) deberá cumplir.
 */

export type Period = "day" | "week" | "month" | "year";

export type OrderStatus =
  | "nuevo"
  | "pendiente_pago"
  | "confirmado"
  | "en_preparacion"
  | "enviado"
  | "entregado"
  | "cancelado"
  | "devuelto";

export interface Trend {
  /** Variación porcentual vs. el período anterior (null si no hay base de comparación). */
  changePct: number | null;
}

/** Partidas del estado de resultados de un período. */
export interface IncomeStatementInput {
  grossSales: number;        // ventas brutas SIN ITBIS
  discounts: number;
  returns: number;           // devoluciones
  salesTax: number;          // ITBIS cobrado: no es ingreso, se informa aparte
  costOfGoodsSold: number;   // costo de la mercancía vendida (CMV)
  operatingExpenses: number;
  financialExpenses: number;
  incomeTax: number;         // impuesto sobre la renta (si aplica)
  inventoryPurchases: number;// compras de mercancía: NO es gasto del período
}

export interface IncomeStatement extends IncomeStatementInput {
  netRevenue: number;
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
  grossMarginPct: number;
  operatingMarginPct: number;
  netMarginPct: number;
}

export interface ChartPoint {
  label: string;
  sales: number;   // ingresos netos
  profit: number;  // ganancia bruta
}

export interface CategorySlice {
  category: string;
  units: number;
  color: string;
}

export interface RecentOrder {
  code: string;
  customer: string;
  date: string; // ISO yyyy-mm-dd
  total: number;
  status: OrderStatus;
  channel: "online" | "tienda" | "whatsapp" | "instagram";
}

export interface StockAlert {
  sku: string;
  name: string;
  size: string;
  color: string;
  stock: number;
  minStock: number;
  category: string;
}

export interface TopProduct {
  sku: string;
  name: string;
  category: string;
  units: number;
  revenue: number;
}

export interface DashboardData {
  isDemo: boolean;
  period: Period;
  periodLabel: string;
  comparisonLabel: string;
  kpis: {
    sales: { value: number } & Trend;
    orders: { total: number; pending: number; completed: number } & Trend;
    stock: { units: number; lowStock: number; outOfStock: number; skus: number };
    netProfit: { value: number; marginPct: number } & Trend;
  };
  income: IncomeStatement;
  chart: ChartPoint[];
  inventoryByCategory: CategorySlice[];
  recentOrders: RecentOrder[];
  stockAlerts: StockAlert[];
  topProducts: TopProduct[];
  notifications: { id: string; title: string; detail: string; tone: "info" | "warning" | "danger" | "success" }[];
}
