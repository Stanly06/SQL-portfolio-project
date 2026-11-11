"use client";

import Link from "next/link";
import { useState } from "react";
import { Boxes } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardHeader } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { CategorySlice } from "@/lib/types";
import { cn } from "@/lib/utils";

export function InventoryDonut({ data }: { data: CategorySlice[] }) {
  const total = data.reduce((a, c) => a + c.units, 0);
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover !== null ? data[hover] : null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        icon={<Boxes className="h-5 w-5" />}
        title="Inventario por categoría"
        action={<Link href="/inventario" className="text-xs font-medium text-pink-strong hover:underline">Ver inventario →</Link>}
      />
      <div className="flex flex-1 flex-col items-center gap-4 px-5 pb-5 pt-2 sm:flex-row xl:flex-col 2xl:flex-row">
        <div className="relative h-[180px] w-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="units"
                nameKey="category"
                innerRadius={58}
                outerRadius={86}
                paddingAngle={2}
                cornerRadius={6}
                stroke="none"
                onMouseEnter={(_, i) => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {data.map((c, i) => (
                  <Cell key={c.category} fill={c.color} opacity={hover === null || hover === i ? 1 : 0.35} />
                ))}
              </Pie>
              <Tooltip content={() => null} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="tabular font-[family-name:var(--font-display)] text-[26px] font-bold text-plum">
                {formatNumber(focus ? focus.units : total)}
              </p>
              <p className="text-xs text-muted">{focus ? focus.category : "Unidades"}</p>
            </div>
          </div>
        </div>
        <ul className="grid w-full min-w-0 gap-1.5 text-sm xl:grid-cols-2 2xl:grid-cols-1">
          {data.map((c, i) => (
            <li
              key={c.category}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors", hover === i && "bg-canvas")}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="truncate text-ink">{c.category}</span>
              <span className="tabular ml-auto text-muted">{Math.round((c.units / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
