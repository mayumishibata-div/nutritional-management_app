"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toArray } from "@/lib/meal-records";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

const MEAL_TYPES = [
  { value: "breakfast", label: "朝食" },
  { value: "lunch", label: "昼食" },
  { value: "dinner", label: "夕食" },
  { value: "snack", label: "間食" },
] as const;

export type FoodCandidate = { id: number; name: string };
type SegmentMatch = {
  segment: string;
  candidates: FoodCandidate[];
  selectedFoodId: number | "";
};

export type EditingMeal = {
  id: string;
  mealType: string;
  mode: "free_text" | "list_selection";
  freeText: string;
  selectedFoods: FoodCandidate[];
};

function splitFreeText(text: string): string[] {
  return text
    .split(/[、,，\n\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function MealInputForm({
  recordedDate,
  editing,
  onSaved,
  onCancelEdit,
}: {
  recordedDate: string;
  editing: EditingMeal | null;
  onSaved: () => void;
  onCancelEdit: () => void;
}) {
  const [mealType, setMealType] = useState<string>("");
  const [mode, setMode] = useState<"free_text" | "list_selection">(
    "free_text",
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 自由文章入力モード
  const [freeText, setFreeText] = useState("");
  const [segmentMatches, setSegmentMatches] = useState<SegmentMatch[] | null>(
    null,
  );
  const [isMatching, setIsMatching] = useState(false);

  // 食品リスト選択モード
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFoods, setSelectedFoods] = useState<FoodCandidate[]>([]);

  const resetFields = () => {
    setMealType("");
    setMode("free_text");
    setFreeText("");
    setSegmentMatches(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedFoods([]);
  };

  useEffect(() => {
    setError(null);
    if (editing) {
      setMealType(editing.mealType);
      setMode(editing.mode);
      setFreeText(editing.freeText);
      setSegmentMatches(null);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedFoods(editing.selectedFoods);
    } else {
      resetFields();
    }
  }, [editing]);

  const handleCheckCandidates = async () => {
    setError(null);
    const segments = splitFreeText(freeText);
    if (segments.length === 0) {
      setError("食べたものを入力してください");
      return;
    }

    setIsMatching(true);
    const supabase = createClient();
    try {
      const results: SegmentMatch[] = [];
      for (const segment of segments) {
        const [byName, byAlias] = await Promise.all([
          supabase.from("foods").select("id, name").ilike("name", `%${segment}%`).limit(5),
          supabase
            .from("food_aliases")
            .select("food_id, foods(id, name)")
            .ilike("alias", `%${segment}%`)
            .limit(5),
        ]);

        const candidates = new Map<number, FoodCandidate>();
        for (const food of byName.data ?? []) {
          candidates.set(food.id, { id: food.id, name: food.name });
        }
        for (const alias of byAlias.data ?? []) {
          for (const food of toArray(alias.foods as FoodCandidate | FoodCandidate[] | null)) {
            candidates.set(food.id, { id: food.id, name: food.name });
          }
        }

        const candidateList = Array.from(candidates.values());
        results.push({
          segment,
          candidates: candidateList,
          selectedFoodId: candidateList.length === 1 ? candidateList[0].id : "",
        });
      }
      setSegmentMatches(results);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "候補の取得に失敗しました");
    } finally {
      setIsMatching(false);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length === 0) return;
    setIsSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("foods")
      .select("id, name")
      .ilike("name", `%${searchQuery.trim()}%`)
      .limit(10);
    setSearchResults(data ?? []);
    setIsSearching(false);
  };

  const addSelectedFood = (food: FoodCandidate) => {
    setSelectedFoods((prev) =>
      prev.some((f) => f.id === food.id) ? prev : [...prev, food],
    );
  };

  const removeSelectedFood = (id: number) => {
    setSelectedFoods((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSave = async () => {
    setError(null);

    if (!mealType) {
      setError("食事区分を選択してください");
      return;
    }

    const itemsToSave: { foodId: number; matchedText: string | null }[] = [];
    let freeTextToSave = freeText;

    if (mode === "free_text") {
      if (!segmentMatches && !editing) {
        setError("先に「候補を確認」を押してください");
        return;
      }
      if (segmentMatches) {
        for (const match of segmentMatches) {
          if (match.selectedFoodId !== "") {
            itemsToSave.push({
              foodId: match.selectedFoodId,
              matchedText: match.segment,
            });
          }
        }
        // マッチした部分は正式名称に置き換え、マッチしなかった部分は入力のまま残す
        freeTextToSave = segmentMatches
          .map((match) => {
            if (match.selectedFoodId === "") return match.segment;
            const matched = match.candidates.find((c) => c.id === match.selectedFoodId);
            return matched ? matched.name : match.segment;
          })
          .join("、");
      } else if (editing) {
        // 編集時に自由文章を変更していない場合は、既存の選択済み食品をそのまま引き継ぐ
        for (const food of selectedFoods) {
          itemsToSave.push({ foodId: food.id, matchedText: null });
        }
      }
      // マッチする食品が1つも無くても、入力した文章自体は記録として保存する
    } else {
      if (selectedFoods.length === 0) {
        setError("食品を1つ以上選択してください");
        return;
      }
      for (const food of selectedFoods) {
        itemsToSave.push({ foodId: food.id, matchedText: null });
      }
    }

    setIsLoading(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("ログイン情報を取得できませんでした");

      let mealRecordId: string;

      if (editing) {
        const { error: updateError } = await supabase
          .from("meal_records")
          .update({
            meal_type: mealType,
            input_type: mode,
            free_text: mode === "free_text" ? freeTextToSave : null,
          })
          .eq("id", editing.id);
        if (updateError) throw updateError;

        const { error: deleteItemsError } = await supabase
          .from("meal_record_items")
          .delete()
          .eq("meal_record_id", editing.id);
        if (deleteItemsError) throw deleteItemsError;

        mealRecordId = editing.id;
      } else {
        const { data: mealRecord, error: mealRecordError } = await supabase
          .from("meal_records")
          .insert({
            user_id: user.id,
            recorded_date: recordedDate,
            meal_type: mealType,
            input_type: mode,
            free_text: mode === "free_text" ? freeTextToSave : null,
          })
          .select("id")
          .single();
        if (mealRecordError || !mealRecord) throw mealRecordError ?? new Error("食事記録の保存に失敗しました");
        mealRecordId = mealRecord.id;
      }

      if (itemsToSave.length > 0) {
        const { error: itemsError } = await supabase.from("meal_record_items").insert(
          itemsToSave.map((item) => ({
            meal_record_id: mealRecordId,
            food_id: item.foodId,
            matched_text: item.matchedText,
          })),
        );
        if (itemsError) throw itemsError;
      }

      resetFields();
      onSaved();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="pt-6 flex flex-col gap-6">
          {editing && (
            <div className="flex items-center justify-between text-sm bg-accent rounded-md px-3 py-2">
              <span>記録を編集中です</span>
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={onCancelEdit}
              >
                編集をやめる
              </button>
            </div>
          )}

          <div className="grid gap-2">
            <Label>食事区分</Label>
            <div className="flex flex-wrap gap-4">
              {MEAL_TYPES.map((type) => (
                <label key={type.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="meal_type"
                    value={type.value}
                    checked={mealType === type.value}
                    onChange={() => setMealType(type.value)}
                  />
                  {type.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 border-b">
            <button
              type="button"
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
                mode === "free_text"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
              onClick={() => setMode("free_text")}
            >
              自由文章入力
            </button>
            <button
              type="button"
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
                mode === "list_selection"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
              onClick={() => setMode("list_selection")}
            >
              食品リスト選択
            </button>
          </div>

          {mode === "free_text" ? (
            <div className="flex flex-col gap-3">
              <textarea
                className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                placeholder="例: ご飯、鮭の塩焼き、味噌汁"
                value={freeText}
                onChange={(e) => {
                  setFreeText(e.target.value);
                  setSegmentMatches(null);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCheckCandidates}
                disabled={isMatching}
              >
                {isMatching ? "検索中..." : "候補を確認"}
              </Button>

              {segmentMatches && (
                <div className="flex flex-col gap-3">
                  {segmentMatches.map((match, i) => (
                    <div key={i} className="grid gap-1">
                      <span className="text-sm text-muted-foreground">
                        「{match.segment}」
                      </span>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={match.selectedFoodId}
                        onChange={(e) => {
                          const value = e.target.value ? Number(e.target.value) : "";
                          setSegmentMatches((prev) =>
                            prev
                              ? prev.map((m, idx) =>
                                  idx === i ? { ...m, selectedFoodId: value } : m,
                                )
                              : prev,
                          );
                        }}
                      >
                        <option value="">
                          {match.candidates.length === 0
                            ? "見つかりませんでした（スキップ）"
                            : "スキップする"}
                        </option>
                        {match.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input
                  placeholder="食品名で検索"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleSearch} disabled={isSearching}>
                  検索
                </Button>
              </div>

              {searchResults.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {searchResults.map((food) => (
                    <li key={food.id} className="flex items-center justify-between text-sm">
                      <span>{food.name}</span>
                      <Button type="button" size="sm" variant="secondary" onClick={() => addSelectedFood(food)}>
                        追加
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {selectedFoods.length > 0 && (
                <div className="flex flex-col gap-1 border-t pt-3">
                  <Label>選択した食品</Label>
                  <ul className="flex flex-col gap-1">
                    {selectedFoods.map((food) => (
                      <li key={food.id} className="flex items-center justify-between text-sm">
                        <span>{food.name}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => removeSelectedFood(food.id)}
                        >
                          削除
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="button" className="w-full" onClick={handleSave} disabled={isLoading}>
            {isLoading ? "保存中..." : editing ? "更新する" : "保存する"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
