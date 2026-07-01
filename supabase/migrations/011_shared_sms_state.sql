-- SMS 발송 관련 공유 상태 (전 PC 동기화)

-- 발송 전 기관명·담당자명·연락처 수정
CREATE TABLE IF NOT EXISTS sms_recipient_field_overrides (
  campaign TEXT NOT NULL CHECK (campaign IN ('survey', 'thank_you')),
  recipient_id TEXT NOT NULL,
  org_name TEXT,
  manager_name TEXT,
  phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign, recipient_id)
);

-- 캠페인 기간별 발송 완료 담당자
CREATE TABLE IF NOT EXISTS campaign_recipient_sent (
  campaign TEXT NOT NULL CHECK (campaign IN ('survey', 'thank_you')),
  campaign_key TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign, campaign_key, recipient_id)
);

-- 솔라피 발송 기록
CREATE TABLE IF NOT EXISTS sms_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign TEXT NOT NULL CHECK (campaign IN ('survey', 'thank_you')),
  campaign_key TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  manager_name TEXT NOT NULL DEFAULT '',
  org_name TEXT NOT NULL DEFAULT '',
  to_phone TEXT NOT NULL,
  message_id TEXT,
  status_code TEXT NOT NULL DEFAULT '2000',
  status_label TEXT NOT NULL DEFAULT '',
  status_message TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_send_logs_campaign_key
  ON sms_send_logs (campaign, campaign_key, sent_at DESC);

-- 기관명 자동완성 최근 사용
CREATE TABLE IF NOT EXISTS recent_org_names (
  name TEXT PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sms_recipient_field_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipient_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_send_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_org_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on sms_recipient_field_overrides" ON sms_recipient_field_overrides
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on campaign_recipient_sent" ON campaign_recipient_sent
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on sms_send_logs" ON sms_send_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on recent_org_names" ON recent_org_names
  FOR ALL USING (true) WITH CHECK (true);
