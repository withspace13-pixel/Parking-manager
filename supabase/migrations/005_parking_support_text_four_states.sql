-- O/X/미정/확인 필요 4상태: boolean → text
-- 기존: true→yes, false→no, NULL→undecided

ALTER TABLE projects
  ALTER COLUMN parking_support TYPE text
  USING (
    CASE
      WHEN parking_support IS TRUE THEN 'yes'
      WHEN parking_support IS FALSE THEN 'no'
      ELSE 'undecided'
    END
  );

ALTER TABLE projects
  ALTER COLUMN parking_support SET DEFAULT 'no';

ALTER TABLE projects
  ALTER COLUMN parking_support SET NOT NULL;

ALTER TABLE projects
  ADD CONSTRAINT projects_parking_support_enum
  CHECK (parking_support IN ('yes', 'no', 'undecided', 'needs_check'));
