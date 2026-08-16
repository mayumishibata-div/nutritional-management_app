import type { SupabaseClient } from "@supabase/supabase-js";

export const MEAL_TYPE_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;
export const MEAL_TYPE_LABEL: Record<(typeof MEAL_TYPE_ORDER)[number], string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

export type MealRecord = {
  id: string;
  meal_type: string;
  input_type: string;
  free_text: string | null;
  meal_record_items: {
    food_id: number;
    foods: { name: string } | { name: string }[] | null;
  }[];
};

/**
 * PostgRESTは多対1のリレーションを単一オブジェクトで返すことがあるため、
 * 配列・単一オブジェクト・nullのいずれでも安全に配列として扱えるようにする。
 */
export function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function getTodayInJst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function describeMeal(record: MealRecord) {
  // 自由文章入力は、一部の食品しかマッチしなくても入力内容が消えて見えないよう、
  // 元の文章をそのまま優先表示する（マッチ結果の食品名だけに絞らない）
  if (record.free_text) return record.free_text;

  const foodNames = record.meal_record_items
    .flatMap((item) => toArray(item.foods))
    .map((food) => food.name);

  if (foodNames.length > 0) return foodNames.join("、");
  return "内容未登録";
}

export async function fetchMealRecords(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<MealRecord[]> {
  const { data } = await supabase
    .from("meal_records")
    .select(
      "id, meal_type, input_type, free_text, meal_record_items(food_id, foods(name))",
    )
    .eq("user_id", userId)
    .eq("recorded_date", date)
    .order("created_at");

  return (data ?? []) as MealRecord[];
}

export function groupByMealType(records: MealRecord[]) {
  const map = new Map<string, MealRecord[]>();
  for (const record of records) {
    const list = map.get(record.meal_type) ?? [];
    list.push(record);
    map.set(record.meal_type, list);
  }
  return map;
}
