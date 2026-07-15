# 객관식 설명 문구를 한 줄로 보이게 고치는 스크립트
from pathlib import Path
import re

path = Path(r"c:\Users\withspace\parking-manager\src\components\survey\SurveyQuestionsManager.tsx")
text = path.read_text(encoding="utf-8")

new_block_start = """            {q.questionType === "choice" && (
              <div className="mb-3 overflow-visible">
                <p className="mb-1 whitespace-nowrap text-xs text-[var(--text-muted)]">
                  선택지 (한 줄에 하나) · 「기타」 자동 추가
                </p>"""

pattern = re.compile(
    r'\{q\.questionType === "choice" && \(\s*<div className="mb-3">\s*<label className="mb-1 block text-xs text-\[var\(--text-muted\)\]">\s*선택지[^\n]*\s*</label>',
    re.MULTILINE,
)
m = pattern.search(text)
if not m:
    raise SystemExit("pattern not found")

path.write_text(pattern.sub(new_block_start, text, count=1), encoding="utf-8")
print("ok")
