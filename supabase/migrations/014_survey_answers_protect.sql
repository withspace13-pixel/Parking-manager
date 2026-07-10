-- 질문 삭제 시 응답이 연쇄 삭제되지 않도록 보호 (응답이 있으면 질문 삭제 차단)
ALTER TABLE survey_answers
  DROP CONSTRAINT IF EXISTS survey_answers_question_id_fkey;

ALTER TABLE survey_answers
  ADD CONSTRAINT survey_answers_question_id_fkey
  FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE RESTRICT;
