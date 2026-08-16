import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  MEAL_TYPE_LABEL,
  MEAL_TYPE_ORDER,
  describeMeal,
  fetchMealRecords,
  getTodayInJst,
  groupByMealType,
} from "@/lib/meal-records";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Status = "deficient" | "adequate" | "excessive";

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

export default async function TodayResultPage() {
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
  const records = await fetchMealRecords(supabase, userId, today);
  const recordsByMealType = groupByMealType(records);

  const foodIds = Array.from(
    new Set(records.flatMap((r) => r.meal_record_items.map((i) => i.food_id))),
  );

  const { data: nutrients } = await supabase
    .from("nutrients")
    .select("id, name, unit")
    .order("id");

  const { data: requirements } = await supabase
    .from("nutrient_requirements")
    .select("nutrient_id, recommended_amount")
    .eq("gender", profile.gender)
    .lte("age_min", profile.age)
    .gte("age_max", profile.age);

  const { data: foodNutrients } =
    foodIds.length > 0
      ? await supabase
          .from("food_nutrients")
          .select("nutrient_id, amount_per_100g")
          .in("food_id", foodIds)
      : { data: [] as { nutrient_id: number; amount_per_100g: number }[] };

  const requirementByNutrient = new Map(
    (requirements ?? []).map((r) => [r.nutrient_id, r.recommended_amount]),
  );

  const totalByNutrient = new Map<number, number>();
  for (const fn of foodNutrients ?? []) {
    totalByNutrient.set(
      fn.nutrient_id,
      (totalByNutrient.get(fn.nutrient_id) ?? 0) + fn.amount_per_100g,
    );
  }

  const results = (nutrients ?? []).map((nutrient) => {
    const total = totalByNutrient.get(nutrient.id) ?? 0;
    const recommended = requirementByNutrient.get(nutrient.id);
    let status: Status | null = null;
    if (recommended) {
      const ratio = total / recommended;
      status = ratio < 0.8 ? "deficient" : ratio > 1.5 ? "excessive" : "adequate";
    }
    return { nutrient, total, recommended, status };
  });

  // 判定結果をキャッシュ保存（オンデマンド計算のキャッシュ）
  const summariesToUpsert = results
    .filter((r) => r.status !== null)
    .map((r) => ({
      user_id: userId,
      date: today,
      nutrient_id: r.nutrient.id,
      total_amount: r.total,
      status: r.status as Status,
    }));
  if (summariesToUpsert.length > 0) {
    await supabase
      .from("daily_nutrition_summaries")
      .upsert(summariesToUpsert, { onConflict: "user_id,date,nutrient_id" });
  }

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
        <h1 className="text-2xl font-bold">今日の結果</h1>
        <p className="text-sm text-muted-foreground mt-1">{today}</p>
      </div>

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

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">今日食べたもの</h2>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ今日の記録がありません。
          </p>
        ) : (
          MEAL_TYPE_ORDER.filter((type) => recordsByMealType.has(type)).map(
            (type) => (
              <Card key={type}>
                <CardContent className="pt-6 flex flex-col gap-2">
                  <Badge variant="secondary" className="w-fit">
                    {MEAL_TYPE_LABEL[type]}
                  </Badge>
                  <ul className="text-sm flex flex-col gap-1">
                    {recordsByMealType.get(type)!.map((record) => (
                      <li key={record.id}>{describeMeal(record)}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ),
          )
        )}
      </div>

      <Button asChild variant="outline" className="w-full">
        <Link href="/protected">ホームに戻る</Link>
      </Button>
    </div>
  );
}
