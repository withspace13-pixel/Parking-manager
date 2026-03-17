-- 주차권 관리 프로그램 초기 스키마
-- Supabase SQL Editor에서 실행하세요.

-- 프로젝트 (기관/담당자 단위)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name TEXT NOT NULL,
  manager TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  parking_support BOOLEAN NOT NULL DEFAULT false,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 프로젝트별 일자별 룸
CREATE TABLE IF NOT EXISTS project_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  room_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, date)
);

-- 주차 발급 기록 (차량별, 일자별, 권종별)
CREATE TABLE IF NOT EXISTS parking_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vehicle_num TEXT NOT NULL,
  date DATE NOT NULL,
  all_day_cnt INTEGER NOT NULL DEFAULT 0,
  "2h_cnt" INTEGER NOT NULL DEFAULT 0,
  "1h_cnt" INTEGER NOT NULL DEFAULT 0,
  "30m_cnt" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, vehicle_num, date)
);

-- RLS 정책 (선택: 필요시 활성화)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_records ENABLE ROW LEVEL SECURITY;

-- 모든 작업 허용 정책 (개발/단일 사용자용)
CREATE POLICY "Allow all on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on project_rooms" ON project_rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on parking_records" ON parking_records FOR ALL USING (true) WITH CHECK (true);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_project_rooms_project_date ON project_rooms(project_id, date);
CREATE INDEX IF NOT EXISTS idx_parking_records_project_date ON parking_records(project_id, date);
CREATE INDEX IF NOT EXISTS idx_parking_records_vehicle ON parking_records(project_id, vehicle_num, date);
