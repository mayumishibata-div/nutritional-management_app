"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { NUTRIENT_CHART_COLORS } from "@/lib/nutrition";

export type HistoryChartPoint = {
  date: string;
  [nutrientName: string]: string | number;
};

export function NutritionHistoryChart({
  data,
  nutrientNames,
}: {
  data: HistoryChartPoint[];
  nutrientNames: string[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${v}%`}
          />
          <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
          <Tooltip formatter={(value) => `${Math.round(Number(value))}%`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {nutrientNames.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={NUTRIENT_CHART_COLORS[i % NUTRIENT_CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
