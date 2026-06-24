-- 담당자 연락처 마스터 (행사 삭제와 무관하게 유지)
CREATE TABLE IF NOT EXISTS manager_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  org_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (name, org_name)
);

ALTER TABLE manager_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on manager_contacts" ON manager_contacts
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_manager_contacts_name ON manager_contacts (name);
