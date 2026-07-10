-- 만족도 설문 캠페인 설정(상단 이미지·소개) 및 질문 템플릿

CREATE TABLE IF NOT EXISTS survey_campaign_settings (
  campaign_key TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  intro_text TEXT NOT NULL DEFAULT '',
  header_image_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_question_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  intro_text TEXT NOT NULL DEFAULT '',
  header_image_url TEXT,
  questions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE survey_campaign_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_question_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on survey_campaign_settings" ON survey_campaign_settings;
CREATE POLICY "Allow all on survey_campaign_settings" ON survey_campaign_settings
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on survey_question_templates" ON survey_question_templates;
CREATE POLICY "Allow all on survey_question_templates" ON survey_question_templates
  FOR ALL USING (true) WITH CHECK (true);
