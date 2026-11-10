import type { Period } from "./types";

export const PERIOD_PARAM = "periodo";

const FROM_PARAM: Record<string, Period> = { hoy: "day", semana: "week", mes: "month", anio: "year" };
export const TO_PARAM: Record<Period, string> = { day: "hoy", week: "semana", month: "mes", year: "anio" };

export function parsePeriod(value: string | string[] | undefined): Period {
  const v = Array.isArray(value) ? value[0] : value;
  return (v && FROM_PARAM[v]) || "month";
}
