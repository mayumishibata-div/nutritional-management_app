import { connection } from 'next/server';
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { addDays, getTodayInJst } from "@/lib/meal-records";
import { computeNutritionForDates } from "@/lib/nutrition";
import {
  NutritionHistoryChart,
  type HistoryChartPoint,
} from "@/components/nutrition-history-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PERIOD_OPTIONS = [7, 14, 30] as const;
type Period = (typeof PERIOD_OPTIONS)[number];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await connection();
  const { days: daysParam } = await searchParams;
  const parsedDays = Number(daysParam);
  const days: Period = PERIOD_OPTIONS.includes(parsedDays as Period)
    ? (parsedDays as Period)
    : 7;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/auth/login");
  }

  const userId = authData.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, age, gender")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    redirect("/protected/profile/setup");
  }

  const today = getTodayInJst();
  const dates = Array.from({ length: days }, (_, i) =>
    addDays(today, -(days - 1 - i)),
  );

  const resultsByDate = await computeNutritionForDates(
    supabase,
    userId,
    dates,
    profile,
  );

  const nutrientNames = Array.from(
    new Set(
      dates.flatMap((d) => (resultsByDate.get(d) ?? []).map((r) => r.nutrient.name)),
    ),
  );

  const chartData: HistoryChartPoint[] = dates.map((date) => {
    const point: HistoryChartPoint = { date: date.slice(5).replace("-", "/") };
    for (const r of resultsByDate.get(date) ?? []) {
      point[r.nutrient.name] = r.recommended
        ? Math.round((r.total / r.recommended) * 100)
        : 0;
    }
    return point;
  });

  const { data: recordDates } = await supabase
    .from("meal_records")
    .select("recorded_date")
    .eq("user_id", userId)
    .gte("recorded_date", dates[0])
    .lte("recorded_date", today);

  const dateCounts = new Map<string, number>();
  for (const r of recordDates ?? []) {
    dateCounts.set(r.recorded_date, (dateCounts.get(r.recorded_date) ?? 0) + 1);
  }
  const recordedDatesDesc = Array.from(dateCounts.keys()).sort((a, b) =>
    a < b ? 1 : -1,
  );

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">履歴・グラフ</h1>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt}
              asChild
              size="sm"
              variant={opt === days ? "default" : "outline"}
            >
              <Link href={`/protected/history?days=${opt}`}>過去{opt}日間</Link>
            </Button>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-2">
              各栄養素の摂取量を、推奨量に対する割合（%）で表示しています。点線が目安（100%）です。
            </p>
            <NutritionHistoryChart data={chartData} nutrientNames={nutrientNames} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">過去の記録</h2>
        {recordedDatesDesc.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            この期間の記録がありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recordedDatesDesc.map((date) => (
              <li key={date}>
                <Link href={`/protected/today?date=${date}`}>
                  <Card>
                    <CardContent className="py-3 flex items-center justify-between text-sm">
                      <span>{date}</span>
                      <span className="text-muted-foreground">
                        {dateCounts.get(date)}件の記録
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button asChild variant="outline" className="w-full">
        <Link href="/protected">ホームに戻る</Link>
      </Button>
    </div>
  );
}
