"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatMoneyCompact } from "@/lib/format";

export function MonthlyChart({ data }: { data: { label: string; revenue: number; profit: number }[] }) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={4}>
          <CartesianGrid stroke="#ECE8EF" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#7A6F80", fontSize: 12 }} />
          <YAxis tickFormatter={formatMoneyCompact} tickLine={false} axisLine={false} width={70} tick={{ fill: "#7A6F80", fontSize: 12 }} />
          <Tooltip formatter={(v) => formatMoney(Number(v))} cursor={{ fill: "#FDEEF4" }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="revenue" name="Ingresos netos" fill="#F65B9A" radius={[6, 6, 0, 0]} />
          <Bar dataKey="profit" name="Ganancia neta" fill="#16A36A" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
