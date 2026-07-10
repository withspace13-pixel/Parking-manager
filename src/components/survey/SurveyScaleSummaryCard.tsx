// 5점 척도 평균·분포 세로 막대 그래프 카드
import type { SurveyScaleSummary } from "@/lib/survey/survey-responses";

type Props = {
  summary: SurveyScaleSummary;
};

const SCORES = [1, 2, 3, 4, 5] as const;

export function SurveyScaleSummaryCard({ summary }: Props) {
  const counts = SCORES.map((n) => summary.distribution[String(n)] ?? 0);
  const total = summary.count;
  const maxCount = Math.max(...counts, 1);

  return (
    <div className="card p-4">
      <p className="text-sm font-medium text-[var(--text)]">
        {summary.title}
        {summary.rowKey ? ` · ${summary.rowKey}` : ""}
      </p>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-[var(--primary)]">
          {total > 0 ? summary.average.toFixed(1) : "—"}
        </span>
        {total > 0 ? (
          <span className="text-sm font-medium text-[var(--text-muted)]">(5점 만점)</span>
        ) : null}
      </div>

      <p className="mt-1 text-xs text-[var(--text-muted)]">총 {total}명 응답</p>

      <div className="mt-4">
        <div className="flex items-end justify-between gap-2 sm:gap-3">
          {SCORES.map((score, idx) => {
            const count = counts[idx]!;
            const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={score} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
                  {count}
                </span>
                <div className="flex h-16 w-full items-end justify-center sm:h-20">
                  <div
                    className="w-[55%] max-w-10 rounded-t bg-[var(--primary)] transition-all"
                    style={{ height: `${heightPct}%`, minHeight: count > 0 ? "4px" : 0 }}
                  />
                </div>
                <span className="text-sm font-medium text-[var(--text-muted)]">{score}점</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
