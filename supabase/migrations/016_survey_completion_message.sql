-- 설문 제출 완료 화면 문구 (캠페인·월별)
ALTER TABLE survey_campaign_settings
  ADD COLUMN IF NOT EXISTS completion_message TEXT NOT NULL DEFAULT '';
