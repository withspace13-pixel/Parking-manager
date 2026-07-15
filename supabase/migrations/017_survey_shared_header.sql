-- 설문 상단 이미지 전역 공유 (템플릿마다 base64 중복 저장 방지)
CREATE TABLE IF NOT EXISTS survey_shared_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  header_image_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE survey_shared_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on survey_shared_settings" ON survey_shared_settings;
CREATE POLICY "Allow all on survey_shared_settings" ON survey_shared_settings
  FOR ALL USING (true) WITH CHECK (true);

-- 이미 올려 둔 이미지가 있으면 전역으로 이관
INSERT INTO survey_shared_settings (id, header_image_url, updated_at)
SELECT
  'default',
  COALESCE(
    (SELECT header_image_url FROM survey_campaign_settings
      WHERE header_image_url IS NOT NULL AND header_image_url <> ''
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1),
    (SELECT header_image_url FROM survey_question_templates
      WHERE header_image_url IS NOT NULL AND header_image_url <> ''
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1)
  ),
  now()
ON CONFLICT (id) DO UPDATE
SET
  header_image_url = COALESCE(survey_shared_settings.header_image_url, EXCLUDED.header_image_url),
  updated_at = now();

-- 템플릿에 박혀 있던 이미지 제거 (조회 시 egress 절감)
UPDATE survey_question_templates
SET header_image_url = NULL
WHERE header_image_url IS NOT NULL;
