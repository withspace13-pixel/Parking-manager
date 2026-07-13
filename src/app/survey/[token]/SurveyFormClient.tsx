"use client";

// 담당자용 공개 설문 응답 폼 (이름·기관 미표시)
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import { SurveyCompletionMessageView } from "@/components/survey/SurveyCompletionMessageView";
import { SurveyHeaderMedia } from "@/components/survey/SurveyHeaderMedia";
import {
  buildSurveyFormSnapshotFromTemplate,
  resolveSnapshotCampaignSettings,
  snapshotQuestionsToSurveyQuestions,
} from "@/lib/survey/survey-form-snapshot";
import { fetchSurveyQuestionTemplateById } from "@/lib/survey/survey-question-templates";
import { submitSurveyAnswers } from "@/lib/survey/survey-responses";
import { supabase } from "@/lib/supabase";
import type { SurveyAnswerInput, SurveyQuestion } from "@/lib/survey/types";
import {
  DEFAULT_SURVEY_CAMPAIGN_TITLE,
  DEFAULT_SURVEY_COMPLETION_MESSAGE,
  DEFAULT_SURVEY_INTRO_TEXT,
  SURVEY_LONG_MAX,
  SURVEY_SHORT_MAX,
} from "@/lib/survey/types";
import { resolveSurveyPageTitle } from "@/lib/survey/survey-page-title";

type CampaignHeader = {
  title: string;
  introText: string;
  headerImageUrl: string | null;
};

type PublicQuestion = Pick<
  SurveyQuestion,
  | "id"
  | "questionType"
  | "title"
  | "required"
  | "scaleMinLabel"
  | "scaleMaxLabel"
  | "gridRows"
>;

type Props = {
  token: string;
};

function ScaleInput({
  value,
  onChange,
  minLabel,
  maxLabel,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  minLabel?: string | null;
  maxLabel?: string | null;
  name: string;
}) {
  const leftLabel = minLabel || "매우 불만족";
  const rightLabel = maxLabel || "매우 만족";

  return (
    <div className="mt-5">
      <div className="mb-3 flex justify-between gap-4 text-base font-semibold leading-snug text-[var(--text)] sm:text-lg">
        <span className="max-w-[45%] text-left">{leftLabel}</span>
        <span className="max-w-[45%] text-right">{rightLabel}</span>
      </div>
      <div className="flex justify-between gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="flex flex-1 flex-col items-center gap-2.5 py-1"
          >
            <span className="text-xl font-bold tabular-nums text-[var(--text)] sm:text-2xl">
              {n}
            </span>
            <input
              type="radio"
              name={name}
              value={String(n)}
              checked={value === String(n)}
              onChange={() => onChange(String(n))}
              className="h-5 w-5 accent-[var(--primary)] sm:h-[1.35rem] sm:w-[1.35rem]"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function SurveyFormClient({ token }: Props) {
  const searchParams = useSearchParams();
  const previewTemplateId = searchParams.get("templateId")?.trim() ?? "";
  const isPreviewRequest = searchParams.get("preview") === "1" && Boolean(previewTemplateId);

  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [header, setHeader] = useState<CampaignHeader>({
    title: DEFAULT_SURVEY_CAMPAIGN_TITLE,
    introText: DEFAULT_SURVEY_INTRO_TEXT,
    headerImageUrl: null,
  });
  const [completionMessage, setCompletionMessage] = useState(DEFAULT_SURVEY_COMPLETION_MESSAGE);
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [useDevPath, setUseDevPath] = useState(false);

  const applyCompletionMessage = (raw: unknown) => {
    setCompletionMessage(
      typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_SURVEY_COMPLETION_MESSAGE
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSubmitted(false);
    setUseDevPath(false);
    setPreviewMode(false);
    setQuestions([]);
    setAnswers({});
    setCompletionMessage(DEFAULT_SURVEY_COMPLETION_MESSAGE);
    try {
      const devInvite = isDevMode() ? devSurveyStore.getInviteByToken(token) : null;
      if (devInvite && isPreviewRequest) {
        const tpl = await fetchSurveyQuestionTemplateById(supabase, previewTemplateId);
        if (!tpl) {
          setError("설문 템플릿을 찾을 수 없습니다.");
          return;
        }
        const snapshot = await buildSurveyFormSnapshotFromTemplate(
          supabase,
          devInvite.campaignKey,
          tpl,
          token
        );
        const settings = await resolveSnapshotCampaignSettings(
          supabase,
          devInvite.campaignKey,
          snapshot
        );
        setHeader({
          title: settings.title,
          introText: settings.introText,
          headerImageUrl: settings.headerImageUrl,
        });
        setQuestions(snapshotQuestionsToSurveyQuestions(snapshot, devInvite.campaignKey));
        setPreviewMode(true);
        return;
      }

      if (devInvite) {
        setUseDevPath(true);
        const settings = devSurveyStore.getCampaignSettings(devInvite.campaignKey);
        setCompletionMessage(settings.completionMessage);
        setHeader({
          title: settings.title,
          introText: settings.introText,
          headerImageUrl: settings.headerImageUrl,
        });
        if (devInvite.submittedAt) {
          setSubmitted(true);
          return;
        }
        const qs = devSurveyStore.getQuestions(devInvite.campaignKey);
        setQuestions(qs);
        return;
      }

      const apiUrl = isPreviewRequest
        ? `/api/survey/${token}?preview=1&templateId=${encodeURIComponent(previewTemplateId)}`
        : `/api/survey/${token}`;
      const res = await fetch(apiUrl);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "설문을 불러올 수 없습니다.");
        return;
      }
      if (data.preview) setPreviewMode(true);
      if (data.submitted) {
        setSubmitted(true);
        if (data.settings) {
          setHeader({
            title: data.settings.title || DEFAULT_SURVEY_CAMPAIGN_TITLE,
            introText: data.settings.introText || DEFAULT_SURVEY_INTRO_TEXT,
            headerImageUrl: data.settings.headerImageUrl ?? null,
          });
          applyCompletionMessage(data.settings?.completionMessage);
        }
        return;
      }
      if (data.settings) {
        setHeader({
          title: data.settings.title || DEFAULT_SURVEY_CAMPAIGN_TITLE,
          introText: data.settings.introText || DEFAULT_SURVEY_INTRO_TEXT,
          headerImageUrl: data.settings.headerImageUrl ?? null,
        });
        applyCompletionMessage(data.settings.completionMessage);
      }
      setQuestions(data.questions ?? []);
    } catch {
      setError("설문을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [token, isPreviewRequest, previewTemplateId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    document.title = resolveSurveyPageTitle(header.title);
  }, [header.title, loading]);

  const setAnswer = (questionId: string, rowKey: string | null, value: string) => {
    setAnswers((prev) => {
      const key = rowKey ?? "";
      const next = { ...prev };
      next[questionId] = { ...(next[questionId] ?? {}), [key]: value };
      return next;
    });
  };

  const getAnswer = (questionId: string, rowKey: string | null) => {
    const key = rowKey ?? "";
    return answers[questionId]?.[key] ?? "";
  };

  const buildPayload = (serverQuestions: PublicQuestion[]) => {
    const payload: SurveyAnswerInput[] = [];
    for (let i = 0; i < serverQuestions.length; i++) {
      const q = serverQuestions[i]!;
      const sourceId = questions[i]?.id ?? q.id;

      if (q.questionType === "scale_grid") {
        const rows = q.gridRows.length > 0 ? q.gridRows : ["항목"];
        for (const row of rows) {
          const val = getAnswer(sourceId, row);
          if (val) payload.push({ questionId: q.id, rowKey: row, value: val });
        }
      } else {
        const val = getAnswer(sourceId, null);
        if (val) payload.push({ questionId: q.id, rowKey: null, value: val });
      }
    }
    return payload;
  };

  const handleSubmit = async () => {
    if (previewMode) return;

    let activeQuestions = questions;
    try {
      const res = await fetch(`/api/survey/${token}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.questions) && data.questions.length > 0) {
        activeQuestions = data.questions as PublicQuestion[];
      }
    } catch {
      // 제출은 기존 질문 목록으로 시도
    }

    const payload = buildPayload(activeQuestions);

    setSubmitting(true);
    setError(null);
    try {
      if (useDevPath || (isDevMode() && devSurveyStore.getInviteByToken(token))) {
        await submitSurveyAnswers(supabase, token, payload);
      } else {
        const res = await fetch(`/api/survey/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "제출에 실패했습니다.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0ebe3] p-6">
        <p className="text-[var(--text-muted)]">설문을 불러오는 중...</p>
      </div>
    );
  }

  if (error && questions.length === 0 && !submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0ebe3] p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0ebe3] p-6">
        <div className="card max-w-lg p-6 sm:p-10">
          <SurveyCompletionMessageView message={completionMessage} variant="mobile" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0ebe3] py-10 px-4">
      <div className="mx-auto max-w-2xl">
        {previewMode ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">미리보기 모드</p>
            <p className="mt-1 text-xs leading-relaxed">
              선택한 설문 템플릿을 확인하는 화면입니다. 응답은 저장되지 않으며 제출할 수 없습니다.
            </p>
          </div>
        ) : null}
        <div className="mb-6 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
          {header.headerImageUrl ? (
            <div className="border-b border-[var(--border)]">
              <SurveyHeaderMedia url={header.headerImageUrl} variant="cover" className="w-full" />
            </div>
          ) : null}
          <div className="border-t-4 border-t-[var(--primary)] p-6">
            <h1 className="text-2xl font-bold text-[var(--text)]">{header.title}</h1>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-muted)]">
              {header.introText}
            </p>
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              {previewMode
                ? "미리보기에서는 제출할 수 없습니다."
                : "제출 후에는 수정할 수 없습니다."}
            </p>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="card p-8 text-center text-[var(--text-muted)]">
            아직 등록된 질문이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="rounded-lg border border-[var(--border)] bg-white p-6 shadow-sm"
              >
                <p className="text-base font-medium text-[var(--text)]">
                  {q.title}
                  {q.required && <span className="ml-1 text-red-500">*</span>}
                </p>

                {q.questionType === "scale" && (
                  <ScaleInput
                    name={`q-${q.id}`}
                    value={getAnswer(q.id, null)}
                    onChange={(v) => setAnswer(q.id, null, v)}
                    minLabel={q.scaleMinLabel}
                    maxLabel={q.scaleMaxLabel}
                  />
                )}

                {q.questionType === "scale_grid" && (
                  <div className="mt-4 space-y-6">
                    {(q.gridRows.length > 0 ? q.gridRows : ["항목"]).map((row) => (
                      <div key={row} className="border-t border-[var(--border)] pt-4 first:border-0 first:pt-0">
                        <p className="mb-2 text-sm font-medium text-[var(--text)]">{row}</p>
                        <ScaleInput
                          name={`q-${q.id}-${row}`}
                          value={getAnswer(q.id, row)}
                          onChange={(v) => setAnswer(q.id, row, v)}
                          minLabel={q.scaleMinLabel}
                          maxLabel={q.scaleMaxLabel}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {q.questionType === "short" && (
                  <input
                    type="text"
                    maxLength={SURVEY_SHORT_MAX}
                    value={getAnswer(q.id, null)}
                    onChange={(e) => setAnswer(q.id, null, e.target.value)}
                    className="mt-4 w-full border-b border-dashed border-[var(--border)] bg-transparent py-2 text-sm outline-none focus:border-[var(--primary)]"
                    placeholder="단답형 텍스트"
                  />
                )}

                {q.questionType === "long" && (
                  <textarea
                    maxLength={SURVEY_LONG_MAX}
                    rows={4}
                    value={getAnswer(q.id, null)}
                    onChange={(e) => setAnswer(q.id, null, e.target.value)}
                    className="mt-4 w-full resize-y rounded-md border border-[var(--border)] p-3 text-sm outline-none focus:border-[var(--primary)]"
                    placeholder="장문형 텍스트"
                  />
                )}

                {(q.questionType === "short" || q.questionType === "long") && (
                  <p className="mt-1 text-right text-xs text-[var(--text-muted)]">
                    {getAnswer(q.id, null).length}/
                    {q.questionType === "short" ? SURVEY_SHORT_MAX : SURVEY_LONG_MAX}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

        {questions.length > 0 && !previewMode ? (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="btn btn-primary px-8 py-2.5 text-sm disabled:opacity-50"
            >
              {submitting ? "제출 중..." : "제출"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
