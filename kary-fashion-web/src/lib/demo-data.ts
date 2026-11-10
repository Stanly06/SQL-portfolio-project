/**
 * DATOS DE DEMOSTRACIÓN — NO SON CIFRAS REALES DE KARY FASHION.
 *
 * Se generan de forma determinística (misma semilla = mismos números) para que el
 * prototipo se vea igual en el servidor y en el navegador. En la Fase 2 este archivo
 * se reemplaza por consultas a PostgreSQL detrás de `dashboard-repository.ts`.
 */
import { buildIncomeStatement, changePct } from "./finance.ts";
import type {
  CategorySlice,
  ChartPoint,
  DashboardData,
  Period,
  RecentOrder,
  StockAlert,
  TopProduct,
} from "./types";

/** Fecha de referencia fija de la demo (evita depender del reloj). */
export const DEMO_REFERENCE_DATE = "2026-11-10";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RD = (pesos: number) => Math.round(pesos * 100); // pesos -> centavos

/** Ingreso neto mensual "típico" de la demo: RD$412,000 */
const MONTHLY_NET = RD(412_000);
const MONTHLY_OPEX = RD(78_500);

const PERIODS: Record<Period, { label: string; comparison: string; factor: number; prevFactor: number; points: string[] }> = {
  day: {
    label: "Hoy",
    comparison: "vs. ayer",
    factor: 1 / 26,
    prevFactor: 0.91,
    points: ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm"],
  },
  week: {
    label: "Esta semana",
    comparison: "vs. semana anterior",
    factor: 1 / 4.3,
    prevFactor: 0.94,
    points: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
  },
  month: {
    label: "Noviembre 2026",
    comparison: "vs. mes anterior",
    factor: 1,
    prevFactor: 0.847,
    points: ["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5"],
  },
  year: {
    label: "Año 2026",
    comparison: "vs. 2025",
    factor: 10.6,
    prevFactor: 0.88,
    points: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov"],
  },
};

/** Curva de ventas: crece hacia el final (temporada navideña / fines de semana). */
function buildChart(period: Period, totalNet: number, grossMarginRatio: number): ChartPoint[] {
  const cfg = PERIODS[period];
  const rand = rng(period.length * 97 + 13);
  const weights = cfg.points.map((_, i) => {
    const trend = 1 + (i / cfg.points.length) * 0.9;
    const weekend = period === "week" && i >= 4 ? 1.45 : 1;
    const lunch = period === "day" && (i === 3 || i >= 8) ? 1.35 : 1;
    return trend * weekend * lunch * (0.75 + rand() * 0.5);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return cfg.points.map((label, i) => {
    const sales = Math.round((totalNet * weights[i]) / sum);
    const margin = grossMarginRatio + (rand() - 0.5) * 0.06;
    return { label, sales, profit: Math.round(sales * margin) };
  });
}

const CATEGORIES: CategorySlice[] = [
  { category: "Blusas", units: 312, color: "#F65B9A" },
  { category: "Vestidos", units: 214, color: "#A66BE3" },
  { category: "Jeans", units: 186, color: "#49243E" },
  { category: "Pantalones", units: 142, color: "#F7A8C8" },
  { category: "Calzados", units: 158, color: "#C99A2E" },
  { category: "Perfumes", units: 96, color: "#D6BDF2" },
  { category: "Accesorios", units: 130, color: "#C9C2CE" },
];

const RECENT_ORDERS: RecentOrder[] = [
  { code: "KF-1058", customer: "Laura Gómez", date: "2026-11-10", total: RD(3_890), status: "enviado", channel: "instagram" },
  { code: "KF-1057", customer: "Yokasta Rodríguez", date: "2026-11-10", total: RD(5_250), status: "en_preparacion", channel: "whatsapp" },
  { code: "KF-1056", customer: "Camila Torres", date: "2026-11-09", total: RD(2_190), status: "confirmado", channel: "online" },
  { code: "KF-1055", customer: "Rosanna Peralta", date: "2026-11-09", total: RD(7_480), status: "pendiente_pago", channel: "whatsapp" },
  { code: "KF-1054", customer: "Valentina Díaz", date: "2026-11-08", total: RD(4_350), status: "entregado", channel: "tienda" },
  { code: "KF-1053", customer: "Mildred Almonte", date: "2026-11-08", total: RD(1_650), status: "cancelado", channel: "online" },
];

const STOCK_ALERTS: StockAlert[] = [
  { sku: "VES-0214-RS-M", name: "Vestido satinado midi", size: "M", color: "Rosa", stock: 1, minStock: 3, category: "Vestidos" },
  { sku: "JEA-0088-AZ-8", name: "Jean mom fit", size: "8", color: "Azul claro", stock: 2, minStock: 4, category: "Jeans" },
  { sku: "BLU-0131-BL-S", name: "Blusa off-shoulder", size: "S", color: "Blanco", stock: 0, minStock: 3, category: "Blusas" },
  { sku: "CAL-0045-NE-37", name: "Sandalia de tacón bloque", size: "37", color: "Negro", stock: 2, minStock: 3, category: "Calzados" },
  { sku: "PER-0012-100", name: "Perfume floral 100 ml", size: "100 ml", color: "—", stock: 1, minStock: 2, category: "Perfumes" },
];

const TOP_PRODUCTS: TopProduct[] = [
  { sku: "BLU-0102", name: "Blusa crop de lino", category: "Blusas", units: 46, revenue: RD(59_800) },
  { sku: "JEA-0088", name: "Jean mom fit", category: "Jeans", units: 38, revenue: RD(72_200) },
  { sku: "VES-0214", name: "Vestido satinado midi", category: "Vestidos", units: 29, revenue: RD(63_800) },
  { sku: "CAL-0045", name: "Sandalia de tacón bloque", category: "Calzados", units: 24, revenue: RD(45_600) },
  { sku: "ACC-0071", name: "Cartera bandolera", category: "Accesorios", units: 21, revenue: RD(31_500) },
];

export function buildDemoDashboard(period: Period): DashboardData {
  const cfg = PERIODS[period];
  const net = Math.round(MONTHLY_NET * cfg.factor);
  const grossSales = Math.round(net / 0.94);           // descuentos 4% + devoluciones 2%
  const discounts = Math.round(grossSales * 0.04);
  const returns = grossSales - net - discounts;
  const income = buildIncomeStatement({
    grossSales,
    discounts,
    returns,
    salesTax: Math.round(net * 0.18),
    costOfGoodsSold: Math.round(net * 0.51),
    operatingExpenses: Math.round(MONTHLY_OPEX * cfg.factor),
    financialExpenses: Math.round(RD(1_800) * cfg.factor),
    incomeTax: 0, // se estima al cierre fiscal; no se prorratea en la demo
    inventoryPurchases: Math.round(RD(186_000) * cfg.factor),
  });

  const prevNet = Math.round(net * cfg.prevFactor);
  const prev = buildIncomeStatement({
    grossSales: Math.round(prevNet / 0.94),
    discounts: Math.round((prevNet / 0.94) * 0.04),
    returns: Math.round(prevNet / 0.94) - prevNet - Math.round((prevNet / 0.94) * 0.04),
    salesTax: 0,
    costOfGoodsSold: Math.round(prevNet * 0.53),
    operatingExpenses: Math.round(MONTHLY_OPEX * cfg.factor * 0.97),
    financialExpenses: Math.round(RD(1_800) * cfg.factor),
    incomeTax: 0,
    inventoryPurchases: 0,
  });

  const avgTicket = RD(2_450);
  const orders = Math.max(1, Math.round(net / avgTicket));
  const prevOrders = Math.max(1, Math.round(prevNet / (avgTicket * 1.03)));
  const pending = Math.max(1, Math.round(orders * (period === "year" ? 0.01 : 0.09)));

  const lowStock = 12;
  const outOfStock = 3;

  return {
    isDemo: true,
    period,
    periodLabel: cfg.label,
    comparisonLabel: cfg.comparison,
    kpis: {
      sales: { value: income.netRevenue, changePct: changePct(income.netRevenue, prev.netRevenue) },
      orders: { total: orders, pending, completed: orders - pending, changePct: changePct(orders, prevOrders) },
      stock: { units: 1_238, lowStock, outOfStock, skus: 214 },
      netProfit: {
        value: income.netProfit,
        marginPct: income.netMarginPct,
        changePct: changePct(income.netProfit, prev.netProfit),
      },
    },
    income,
    chart: buildChart(period, income.netRevenue, income.grossProfit / income.netRevenue),
    inventoryByCategory: CATEGORIES,
    recentOrders: RECENT_ORDERS,
    stockAlerts: STOCK_ALERTS,
    topProducts: TOP_PRODUCTS,
    notifications: [
      { id: "n1", title: "Stock bajo", detail: `${lowStock} variantes por debajo del mínimo`, tone: "warning" },
      { id: "n2", title: "Pago pendiente", detail: "Pedido KF-1055 espera confirmación de transferencia", tone: "info" },
      { id: "n3", title: "Agotado", detail: "Blusa off-shoulder · Blanco · S", tone: "danger" },
      { id: "n4", title: "Pedido entregado", detail: "KF-1054 · Valentina Díaz", tone: "success" },
    ],
  };
}
