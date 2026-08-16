import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ProfileSetupForm } from "@/components/profile-setup-form";

export default function ProfileSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
          <h1 className="text-2xl font-bold">基本情報の登録</h1>
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      }
    >
      <ProfileSetupContent />
    </Suspense>
  );
}

async function ProfileSetupContent() {
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

  if (profile) {
    redirect("/protected");
  }

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold">基本情報の登録</h1>
        <p className="text-sm text-muted-foreground mt-1">
          あなたに合った栄養の目安を計算するために使います。
        </p>
      </div>
      <ProfileSetupForm />
    </div>
  );
}
