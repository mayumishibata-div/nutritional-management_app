import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { fetchMealRecords, getTodayInJst } from "@/lib/meal-records";
import { computeDailyNutrition, type Status } from "@/lib/nutrition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NutritionTodayChart } from "@/components/nutrition-today-chart";
import { MealManager } from "@/components/meal-manager";

function statusComment(nutrientName: string, status: Status) {
  if (status === "deficient") return `${nutrientName}が不足しています`;
  if (status === "excessive") return `${nutrientName}を摂りすぎています`;
  return `${nutrientName}は足りています`;
}

function statusToBadgeVariant(status: Status) {
  if (status === "deficient") return "destructive" as const;
  if (status === "excessive") return "secondary" as const;
  return "outline" as const;
}

export default async function TodayResultPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;

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

  const date = dateParam ?? getTodayInJst();
  const records = await fetchMealRecords(supabase, userId, date);

  const results = await computeDailyNutrition(supabase, userId, date, profile);

  const deficientNutrientIds = results
    .filter((r) => r.status === "deficient")
    .map((r) => r.nutrient.id);

  const { data: suggestions } =
    deficientNutrientIds.length > 0
      ? await supabase
          .from("suggestions")
          .select("nutrient_id, type, title")
          .in("nutrient_id", deficientNutrientIds)
      : { data: [] as { nutrient_id: number; type: string; title: string }[] };

  const suggestionsByNutrient = new Map<
    number,
    { food: string[]; recipe: string[] }
  >();
  for (const s of suggestions ?? []) {
    const entry = suggestionsByNutrient.get(s.nutrient_id) ?? {
      food: [],
      recipe: [],
    };
    if (s.type === "food") entry.food.push(s.title);
    else entry.recipe.push(s.title);
    suggestionsByNutrient.set(s.nutrient_id, entry);
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">
          {date === getTodayInJst() ? "今日の結果" : "その日の結果"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{date}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground mb-2">
            各栄養素の摂取量を、推奨量に対する割合（%）で表示しています。点線が目安（100%）です。
          </p>
          <NutritionTodayChart
            data={results.map((r) => ({
              name: r.nutrient.name,
              percent: r.recommended ? Math.round((r.total / r.recommended) * 100) : 0,
            }))}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {results.map(({ nutrient, status }) => {
          const suggestion = suggestionsByNutrient.get(nutrient.id);
          return (
            <Card key={nutrient.id}>
              <CardContent className="pt-6 flex flex-col gap-2">
                {status ? (
                  <div className="flex items-center gap-2">
                    <Badge variant={statusToBadgeVariant(status)}>
                      {statusComment(nutrient.name, status)}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {nutrient.name}: 基準データがありません
                  </p>
                )}
                {status === "deficient" && suggestion && (
                  <div className="text-sm text-muted-foreground flex flex-col gap-1">
                    {suggestion.food.length > 0 && (
                      <p>{suggestion.food.join("や")}がおすすめです</p>
                    )}
                    {suggestion.recipe.map((title) => (
                      <p key={title}>{title}はいかがですか？</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <MealManager key={date} date={date} initialRecords={records} />

      <div className="flex gap-2">
        <Button asChild variant="outline" className="flex-1">
          <Link href="/protected">ホームに戻る</Link>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href="/protected/history">履歴・グラフ</Link>
        </Button>
      </div>
    </div>
  );
}
