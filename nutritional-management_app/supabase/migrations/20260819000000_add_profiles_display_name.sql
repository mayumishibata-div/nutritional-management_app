-- profilesテーブルに表示用のお名前（ニックネーム）を保持する列を追加する。
-- 既存ユーザーの行には値が入っていないため、NOT NULL制約は付けない。

alter table profiles add column display_name text;
