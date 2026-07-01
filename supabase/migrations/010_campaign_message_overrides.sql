-- 감사문자·만족도 조사 월별 일괄·담당자별 개별 문구 (전 PC 공유)
CREATE TABLE IF NOT EXISTS campaign_message_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign TEXT NOT NULL CHECK (campaign IN ('survey', 'thank_you')),
  campaign_key TEXT NOT NULL,
  recipient_id TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign, campaign_key, recipient_id)
);

ALTER TABLE campaign_message_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on campaign_message_overrides" ON campaign_message_overrides
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_campaign_message_overrides_campaign
  ON campaign_message_overrides (campaign);

CREATE INDEX IF NOT EXISTS idx_campaign_message_overrides_key
  ON campaign_message_overrides (campaign, campaign_key);
