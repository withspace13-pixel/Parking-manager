"use client";

// 만족도 설문 질문 관리 (Google Form 스타일)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SurveyCampaignSettingsForm } from "@/components/survey/SurveyCampaignSettingsForm";
import { ScaleGridQuestionEditor } from "@/components/survey/ScaleGridQuestionEditor";
import { SurveyQuestionTemplateControls } from "@/components/survey/SurveyQuestionTemplateControls";
import {
  createSurveyQuestion,
  deleteSurveyQuestion,
  fetchSurveyQuestions,
  reorderSurveyQuestions,
  updateSurveyQuestion,
} from "@/lib/survey/survey-questions";
import { surveyCampaignSnapshotFingerprint } from "@/lib/survey/survey-template-fingerprint";
import type { SurveyTemplateApplyResult } from "@/lib/survey/survey-question-templates";
import {
  SURVEY_QUESTION_TYPE_LABEL,
  type SurveyCampaignSettings,
  type SurveyQuestion,
  type SurveyQuestionType,
} from "@/lib/survey/types";

type Props = {
  campaignKey: string;
};

const TYPE_OPTIONS: SurveyQuestionType[] = [
  "scale",
  "scale_grid",
  "yes_no",
  "choice",
  "nps",
  "short",
  "long",
];

export function SurveyQuestionsManager({ campaignKey }: Props) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [campaignSettings, setCampaignSettings] = useState<SurveyCampaignSettings | null>(null);
  const [templateFeedback, setTemplateFeedback] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsRefreshKey, setSettingsRefreshKey] = useState(0);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [settingsSyncToken, setSettingsSyncToken] = useState(0);
  const [settingsSyncPayload, setSettingsSyncPayload] = useState<SurveyCampaignSettings | null>(
    null
  );
  const isFirstLoad = useRef(true);

  const campaignReady = settingsHydrated && !initialLoading;

  const showTemplateFeedback = useCallback((message: string) => {
    setTemplateFeedback(message);
    window.setTimeout(() => setTemplateFeedback(null), 2500);
  }, []);

  const campaignFingerprint = useMemo(() => {
    if (!campaignSettings) return null;
    return surveyCampaignSnapshotFingerprint(campaignSettings, questions);
  }, [campaignSettings, questions]);

  const reload = useCallback(async () => {
    if (isFirstLoad.current) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      setQuestions(await fetchSurveyQuestions(supabase, campaignKey));
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
      isFirstLoad.current = false;
    }
  }, [campaignKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = async (type: SurveyQuestionType) => {
    setSaving(true);
    try {
      await createSurveyQuestion(
        supabase,
        campaignKey,
        {
          questionType: type,
          title:
            type === "nps"
              ? "위드스페이스를 주변에 추천할 의향이 있으신가요?"
              : type === "yes_no"
                ? "이번 행사에 만족하셨나요?"
                : type === "choice"
                  ? "가장 만족스러운 점은 무엇인가요?"
                  : "질문",
          required: true,
          scaleMinLabel:
            type === "scale" || type === "scale_grid"
              ? "매우 불만족"
              : type === "nps"
                ? "전혀 추천하지 않음"
                : null,
          scaleMaxLabel:
            type === "scale" || type === "scale_grid"
              ? "매우 만족"
              : type === "nps"
                ? "매우 추천함"
                : null,
          gridRows:
            type === "scale_grid"
              ? ["항목 1", "항목 2"]
              : type === "choice"
                ? ["선택지 1", "선택지 2", "선택지 3"]
                : [],
        },
        questions.length
      );
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "질문 추가 실패");
    } finally {
      setSaving(false);
    }
  };

  const patchQuestion = async (id: string, patch: Parameters<typeof updateSurveyQuestion>[3]) => {
    setSaving(true);
    try {
      await updateSurveyQuestion(supabase, campaignKey, id, patch);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= questions.length) return;
    const ids = questions.map((q) => q.id);
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    setSaving(true);
    try {
      await reorderSurveyQuestions(supabase, campaignKey, ids);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const refreshSurvey = useCallback(
    (sync?: SurveyTemplateApplyResult) => {
      if (sync) {
        setQuestions(sync.questions);
        setCampaignSettings(sync.settings);
        setSettingsSyncPayload(sync.settings);
        setSettingsSyncToken((token) => token + 1);
        return;
      }
      void reload();
      setSettingsRefreshKey((k) => k + 1);
    },
    [reload]
  );

  if (initialLoading) {
    return <p className="text-sm text-[var(--text-muted)]">질문 불러오는 중...</p>;
  }

  return (
    <div className="space-y-6">
      <SurveyQuestionTemplateControls
        campaignKey={campaignKey}
        campaignFingerprint={campaignFingerprint}
        campaignReady={campaignReady}
        campaignRefreshing={refreshing}
        onChanged={refreshSurvey}
        onFeedback={showTemplateFeedback}
      />
      {templateFeedback ? (
        <p className="text-xs font-medium text-emerald-700">{templateFeedback}</p>
      ) : null}
      <SurveyCampaignSettingsForm
        key={settingsRefreshKey}
        campaignKey={campaignKey}
        settingsSyncToken={settingsSyncToken}
        syncedSettings={settingsSyncPayload}
        onSettingsChange={setCampaignSettings}
        onHydratedChange={setSettingsHydrated}
      />

      {refreshing ? (
        <p className="text-xs text-[var(--text-muted)]">설문 내용 갱신 중...</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--text-muted)]">질문 추가</span>
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t}
            type="button"
            disabled={saving}
            onClick={() => void handleAdd(t)}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg)] disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            {SURVEY_QUESTION_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {questions.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--text-muted)]">
          등록된 질문이 없습니다. 위 버튼으로 질문을 추가하세요.
        </div>
      ) : (
        questions.map((q, idx) => (
          <div key={q.id} className="card border-l-4 border-l-[var(--primary)] p-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-muted)]">Q{idx + 1}</span>
                <select
                  value={q.questionType}
                  disabled={saving}
                  onChange={(e) =>
                    void patchQuestion(q.id, {
                      questionType: e.target.value as SurveyQuestionType,
                    })
                  }
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {SURVEY_QUESTION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0 || saving}
                  onClick={() => void move(idx, -1)}
                  className="rounded p-1 hover:bg-[var(--bg)] disabled:opacity-30"
                  aria-label="위로"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={idx === questions.length - 1 || saving}
                  onClick={() => void move(idx, 1)}
                  className="rounded p-1 hover:bg-[var(--bg)] disabled:opacity-30"
                  aria-label="아래로"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (!confirm("이 질문을 삭제할까요?")) return;
                    void deleteSurveyQuestion(supabase, campaignKey, q.id).then(reload);
                  }}
                  className="rounded p-1 text-red-600 hover:bg-red-50"
                  aria-label="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <input
              type="text"
              defaultValue={q.title}
              disabled={saving}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== q.title) void patchQuestion(q.id, { title: v });
              }}
              className="mb-3 w-full border-b border-[var(--border)] bg-transparent py-2 text-base font-medium outline-none focus:border-[var(--primary)]"
              placeholder="질문"
            />

            {(q.questionType === "scale" || q.questionType === "nps") && (
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  defaultValue={q.scaleMinLabel ?? ""}
                  placeholder={
                    q.questionType === "nps"
                      ? "0점 라벨 (예: 전혀 추천하지 않음)"
                      : "1점 라벨 (예: 매우 불만족)"
                  }
                  disabled={saving}
                  onBlur={(e) => void patchQuestion(q.id, { scaleMinLabel: e.target.value })}
                  className="rounded border border-[var(--border)] px-2 py-1.5 text-xs"
                />
                <input
                  type="text"
                  defaultValue={q.scaleMaxLabel ?? ""}
                  placeholder={
                    q.questionType === "nps"
                      ? "10점 라벨 (예: 매우 추천함)"
                      : "5점 라벨 (예: 매우 만족)"
                  }
                  disabled={saving}
                  onBlur={(e) => void patchQuestion(q.id, { scaleMaxLabel: e.target.value })}
                  className="rounded border border-[var(--border)] px-2 py-1.5 text-xs"
                />
              </div>
            )}

            {q.questionType === "scale_grid" && (
              <ScaleGridQuestionEditor
                question={q}
                saving={saving}
                onSave={(patch) => void patchQuestion(q.id, patch)}
              />
            )}

            {q.questionType === "choice" && (
              <div className="mb-3">
                <p className="mb-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  선택지 (한 줄에 하나) · 「기타」 자동 추가
                  <br />
                  응답자가 「기타」를 고르면 자유롭게 적을 수 있습니다.
                </p>
                <textarea
                  defaultValue={q.gridRows.join("\n")}
                  rows={4}
                  disabled={saving}
                  onBlur={(e) => {
                    const rows = e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .filter((s) => s !== "기타");
                    if (rows.join("\n") !== q.gridRows.filter((r) => r !== "기타").join("\n")) {
                      void patchQuestion(q.id, { gridRows: rows });
                    }
                  }}
                  placeholder={"선택지 1\n선택지 2\n선택지 3"}
                  className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs"
                />
              </div>
            )}

            {q.questionType === "yes_no" && (
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                응답 선택지: 예 / 아니오 / 모르겠음
              </p>
            )}

            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={q.required}
                disabled={saving}
                onChange={(e) => void patchQuestion(q.id, { required: e.target.checked })}
              />
              필수 응답
            </label>
          </div>
        ))
      )}
    </div>
  );
}
