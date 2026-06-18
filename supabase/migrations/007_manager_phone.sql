-- 담당자 휴대폰 번호
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_phone TEXT;
