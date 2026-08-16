import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { MealInputForm } from "@/components/meal-input-form";

export default async function NewMealPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (!profile) {
    redirect("/protected/profile/setup");
  }

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold">食事を記録する</h1>
      </div>
      <MealInputForm />
    </div>
  );
}
