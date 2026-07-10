"use client";

// 만족도 설문 응답률·척도·단답/장문 요약
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchRecipientSentIds } from "@/lib/recipient-sent-storage";
import { fetchSurveyInvitesWithAnswers } from "@/lib/survey/survey-invites";
import { buildSurveySummary } from "@/lib/survey/survey-responses";
import { downloadSurveySummaryPdf } from "@/lib/survey/survey-summary-pdf";
import { formatSurveyCampaignMonthLabel } from "@/lib/survey-messaging";
import { SurveyScaleSummaryCard } from "@/components/survey/SurveyScaleSummaryCard";

type Props = {
  campaignKey: string;
};

export function SurveySummaryView({ campaignKey }: Props) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof fetchSurveyInvitesWithAnswers>>>([]);
  const [sentCount, setSentCount] = useState(0);
  const [summary, setSummary] = useState<ReturnType<typeof buildSurveySummary> | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, sentIds] = await Promise.all([
        fetchSurveyInvitesWithAnswers(supabase, campaignKey),
        fetchRecipientSentIds(supabase, "survey", campaignKey),
      ]);
      setInvites(inv);
      setSentCount(sentIds.size);
      setSummary(buildSurveySummary(inv, sentIds.size));
    } finally {
      setLoading(false);
    }
  }, [campaignKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const textAnswersByQuestion = useMemo(() => {
    const submitted = invites.filter((i) => i.submittedAt && i.answers.length > 0);
    const buckets = new Map<
      string,
      { title: string; rows: Array<{ orgName: string; managerName: string; value: string }> }
    >();

    for (const inv of submitted) {
      const textQs =
        inv.formSnapshot?.questions.filter(
          (q) => q.questionType === "short" || q.questionType === "long"
        ) ?? [];
      for (const q of textQs) {
        const a = inv.answers.find(
          (x) => x.questionId === q.id && (x.rowKey == null || x.rowKey === "")
        );
        if (!a?.value.trim()) continue;
        const bucket = buckets.get(q.title) ?? { title: q.title, rows: [] };
        bucket.rows.push({
          orgName: inv.orgName,
          managerName: inv.managerName,
          value: a.value.trim(),
        });
        buckets.set(q.title, bucket);
      }
    }

    return Array.from(buckets.values());
  }, [invites]);

  const handlePdfDownload = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      await downloadSurveySummaryPdf(exportRef.current, campaignKey);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 저장에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">요약 불러오는 중...</p>;
  }

  if (!summary) return null;

  const monthLabel = formatSurveyCampaignMonthLabel(campaignKey);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handlePdfDownload()}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? "PDF 저장 중…" : "PDF 저장"}
        </button>
      </div>

      <div ref={exportRef} className="space-y-6 bg-white p-1">
        <div className="border-b border-[var(--border)] pb-4">
          <h4 className="text-lg font-bold text-[var(--text)]">만족도조사 요약</h4>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{monthLabel} 대상</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">문자 발송</p>
            <p className="mt-1 text-2xl font-bold">{sentCount}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">응답 완료</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{summary.submittedCount}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">응답률 (발송 대비)</p>
            <p className="mt-1 text-2xl font-bold">{summary.responseRate.toFixed(1)}%</p>
          </div>
        </div>

        {summary.scaleSummaries.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-[var(--text)]">5점 척도 요약</h4>
            {summary.scaleSummaries.map((s, i) => (
              <SurveyScaleSummaryCard key={`${s.questionId}-${s.rowKey ?? ""}-${i}`} summary={s} />
            ))}
          </div>
        )}

        {textAnswersByQuestion.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-[var(--text)]">단답·장문 응답</h4>
            {textAnswersByQuestion.map(({ title, rows }) => (
              <div key={title} className="card p-4">
                <p className="text-sm font-medium text-[var(--text)]">{title}</p>
                {rows.length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">아직 응답이 없습니다.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {rows.map((row, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-[var(--border)] bg-[var(--bg)]/40 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-[var(--text)]">
                          {row.orgName} / {row.managerName}
                        </span>
                        <p className="mt-1 whitespace-pre-wrap text-[var(--text-muted)]">
                          {row.value}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
