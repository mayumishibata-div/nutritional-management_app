import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const MEAL_TYPE_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;
const MEAL_TYPE_LABEL: Record<(typeof MEAL_TYPE_ORDER)[number], string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

type MealRecord = {
  id: string;
  meal_type: string;
  free_text: string | null;
  input_type: string;
  meal_record_items: { foods: { name: string }[] | null }[];
};

function getTodayInJst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/auth/login");
  }

  const userId = authData.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    redirect("/protected/profile/setup");
  }

  const today = getTodayInJst();

  const { data: mealRecords } = await supabase
    .from("meal_records")
    .select(
      "id, meal_type, free_text, input_type, meal_record_items(foods(name))",
    )
    .eq("user_id", userId)
    .eq("recorded_date", today)
    .order("created_at");

  const records = (mealRecords ?? []) as MealRecord[];
  const recordsByMealType = new Map<string, MealRecord[]>();
  for (const record of records) {
    const list = recordsByMealType.get(record.meal_type) ?? [];
    list.push(record);
    recordsByMealType.set(record.meal_type, list);
  }

  function describeMeal(record: MealRecord) {
    const foodNames = record.meal_record_items
      .flatMap((item) => item.foods ?? [])
      .map((food) => food.name);

    if (foodNames.length > 0) return foodNames.join("、");
    if (record.free_text) return record.free_text;
    return "内容未登録";
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">今日の記録</h1>
        <p className="text-sm text-muted-foreground mt-1">{today}</p>
      </div>

      <Button asChild size="lg" className="w-full">
        <Link href="/protected/meals/new">食事を記録する</Link>
      </Button>

      <div className="flex flex-col gap-3">
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
        <Link href="/protected/today">今日の結果を見る</Link>
      </Button>

      <div className="flex justify-center gap-6 text-sm">
        <Link href="/protected/history" className="underline underline-offset-4">
          履歴・グラフ
        </Link>
        <Link href="/protected/settings" className="underline underline-offset-4">
          設定
        </Link>
      </div>
    </div>
  );
}
