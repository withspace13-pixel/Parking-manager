-- 담당자별 설문 스냅샷 (질문 변경·템플릿 적용 후에도 응답 보존)
ALTER TABLE survey_invites
  ADD COLUMN IF NOT EXISTS form_snapshot JSONB;

-- 응답은 스냅샷 질문 ID에 연결 — live 질문 삭제와 분리
ALTER TABLE survey_answers
  DROP CONSTRAINT IF EXISTS survey_answers_question_id_fkey;
