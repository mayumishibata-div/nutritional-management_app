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

2026-08-16、旧「4. 未確定事項」に挙げていた5点について、以下の方針で合意した。

| 項目 | 方針 |
|---|---|
| 食品成分DBの入手元・形式 | 文部科学省「日本食品標準成分表2020年版（八訂）増補2023年」。文部科学省サイト配布のExcelファイルをダウンロードし、CSVに変換した上でSupabaseにseedする。政府データのため二次利用可だが出典明記が必要（アプリ内に出典表示）。改訂は数年に1度のため自動同期の仕組みは作らず、MVPでは最新版を一度取り込み以降は手動更新とする |
| `foods`のカテゴリ・正規化方針 | 成分表の食品群（穀類・魚介類・野菜類など）をそのまま `foods.category` に採用する。食品名は成分表の表記をそのまま登録し、表記ゆれ（「ごはん」→「めし　水稲　精白米」等）は新設する `food_aliases` テーブルで別名として吸収する |
| 自由文章マッチングの精度 | MVPでは完全一致＋部分一致（LIKE検索）のシンプルな方式にとどめ、形態素解析等の高度化は将来機能とする。マッチしない場合は候補リストを提示しユーザーに選ばせるUXとする |
| `suggestions`の初期データ範囲 | ダイエット中に不足しがちな栄養素（鉄分・ビタミンB1・カルシウム・食物繊維・ビタミンC等）5〜8種に絞ってMVP対応する。各栄養素につき3〜5件（食品1〜2＋レシピ1〜2）を手動キュレーションする |
| `daily_nutrition_summaries`の算出タイミング | 「1日の結果画面」を開いたタイミングでオンデマンド計算し、結果を本テーブルにキャッシュ保存する。バッチ処理基盤はMVPでは構築しない |

---

## 1. テーブル一覧

| テーブル名 | 役割 |
|---|---|
| `profiles` | ユーザー基本情報（年齢・性別・身長・体重）。`auth.users` と1:1 |
| `nutrients` | 栄養素マスタ（鉄分、ビタミンB1など。名称・単位） |
| `nutrient_requirements` | 年齢帯・性別ごとの栄養素推奨量（食事摂取基準ベース） |
| `foods` | 食品マスタ（公的食品成分DB由来） |
| `food_aliases` | 食品の表記ゆれ・別名（自由文章マッチング用） |
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
                                └──1:N── food_aliases
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

### 3-5. `food_aliases`

食品の表記ゆれ・別名。自由文章入力のマッチング精度向上のために用いる。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | integer (PK) | ID |
| `food_id` | integer (FK → foods.id) | 対象食品 |
| `alias` | text | 別名・表記ゆれ（例:「ごはん」） |

### 3-6. `food_nutrients`

食品ごとの栄養価。可食部100gあたりの値を保持する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `food_id` | integer (FK → foods.id) | 食品ID |
| `nutrient_id` | integer (FK → nutrients.id) | 栄養素ID |
| `amount_per_100g` | numeric | 100gあたりの含有量 |

複合主キー: (`food_id`, `nutrient_id`)

### 3-7. `meal_records`

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

### 3-8. `meal_record_items`

食事記録の明細。自由文章入力の場合はマッチング結果をここに格納する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | uuid (PK) | 明細ID |
| `meal_record_id` | uuid (FK → meal_records.id) | 食事記録ID |
| `food_id` | integer (FK → foods.id) | マッチング／選択された食品 |
| `matched_text` | text | 自由文章中でマッチした文字列（デバッグ・確認用） |

### 3-9. `daily_nutrition_summaries`

1日単位の栄養判定結果。「1日の結果画面」を開いたタイミングでオンデマンド計算し、本テーブルにキャッシュ保存する。

| カラム名 | 型 | 説明 |
|---|---|---|
| `id` | uuid (PK) | ID |
| `user_id` | uuid (FK → profiles.id) | ユーザーID |
| `date` | date | 対象日 |
| `nutrient_id` | integer (FK → nutrients.id) | 栄養素ID |
| `total_amount` | numeric | その日の摂取合計量 |
| `status` | text | 判定結果（`deficient` / `adequate` / `excessive`） |

### 3-10. `suggestions`

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

2026-08-16時点で、以下はすべて「前提となる決定事項」に合意済みのため未確定事項なし。

- ~~食品成分DBの具体的な入手元・形式（CSV配布の有無、ライセンス、更新頻度）~~ → 決定済み
- ~~`foods` への取り込み時のカテゴリ体系・食品名の正規化方針~~ → 決定済み
- ~~自由文章と `foods.name` のマッチング精度（表記ゆれ・同義語の扱い）~~ → 決定済み
- ~~`suggestions` の初期データ件数・カバーする栄養素の範囲~~ → 決定済み
- ~~`daily_nutrition_summaries` の算出タイミング（都度計算 / バッチ / 結果画面表示時のオンデマンド計算）~~ → 決定済み

---

## 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-08-15 | データ設計フェーズの成果物として初版作成 |
| 2026-08-16 | 旧「4. 未確定事項」5点についてユーザーと合意。`food_aliases` テーブルを追加し、ER図・テーブル定義を更新 |
| 2026-08-16 | 文部科学省「日本食品標準成分表2020年版（八訂）増補2023年」本表を取り込み（食品2,478件・栄養価12,233件）。CSV変換は行わず、ダウンロードしたExcelから直接SQLを生成する方式を採用。`foods`に再取り込み時の重複防止用`external_code`列を追加 |
