-- 프로젝트(행사)별 정산 무료 대수 (1~5, 기본 1)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS free_cars_per_day INTEGER NOT NULL DEFAULT 1;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_free_cars_per_day_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_free_cars_per_day_check
  CHECK (free_cars_per_day >= 1 AND free_cars_per_day <= 5);
