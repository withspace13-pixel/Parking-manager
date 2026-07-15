-- 설문 질문 타입 추가: 예/아니오/모르겠음, 객관식, NPS(0~10)
ALTER TABLE survey_questions
  DROP CONSTRAINT IF EXISTS survey_questions_question_type_check;

ALTER TABLE survey_questions
  ADD CONSTRAINT survey_questions_question_type_check
  CHECK (
    question_type IN (
      'scale',
      'scale_grid',
      'short',
      'long',
      'yes_no',
      'choice',
      'nps'
    )
  );
