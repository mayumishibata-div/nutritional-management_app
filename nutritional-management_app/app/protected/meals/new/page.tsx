import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { fetchMealRecords, getTodayInJst } from "@/lib/meal-records";
import { MealManager } from "@/components/meal-manager";
import { Button } from "@/components/ui/button";

export default function NewMealPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
          <h1 className="text-2xl font-bold">食事を記録する</h1>
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      }
    >
      <NewMealContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewMealContent({
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
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    redirect("/protected/profile/setup");
  }

  const today = getTodayInJst();
  const date = dateParam && dateParam <= today ? dateParam : today;
  const records = await fetchMealRecords(supabase, userId, date);

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold">食事を記録する</h1>
      </div>
      <MealManager key={date} date={date} initialRecords={records} />
      <Button asChild variant="outline" className="w-full">
        <Link href="/protected">ホームに戻る</Link>
      </Button>
    </div>
  );
}
