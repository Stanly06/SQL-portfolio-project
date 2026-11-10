"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoney, formatMoneyCompact } from "@/lib/format";
import { TO_PARAM } from "@/lib/period";
import type { ChartPoint, Period } from "@/lib/types";
import { cn } from "@/lib/utils";

const PINK = "#F65B9A";
const LAVENDER = "#A66BE3";

const TABS: { period: Period; label: string }[] = [
  { period: "day", label: "Día" },
  { period: "week", label: "Semana" },
  { period: "month", label: "Mes" },
  { period: "year", label: "Año" },
];

export function SalesChart({ data, period }: { data: ChartPoint[]; period: Period }) {
  const totalSales = data.reduce((a, p) => a + p.sales, 0);
  const totalProfit = data.reduce((a, p) => a + p.profit, 0);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title="Ventas y ganancias"
        action={
          <div role="tablist" aria-label="Agrupación del gráfico" className="flex rounded-xl bg-canvas p-1 text-xs font-medium">
            {TABS.map((t) => (
              <Link
                key={t.period}
                href={`/?periodo=${TO_PARAM[t.period]}`}
                scroll={false}
                role="tab"
                aria-selected={t.period === period}
                className={cn(
                  "rounded-lg px-2.5 py-1 transition-colors",
                  t.period === period ? "bg-white text-pink-strong shadow-sm" : "text-muted hover:text-plum",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 pt-3 text-sm">
        <Legend color={PINK} label="Ventas" value={formatMoney(totalSales)} />
        <Legend color={LAVENDER} label="Ganancia bruta" value={formatMoney(totalProfit)} />
      </div>
      <div className="h-[270px] w-full shrink-0 px-2 pb-3 pt-2 sm:flex-1 sm:min-h-[270px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PINK} stopOpacity={0.28} />
                <stop offset="100%" stopColor={PINK} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gGanancia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LAVENDER} stopOpacity={0.25} />
                <stop offset="100%" stopColor={LAVENDER} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ECE8EF" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#7A6F80", fontSize: 12 }} dy={6} />
            <YAxis
              tickFormatter={formatMoneyCompact}
              tickLine={false}
              axisLine={false}
              width={68}
              tick={{ fill: "#7A6F80", fontSize: 12 }}
            />
            <Tooltip content={ChartTooltip} cursor={{ stroke: "#FADCE8", strokeWidth: 2 }} />
            <Area type="monotone" dataKey="sales" name="Ventas" stroke={PINK} strokeWidth={2.5} fill="url(#gVentas)"
                  dot={{ r: 3.5, fill: PINK, strokeWidth: 0 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
            <Area type="monotone" dataKey="profit" name="Ganancia" stroke={LAVENDER} strokeWidth={2.5} fill="url(#gGanancia)"
                  dot={{ r: 3.5, fill: LAVENDER, strokeWidth: 0 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2 text-muted">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
      <b className="tabular font-semibold text-ink">{value}</b>
    </span>
  );
}

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="mb-1 font-semibold text-plum">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b className="tabular text-ink">{formatMoney(Number(p.value))}</b>
        </p>
      ))}
    </div>
  );
}
