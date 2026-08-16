"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  MEAL_TYPE_LABEL,
  MEAL_TYPE_ORDER,
  describeMeal,
  getTodayInJst,
  groupByMealType,
  toArray,
  type MealRecord,
} from "@/lib/meal-records";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { EditingMeal, MealInputForm } from "@/components/meal-input-form";

export function MealManager({
  date,
  initialRecords,
}: {
  date: string;
  initialRecords: MealRecord[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState<EditingMeal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const recordsByMealType = groupByMealType(initialRecords);
  const isToday = date === getTodayInJst();

  const startEdit = (record: MealRecord) => {
    setEditing({
      id: record.id,
      mealType: record.meal_type,
      mode: record.input_type === "list_selection" ? "list_selection" : "free_text",
      freeText: record.free_text ?? "",
      selectedFoods: record.meal_record_items
        .flatMap((item) =>
          toArray(item.foods).map((food) => ({ id: item.food_id, name: food.name })),
        ),
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("この記録を削除しますか？")) return;
    setDeletingId(id);
    const supabase = createClient();
    await supabase.from("meal_records").delete().eq("id", id);
    setDeletingId(null);
    if (editing?.id === id) setEditing(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="record-date">記録する日</Label>
        <input
          id="record-date"
          type="date"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={date}
          max={getTodayInJst()}
          onChange={(e) => {
            if (!e.target.value) return;
            router.push(`${pathname}?date=${e.target.value}`);
          }}
        />
        <p className="text-xs text-muted-foreground">
          昨日以前の記録し忘れも、日付を変えて入力できます。
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{isToday ? "今日の記録" : `${date}の記録`}</h2>
        {initialRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだこの日の記録がありません。
          </p>
        ) : (
          MEAL_TYPE_ORDER.filter((type) => recordsByMealType.has(type)).map(
            (type) => (
              <Card key={type}>
                <CardContent className="pt-6 flex flex-col gap-2">
                  <Badge variant="secondary" className="w-fit">
                    {MEAL_TYPE_LABEL[type]}
                  </Badge>
                  <ul className="flex flex-col gap-2">
                    {recordsByMealType.get(type)!.map((record) => (
                      <li
                        key={record.id}
                        className="flex items-center justify-between text-sm gap-2"
                      >
                        <span>{describeMeal(record)}</span>
                        <span className="flex gap-2 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(record)}
                          >
                            編集
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={deletingId === record.id}
                            onClick={() => handleDelete(record.id)}
                          >
                            削除
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ),
          )
        )}
      </div>

      <MealInputForm
        recordedDate={date}
        editing={editing}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
        onCancelEdit={() => setEditing(null)}
      />
    </div>
  );
}
