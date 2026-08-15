# データ設計 — 栄養バランスチェックアプリ（仮称）

本ドキュメントは、CLAUDE.md「7. 開発ロードマップ」における「2. データ設計フェーズ」の成果物である。
ユーザー情報・食事記録・栄養素マスタ・食品/レシピ提案データのテーブル設計（Supabase / PostgreSQL）を整理する。

## 前提となる決定事項

CLAUDE.md「6. 技術仕様」の未確定事項について、以下の方針で合意した。

| 項目 | 方針 |
|---|---|
| 自由文章入力から栄養素データへの変換 | 食品マスタ（`foods`）との文字列マッチングで対応 |
| 栄養必要量の算出基準 | 厚生労働省「日本人の食事摂取基準」を採用。身長・体重は基礎代謝（総エネルギー必要量）算出にのみ使用し、各栄養素の推奨量は年齢・性別ベースの表を参照する |
| 食品マスタのデータソース | 公的食品成分データベース（日本食品標準成分表 等）を取り込む |
| レシピ・料理提案（`suggestions`）のデータソース | 食品成分DBには料理単位の提案文が含まれないため、手動キュレーションで初期データを用意する |

---

## 1. テーブル一覧

| テーブル名 | 役割 |
|---|---|
| `profiles` | ユーザー基本情報（年齢・性別・身長・体重）。`auth.users` と1:1 |
| `nutrients` | 栄養素マスタ（鉄分、ビタミンB1など。名称・単位） |
| `nutrient_requirements` | 年齢帯・性別ごとの栄養素推奨量（食事摂取基準ベース） |
| `foods` | 食品マスタ（公的食品成分DB由来） |
| `food_nutrients` | 食品ごとの栄養価（可食部100gあたりの栄養素含有量） |
| `meal_records` | 食事記録（日付・食事区分・入力方式） |
| `meal_record_items` | 食事記録の明細（どの食品をどれだけ食べたか） |
| `daily_nutrition_summaries` | 1日単位の栄養判定結果（不足/適正/過剰） |
| `suggestions` | 栄養素を補う食品・レシピの提案マスタ（手動キュレーション） |

---

## 2. ER関係図（テキストベース）

```
auth.users (Supabase Auth)
    │ 1:1
    ▼
profiles ────────────────────────────┐
    │ 1:N                            │
    ▼                                │
meal_records                         │
    │ 1:N                            │
    ▼                                │
meal_record_items ──N:1── foods ──1:N── food_nutrients ──N:1── nutrients
                                                                    │
profiles ──(age/gender)──► nutrient_requirements ──N:1─────────────┘
    │
    ▼
daily_nutrition_summaries ──N:1── nutrients
    │
    └──(不足判定)──► suggestions ──N:1── nutrients
```

---

## 3. テーブル定義

### 3-1. `profiles`

ユーザーの基本情報。`auth.users.id` を主キーとして1:1で保持する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | uuid (PK, FK → auth.users.id) | ユーザーID |
| `age` | integer | 年齢 |
| `gender` | text | 性別（`male` / `female`） |
| `height_cm` | numeric | 身長（cm） |
| `weight_kg` | numeric | 体重（kg） |
| `created_at` | timestamptz | 作成日時 |
| `updated_at` | timestamptz | 更新日時 |

### 3-2. `nutrients`

栄養素マスタ。マスタデータとして事前投入する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | integer (PK) | 栄養素ID |
| `name` | text | 栄養素名（例: 鉄分、ビタミンB1） |
| `unit` | text | 単位（mg / µg 等） |
| `description` | text | 平易な説明（UI表示用） |

### 3-3. `nutrient_requirements`

年齢帯・性別ごとの推奨量。厚生労働省「日本人の食事摂取基準」を初期データとして投入する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | integer (PK) | ID |
| `nutrient_id` | integer (FK → nutrients.id) | 対象栄養素 |
| `gender` | text | 性別（`male` / `female`） |
| `age_min` | integer | 対象年齢の下限 |
| `age_max` | integer | 対象年齢の上限 |
| `recommended_amount` | numeric | 推奨量 |

### 3-4. `foods`

食品マスタ。公的食品成分DBを初期データとして取り込む。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | integer (PK) | 食品ID |
| `name` | text | 食品名（マッチング対象） |
| `category` | text | 食品分類 |
| `source` | text | データ出典（例: 日本食品標準成分表） |

### 3-5. `food_nutrients`

食品ごとの栄養価。可食部100gあたりの値を保持する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `food_id` | integer (FK → foods.id) | 食品ID |
| `nutrient_id` | integer (FK → nutrients.id) | 栄養素ID |
| `amount_per_100g` | numeric | 100gあたりの含有量 |

複合主キー: (`food_id`, `nutrient_id`)

### 3-6. `meal_records`

1食分の食事記録。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | uuid (PK) | 記録ID |
| `user_id` | uuid (FK → profiles.id) | ユーザーID |
| `recorded_date` | date | 記録対象日 |
| `meal_type` | text | 食事区分（`breakfast` / `lunch` / `dinner` / `snack`） |
| `input_type` | text | 入力方式（`free_text` / `list_selection`） |
| `free_text` | text | 自由文章入力の原文（`input_type = free_text` の場合） |
| `created_at` | timestamptz | 作成日時 |

### 3-7. `meal_record_items`

食事記録の明細。自由文章入力の場合はマッチング結果をここに格納する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | uuid (PK) | 明細ID |
| `meal_record_id` | uuid (FK → meal_records.id) | 食事記録ID |
| `food_id` | integer (FK → foods.id) | マッチング／選択された食品 |
| `matched_text` | text | 自由文章中でマッチした文字列（デバッグ・確認用） |

### 3-8. `daily_nutrition_summaries`

1日単位の栄養判定結果。バッチ処理または「1日の結果画面」表示時に算出・保存する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | uuid (PK) | ID |
| `user_id` | uuid (FK → profiles.id) | ユーザーID |
| `date` | date | 対象日 |
| `nutrient_id` | integer (FK → nutrients.id) | 栄養素ID |
| `total_amount` | numeric | その日の摂取合計量 |
| `status` | text | 判定結果（`deficient` / `adequate` / `excessive`） |

### 3-9. `suggestions`

不足栄養素を補う食品・レシピの提案マスタ。手動キュレーションで初期データを用意する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | integer (PK) | ID |
| `nutrient_id` | integer (FK → nutrients.id) | 対象栄養素 |
| `type` | text | 提案種別（`food` / `recipe`） |
| `title` | text | 提案タイトル（例: 「ほうれん草のお浸し」） |
| `description` | text | 提案の説明文 |

---

## 4. 未確定事項（実装前に要確認）

- 食品成分DBの具体的な入手元・形式（CSV配布の有無、ライセンス、更新頻度）
- `foods` への取り込み時のカテゴリ体系・食品名の正規化方針
- 自由文章と `foods.name` のマッチング精度（表記ゆれ・同義語の扱い）
- `suggestions` の初期データ件数・カバーする栄養素の範囲
- `daily_nutrition_summaries` の算出タイミング（都度計算 / バッチ / 結果画面表示時のオンデマンド計算）

---

## 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-08-15 | データ設計フェーズの成果物として初版作成 |
