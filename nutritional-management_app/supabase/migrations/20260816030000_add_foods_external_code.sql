-- foodsテーブルに公的食品成分DBの食品番号を保持する列を追加する。
-- 将来データを再取り込みする際に、この列をキーとして重複登録を防ぐ（ON CONFLICT対象）。

alter table foods add column external_code text unique;
