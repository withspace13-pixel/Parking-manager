-- parking_support을 미정(△)을 표현하기 위해 NULL 허용
-- 기존 데이터는 false(O)로 유지됨 (default는 null이 될 수 있음)

ALTER TABLE projects
  ALTER COLUMN parking_support DROP NOT NULL;

