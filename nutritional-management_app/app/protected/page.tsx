import { Suspense } from "react";
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

export default function ProtectedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 w-full flex flex-col gap-8">
          <h1 className="text-2xl font-bold">今日の記録</h1>
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      }
    >
      <ProtectedContent />
    </Suspense>
  );
}

async function ProtectedContent() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/auth/login");
  }

  const userId = authData.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    redirect("/protected/profile/setup");
  }

  const today = getTodayInJst();
  const records = await fetchMealRecords(supabase, userId, today);
  const recordsByMealType = groupByMealType(records);
  const title = profile.display_name
    ? `${profile.display_name}さんの今日の記録`
    : "今日の記録";

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
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
