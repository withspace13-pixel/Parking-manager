-- 기관(프로젝트)별 행사명 저장 컬럼 추가
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS event_name TEXT;
