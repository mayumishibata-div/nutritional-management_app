"use client";

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { NUTRIENT_CHART_COLORS } from "@/lib/nutrition";

export type TodayChartPoint = {
  name: string;
  percent: number;
};

export function NutritionTodayChart({ data }: { data: TodayChartPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${v}%`}
          />
          <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
          <Tooltip formatter={(value) => `${Math.round(Number(value))}%`} />
          <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={NUTRIENT_CHART_COLORS[i % NUTRIENT_CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
