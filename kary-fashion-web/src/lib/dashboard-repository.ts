import { buildDemoDashboard } from "./demo-data";
import type { DashboardData, Period } from "./types";

/**
 * Punto único de acceso a los datos del dashboard.
 * Hoy devuelve datos de demostración; en la Fase 3 se sustituye el cuerpo por
 * las funciones SQL de supabase/ (income_statement, sales_series...) sin tocar los componentes.
 */
export async function getDashboardData(period: Period): Promise<DashboardData> {
  return buildDemoDashboard(period);
}
