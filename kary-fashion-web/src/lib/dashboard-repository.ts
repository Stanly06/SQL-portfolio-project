import { buildDemoDashboard } from "./demo-data";
import type { DashboardData, Period } from "./types";

/**
 * Punto único de acceso a los datos del dashboard.
 * Hoy devuelve datos de demostración; en la Fase 2 se sustituye el cuerpo por
 * consultas a PostgreSQL sin tocar los componentes visuales.
 */
export async function getDashboardData(period: Period): Promise<DashboardData> {
  "use cache";
  return buildDemoDashboard(period);
}
