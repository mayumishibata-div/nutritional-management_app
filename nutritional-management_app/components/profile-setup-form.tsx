"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileSetupForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!gender) {
      setError("性別を選択してください");
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("ログイン情報を取得できませんでした");

      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        age: Number(age),
        gender,
        height_cm: Number(heightCm),
        weight_kg: Number(weightKg),
      });
      if (insertError) throw insertError;

      router.push("/protected");
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "登録に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="age">年齢</Label>
                <Input
                  id="age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  required
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label>性別</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="gender"
                      value="male"
                      checked={gender === "male"}
                      onChange={() => setGender("male")}
                    />
                    男性
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="gender"
                      value="female"
                      checked={gender === "female"}
                      onChange={() => setGender("female")}
                    />
                    女性
                  </label>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="height">身長（cm）</Label>
                <Input
                  id="height"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={250}
                  step="0.1"
                  required
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="weight">体重（kg）</Label>
                <Input
                  id="weight"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={300}
                  step="0.1"
                  required
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "登録中..." : "登録する"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
