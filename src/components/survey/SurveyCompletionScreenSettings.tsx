"use client";

// 만족도 설문 제출 완료 화면 문구 편집·미리보기
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SurveyCompletionMessageView } from "@/components/survey/SurveyCompletionMessageView";
import {
  fetchSurveyCampaignSettings,
  upsertSurveyCampaignSettings,
} from "@/lib/survey/survey-campaign-settings";
import { formatSurveyCampaignMonthLabel } from "@/lib/survey-messaging";
import {
  DEFAULT_SURVEY_COMPLETION_MESSAGE,
  type SurveyCampaignSettings,
} from "@/lib/survey/types";

type Props = {
  campaignKey: string;
};

export function SurveyCompletionScreenSettings({ campaignKey }: Props) {
  const [settings, setSettings] = useState<SurveyCampaignSettings | null>(null);
  const [draft, setDraft] = useState(DEFAULT_SURVEY_COMPLETION_MESSAGE);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const s = await fetchSurveyCampaignSettings(supabase, campaignKey, {
      includeHeader: false,
    });
    setSettings(s);
    setDraft(s.completionMessage);
  }, [campaignKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSave = async () => {
    if (!settings) return;
    const next = { ...settings, completionMessage: draft.trim() || DEFAULT_SURVEY_COMPLETION_MESSAGE };
    setSaving(true);
    try {
      await upsertSurveyCampaignSettings(supabase, next);
      setSettings(next);
      setDraft(next.completionMessage);
      setSavedNotice("저장되었습니다.");
      window.setTimeout(() => setSavedNotice(null), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <p className="text-sm text-[var(--text-muted)]">불러오는 중...</p>;
  }

  const previewMessage = draft.trim() || DEFAULT_SURVEY_COMPLETION_MESSAGE;

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--text-muted)]">
        {formatSurveyCampaignMonthLabel(campaignKey)} 설문 제출 직후 담당자에게 보이는 완료 화면
        문구입니다. 첫 줄은 제목, 이후 줄은 본문으로 표시됩니다.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text)]">완료 문구</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full resize-y rounded-lg border border-[var(--border)] p-3 text-sm leading-relaxed outline-none focus:border-[var(--primary)]"
            placeholder={DEFAULT_SURVEY_COMPLETION_MESSAGE}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {savedNotice ? (
              <span className="text-xs font-medium text-emerald-600">{savedNotice}</span>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--text)]">미리보기</p>
          <div className="rounded-lg border border-[var(--border)] bg-[#f0ebe3] p-6">
            <div className="card mx-auto max-w-lg p-10">
              <SurveyCompletionMessageView message={previewMessage} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
