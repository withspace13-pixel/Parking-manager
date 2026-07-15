"use client";

// 5점 척도 그리드 행·열 편집과 설문 화면 미리보기
import { useEffect, useMemo, useState } from "react";
import type { SurveyQuestion } from "@/lib/survey/types";

type Props = {
  question: SurveyQuestion;
  saving: boolean;
  onSave: (patch: {
    scaleMinLabel?: string | null;
    scaleMaxLabel?: string | null;
    gridRows?: string[];
  }) => void;
};

function parseRows(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ScaleGridQuestionEditor({ question, saving, onSave }: Props) {
  const [draftRows, setDraftRows] = useState(question.gridRows.join("\n"));
  const [minLabel, setMinLabel] = useState(question.scaleMinLabel ?? "");
  const [maxLabel, setMaxLabel] = useState(question.scaleMaxLabel ?? "");

  useEffect(() => {
    setDraftRows(question.gridRows.join("\n"));
    setMinLabel(question.scaleMinLabel ?? "");
    setMaxLabel(question.scaleMaxLabel ?? "");
  }, [question.id, question.gridRows, question.scaleMinLabel, question.scaleMaxLabel]);

  const rows = useMemo(() => {
    const parsed = parseRows(draftRows);
    return parsed.length > 0 ? parsed : ["항목 예시"];
  }, [draftRows]);

  const leftLabel = minLabel.trim() || "매우 불만족";
  const rightLabel = maxLabel.trim() || "매우 만족";

  const persistRows = () => {
    const next = parseRows(draftRows);
    if (next.join("\n") !== question.gridRows.join("\n")) {
      onSave({ gridRows: next });
    }
  };

  return (
    <div className="mb-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] text-[var(--text-muted)]">1점(왼쪽) 라벨</label>
          <input
            type="text"
            value={minLabel}
            disabled={saving}
            placeholder="매우 불만족"
            onChange={(e) => setMinLabel(e.target.value)}
            onBlur={() => {
              if ((minLabel || "") !== (question.scaleMinLabel ?? "")) {
                onSave({ scaleMinLabel: minLabel });
              }
            }}
            className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[var(--text-muted)]">5점(오른쪽) 라벨</label>
          <input
            type="text"
            value={maxLabel}
            disabled={saving}
            placeholder="매우 만족"
            onChange={(e) => setMaxLabel(e.target.value)}
            onBlur={() => {
              if ((maxLabel || "") !== (question.scaleMaxLabel ?? "")) {
                onSave({ scaleMaxLabel: maxLabel });
              }
            }}
            className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--text-muted)]">
          행 항목 (한 줄에 하나) — 열은 항상 1~5점
        </label>
        <textarea
          value={draftRows}
          rows={4}
          disabled={saving}
          onChange={(e) => setDraftRows(e.target.value)}
          onBlur={persistRows}
          placeholder={"시설 이용 만족도\n직원 응대 만족도\n전체 만족도"}
          className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
          열에 1~5를 직접 넣지 마세요. 행에만 평가할 항목 이름을 적으면, 설문에서는 각 행마다
          1~5점 라디오가 생깁니다.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[#F8FAFC] p-3">
        <p className="mb-2 text-[11px] font-semibold text-[var(--text)]">설문 화면 미리보기 (모바일)</p>
        <div className="mx-auto max-w-[360px] rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
          <p className="text-base font-bold leading-snug text-[var(--text)]">
            <span className="mr-1 text-[var(--primary)]">Q.</span>
            {question.title || "질문"}
            {question.required ? <span className="ml-1 text-red-500">*</span> : null}
          </p>
          <div className="mt-3 space-y-3">
            {rows.map((row) => (
              <div
                key={row}
                className="rounded-lg border border-[var(--border)] bg-[#FAFAFA] px-3 py-2.5"
              >
                <p className="text-sm font-bold text-[var(--text)]">{row}</p>
                <div className="mb-1.5 mt-2 flex justify-between gap-2 text-[10px] font-medium text-[var(--text-muted)]">
                  <span className="max-w-[45%] text-left">{leftLabel}</span>
                  <span className="max-w-[45%] text-right">{rightLabel}</span>
                </div>
                <div className="flex justify-between gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{n}</span>
                      <span className="h-3 w-3 rounded-full border-2 border-[var(--border)]" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
