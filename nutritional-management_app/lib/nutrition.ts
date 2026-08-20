import type { SupabaseClient } from "@supabase/supabase-js";

export type Status = "deficient" | "adequate" | "excessive";

export type Nutrient = { id: number; name: string; unit: string };

export type NutrientResult = {
  nutrient: Nutrient;
  total: number;
  recommended: number | undefined;
  status: Status | null;
};

type Profile = { age: number; gender: string };

// 栄養素ごとのグラフ配色（履歴グラフ・今日のグラフで共通）。
// 色覚多様性に配慮して検証済みのカラーパレットを使用（docs参照: datavizスキルのreferences/palette.md）。
export const NUTRIENT_CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function determineStatus(
  total: number,
  recommended: number | undefined,
): Status | null {
  if (!recommended) return null;
  const ratio = total / recommended;
  if (ratio < 0.8) return "deficient";
  if (ratio > 1.5) return "excessive";
  return "adequate";
}

/**
 * 指定した複数日について、栄養素ごとの摂取量・推奨量・過不足判定をまとめて計算する。
 * meal_record_itemsに分量が無いため「1品目＝100g相当」とみなす簡略計算（CLAUDE.md参照）。
 * 計算結果はdaily_nutrition_summariesにキャッシュ保存する。
 */
export async function computeNutritionForDates(
  supabase: SupabaseClient,
  userId: string,
  dates: string[],
  profile: Profile,
): Promise<Map<string, NutrientResult[]>> {
  if (dates.length === 0) return new Map();

  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  const { data: mealRecords } = await supabase
    .from("meal_records")
    .select("recorded_date, meal_record_items(food_id)")
    .eq("user_id", userId)
    .gte("recorded_date", minDate)
    .lte("recorded_date", maxDate);

  const { data: nutrients } = await supabase
    .from("nutrients")
    .select("id, name, unit")
    .order("id");

  const { data: requirements } = await supabase
    .from("nutrient_requirements")
    .select("nutrient_id, age_min, age_max, recommended_amount")
    .eq("gender", profile.gender);

  const records = (mealRecords ?? []) as {
    recorded_date: string;
    meal_record_items: { food_id: number }[];
  }[];

  const foodIds = Array.from(
    new Set(records.flatMap((r) => r.meal_record_items.map((i) => i.food_id))),
  );

  const { data: foodNutrients } =
    foodIds.length > 0
      ? await supabase
          .from("food_nutrients")
          .select("food_id, nutrient_id, amount_per_100g")
          .in("food_id", foodIds)
      : {
          data: [] as {
            food_id: number;
            nutrient_id: number;
            amount_per_100g: number;
          }[],
        };

  const nutrientAmountsByFood = new Map<
    number,
    { nutrient_id: number; amount_per_100g: number }[]
  >();
  for (const fn of foodNutrients ?? []) {
    const list = nutrientAmountsByFood.get(fn.food_id) ?? [];
    list.push(fn);
    nutrientAmountsByFood.set(fn.food_id, list);
  }

  // 該当する年代区分（例: 18歳未満）が未登録の場合は、
  // 最も年齢が近い区分の推奨量をフォールバックとして採用する（安全策）。
  const requirementsByNutrient = new Map<
    number,
    { age_min: number; age_max: number; recommended_amount: number }[]
  >();
  for (const r of requirements ?? []) {
    const list = requirementsByNutrient.get(r.nutrient_id) ?? [];
    list.push(r);
    requirementsByNutrient.set(r.nutrient_id, list);
  }

  const requirementByNutrient = new Map<number, number>();
  for (const [nutrientId, list] of requirementsByNutrient) {
    const exact = list.find(
      (r) => profile.age >= r.age_min && profile.age <= r.age_max,
    );
    if (exact) {
      requirementByNutrient.set(nutrientId, exact.recommended_amount);
      continue;
    }

    let nearest = list[0];
    let nearestDistance = Infinity;
    for (const r of list) {
      const distance =
        profile.age < r.age_min
          ? r.age_min - profile.age
          : profile.age - r.age_max;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = r;
      }
    }
    if (nearest) {
      requirementByNutrient.set(nutrientId, nearest.recommended_amount);
    }
  }

  const totalsByDate = new Map<string, Map<number, number>>();
  for (const record of records) {
    const totals = totalsByDate.get(record.recorded_date) ?? new Map<number, number>();
    for (const item of record.meal_record_items) {
      for (const fn of nutrientAmountsByFood.get(item.food_id) ?? []) {
        totals.set(
          fn.nutrient_id,
          (totals.get(fn.nutrient_id) ?? 0) + fn.amount_per_100g,
        );
      }
    }
    totalsByDate.set(record.recorded_date, totals);
  }

  const resultByDate = new Map<string, NutrientResult[]>();
  const summariesToUpsert: {
    user_id: string;
    date: string;
    nutrient_id: number;
    total_amount: number;
    status: Status;
  }[] = [];

  for (const date of dates) {
    const totals = totalsByDate.get(date) ?? new Map<number, number>();
    const results: NutrientResult[] = (nutrients ?? []).map((nutrient) => {
      const total = totals.get(nutrient.id) ?? 0;
      const recommended = requirementByNutrient.get(nutrient.id);
      const status = determineStatus(total, recommended);
      return { nutrient, total, recommended, status };
    });
    resultByDate.set(date, results);

    for (const r of results) {
      if (r.status !== null) {
        summariesToUpsert.push({
          user_id: userId,
          date,
          nutrient_id: r.nutrient.id,
          total_amount: r.total,
          status: r.status,
        });
      }
    }
  }

  if (summariesToUpsert.length > 0) {
    await supabase
      .from("daily_nutrition_summaries")
      .upsert(summariesToUpsert, { onConflict: "user_id,date,nutrient_id" });
  }

  return resultByDate;
}

export async function computeDailyNutrition(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  profile: Profile,
): Promise<NutrientResult[]> {
  const resultByDate = await computeNutritionForDates(supabase, userId, [date], profile);
  return resultByDate.get(date) ?? [];
}
