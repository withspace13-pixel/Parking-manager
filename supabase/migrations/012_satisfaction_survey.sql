-- 만족도 설문 (질문·초대 토큰·응답)

CREATE TABLE IF NOT EXISTS survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  question_type TEXT NOT NULL CHECK (question_type IN ('scale', 'scale_grid', 'short', 'long')),
  title TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  scale_min_label TEXT,
  scale_max_label TEXT,
  grid_rows JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_questions_campaign
  ON survey_questions (campaign_key, sort_order);

CREATE TABLE IF NOT EXISTS survey_invites (
  token TEXT PRIMARY KEY,
  campaign_key TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  manager_name TEXT NOT NULL DEFAULT '',
  org_name TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_key, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_invites_campaign
  ON survey_invites (campaign_key);

CREATE TABLE IF NOT EXISTS survey_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token TEXT NOT NULL REFERENCES survey_invites(token) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  row_key TEXT,
  answer_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invite_token, question_id, row_key)
);

CREATE INDEX IF NOT EXISTS idx_survey_answers_invite
  ON survey_answers (invite_token);

ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on survey_questions" ON survey_questions;
CREATE POLICY "Allow all on survey_questions" ON survey_questions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on survey_invites" ON survey_invites;
CREATE POLICY "Allow all on survey_invites" ON survey_invites
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on survey_answers" ON survey_answers;
CREATE POLICY "Allow all on survey_answers" ON survey_answers
  FOR ALL USING (true) WITH CHECK (true);
