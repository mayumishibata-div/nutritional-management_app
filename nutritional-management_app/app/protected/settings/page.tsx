import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ProfileSetupForm, type InitialProfile } from "@/components/profile-setup-form";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
          <h1 className="text-2xl font-bold">設定</h1>
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("age, gender, height_cm, weight_kg")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (!profile) {
    redirect("/protected/profile/setup");
  }

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-md mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-sm text-muted-foreground mt-1">
          基本情報を変更すると、栄養の目安が再計算されます。
        </p>
      </div>

      <ProfileSetupForm initialProfile={profile as InitialProfile} />

      <div className="flex flex-col gap-2">
        <LogoutButton />
        <Button asChild variant="outline" className="w-full">
          <Link href="/protected">ホームに戻る</Link>
        </Button>
      </div>
    </div>
  );
}
