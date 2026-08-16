-- 栄養バランスチェックアプリ 初期スキーマ
-- 参照: docs/data-design.md

create extension if not exists pgcrypto;

-- =========================================================
-- 1. profiles: ユーザー基本情報（auth.users と1:1）
-- =========================================================
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  age integer not null,
  gender text not null check (gender in ('male', 'female')),
  height_cm numeric not null,
  weight_kg numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- =========================================================
-- 2. nutrients: 栄養素マスタ
-- =========================================================
create table nutrients (
  id integer primary key generated always as identity,
  name text not null,
  unit text not null,
  description text
);

alter table nutrients enable row level security;

create policy "nutrients_select_authenticated" on nutrients
  for select to authenticated using (true);

-- =========================================================
-- 3. nutrient_requirements: 年齢帯・性別ごとの栄養素推奨量
-- =========================================================
create table nutrient_requirements (
  id integer primary key generated always as identity,
  nutrient_id integer not null references nutrients (id),
  gender text not null check (gender in ('male', 'female')),
  age_min integer not null,
  age_max integer not null,
  recommended_amount numeric not null
);

alter table nutrient_requirements enable row level security;

create policy "nutrient_requirements_select_authenticated" on nutrient_requirements
  for select to authenticated using (true);

-- =========================================================
-- 4. foods: 食品マスタ
-- =========================================================
create table foods (
  id integer primary key generated always as identity,
  name text not null,
  category text,
  source text
);

alter table foods enable row level security;

create policy "foods_select_authenticated" on foods
  for select to authenticated using (true);

-- =========================================================
-- 5. food_aliases: 食品の表記ゆれ・別名
-- =========================================================
create table food_aliases (
  id integer primary key generated always as identity,
  food_id integer not null references foods (id) on delete cascade,
  alias text not null
);

alter table food_aliases enable row level security;

create policy "food_aliases_select_authenticated" on food_aliases
  for select to authenticated using (true);

-- =========================================================
-- 6. food_nutrients: 食品ごとの栄養価（可食部100gあたり）
-- =========================================================
create table food_nutrients (
  food_id integer not null references foods (id) on delete cascade,
  nutrient_id integer not null references nutrients (id),
  amount_per_100g numeric not null,
  primary key (food_id, nutrient_id)
);

alter table food_nutrients enable row level security;

create policy "food_nutrients_select_authenticated" on food_nutrients
  for select to authenticated using (true);

-- =========================================================
-- 7. meal_records: 食事記録
-- =========================================================
create table meal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  recorded_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  input_type text not null check (input_type in ('free_text', 'list_selection')),
  free_text text,
  created_at timestamptz not null default now()
);

alter table meal_records enable row level security;

create policy "meal_records_all_own" on meal_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- 8. meal_record_items: 食事記録の明細
-- =========================================================
create table meal_record_items (
  id uuid primary key default gen_random_uuid(),
  meal_record_id uuid not null references meal_records (id) on delete cascade,
  food_id integer not null references foods (id),
  matched_text text
);

alter table meal_record_items enable row level security;

create policy "meal_record_items_all_own" on meal_record_items
  for all using (
    exists (
      select 1 from meal_records
      where meal_records.id = meal_record_items.meal_record_id
        and meal_records.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from meal_records
      where meal_records.id = meal_record_items.meal_record_id
        and meal_records.user_id = auth.uid()
    )
  );

-- =========================================================
-- 9. daily_nutrition_summaries: 1日単位の栄養判定結果（キャッシュ）
-- =========================================================
create table daily_nutrition_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  nutrient_id integer not null references nutrients (id),
  total_amount numeric not null,
  status text not null check (status in ('deficient', 'adequate', 'excessive')),
  unique (user_id, date, nutrient_id)
);

alter table daily_nutrition_summaries enable row level security;

create policy "daily_nutrition_summaries_all_own" on daily_nutrition_summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- 10. suggestions: 栄養素を補う食品・レシピの提案マスタ
-- =========================================================
create table suggestions (
  id integer primary key generated always as identity,
  nutrient_id integer not null references nutrients (id),
  type text not null check (type in ('food', 'recipe')),
  title text not null,
  description text
);

alter table suggestions enable row level security;

create policy "suggestions_select_authenticated" on suggestions
  for select to authenticated using (true);
