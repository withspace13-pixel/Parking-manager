// 5점 척도·NPS 평균·분포 세로 막대 그래프 카드
import type { SurveyScaleSummary } from "@/lib/survey/survey-responses";

type Props = {
  summary: SurveyScaleSummary;
};

export function SurveyScaleSummaryCard({ summary }: Props) {
  const isNps = summary.type === "nps";
  const scores = isNps
    ? ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const)
    : ([1, 2, 3, 4, 5] as const);
  const counts = scores.map((n) => summary.distribution[String(n)] ?? 0);
  const total = summary.count;
  const maxCount = Math.max(...counts, 1);
  const maxLabel = isNps ? "(10점 만점)" : "(5점 만점)";

  return (
    <div className="card p-4">
      <p className="text-sm font-medium text-[var(--text)]">
        {summary.title}
        {summary.rowKey ? ` · ${summary.rowKey}` : ""}
        {isNps ? " · NPS" : ""}
      </p>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-[var(--primary)]">
          {total > 0 ? summary.average.toFixed(1) : "—"}
        </span>
        {total > 0 ? (
          <span className="text-sm font-medium text-[var(--text-muted)]">{maxLabel}</span>
        ) : null}
      </div>

      <p className="mt-1 text-xs text-[var(--text-muted)]">총 {total}명 응답</p>

      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-[280px] items-end justify-between gap-1 sm:gap-2">
          {scores.map((score, idx) => {
            const count = counts[idx]!;
            const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={score} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text)] sm:text-sm">
                  {count}
                </span>
                <div className="flex h-14 w-full items-end justify-center sm:h-20">
                  <div
                    className="w-[55%] max-w-8 rounded-t bg-[var(--primary)] transition-all"
                    style={{ height: `${heightPct}%`, minHeight: count > 0 ? "4px" : 0 }}
                  />
                </div>
                <span className="text-[10px] font-medium text-[var(--text-muted)] sm:text-xs">
                  {score}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
