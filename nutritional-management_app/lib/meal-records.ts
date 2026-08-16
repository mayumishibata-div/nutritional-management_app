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
  meal_record_items: { food_id: number; foods: { name: string }[] | null }[];
};

export function getTodayInJst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}

export function describeMeal(record: MealRecord) {
  const foodNames = record.meal_record_items
    .flatMap((item) => item.foods ?? [])
    .map((food) => food.name);

  if (foodNames.length > 0) return foodNames.join("、");
  if (record.free_text) return record.free_text;
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
