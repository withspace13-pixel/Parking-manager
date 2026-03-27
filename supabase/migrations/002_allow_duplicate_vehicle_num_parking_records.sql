-- 같은 프로젝트/일자에서 동일 차량 뒷자리(4자리) 중복 입력 허용
-- 기존 UNIQUE(project_id, vehicle_num, date) 제약 제거
ALTER TABLE parking_records
DROP CONSTRAINT IF EXISTS parking_records_project_id_vehicle_num_date_key;

-- 조회 성능을 위해 비고유 인덱스는 유지/보강
CREATE INDEX IF NOT EXISTS idx_parking_records_project_date_vehicle
ON parking_records(project_id, date, vehicle_num);
