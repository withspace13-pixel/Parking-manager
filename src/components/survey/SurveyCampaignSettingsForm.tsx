"use client";

// 만족도 설문 상단 제목·소개·헤더 파일 설정 (Google Form 스타일)
import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, ImageIcon, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SurveyHeaderMedia } from "@/components/survey/SurveyHeaderMedia";
import {
  fetchSurveyCampaignSettings,
  upsertSurveyCampaignSettings,
} from "@/lib/survey/survey-campaign-settings";
import {
  fetchSurveySharedHeaderImage,
  upsertSurveySharedHeaderImage,
} from "@/lib/survey/survey-shared-settings";
import {
  readSurveyHeaderFile,
  SURVEY_HEADER_MAX_BYTES,
  surveyHeaderFileLabel,
} from "@/lib/survey/header-media";
import { formatSurveyCampaignMonthLabel } from "@/lib/survey-messaging";
import type { SurveyCampaignSettings } from "@/lib/survey/types";

type Props = {
  campaignKey: string;
  settingsSyncToken?: number;
  syncedSettings?: SurveyCampaignSettings | null;
  onSaved?: () => void;
  onSettingsChange?: (settings: SurveyCampaignSettings) => void;
  onHydratedChange?: (hydrated: boolean) => void;
};

export function SurveyCampaignSettingsForm({
  campaignKey,
  settingsSyncToken = 0,
  syncedSettings = null,
  onSaved,
  onSettingsChange,
  onHydratedChange,
}: Props) {
  const [settings, setSettings] = useState<SurveyCampaignSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [headerLoading, setHeaderLoading] = useState(false);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const publishSettings = useCallback(
    (next: SurveyCampaignSettings) => {
      setSettings(next);
      onSettingsChange?.(next);
    },
    [onSettingsChange]
  );

  const reload = useCallback(async () => {
    const s = await fetchSurveyCampaignSettings(supabase, campaignKey, { includeHeader: false });
    publishSettings(s);
    setFileLabel(null);
    setHeaderLoading(true);
    try {
      const header = await fetchSurveySharedHeaderImage(supabase);
      if (header) {
        publishSettings({ ...s, headerImageUrl: header });
        setFileLabel("업로드됨");
      }
    } finally {
      setHeaderLoading(false);
    }
  }, [campaignKey, publishSettings]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!syncedSettings || settingsSyncToken === 0) return;
    publishSettings(syncedSettings);
    setFileLabel(syncedSettings.headerImageUrl ? "업로드됨" : null);
    setHeaderLoading(false);
  }, [settingsSyncToken, syncedSettings, publishSettings]);

  useEffect(() => {
    onHydratedChange?.(settings !== null && !headerLoading);
  }, [settings, headerLoading, onHydratedChange]);

  const persist = async (next: SurveyCampaignSettings) => {
    setSaving(true);
    try {
      // 제목·소개는 월별, 상단 이미지는 전역 공유
      await Promise.all([
        upsertSurveyCampaignSettings(supabase, { ...next, headerImageUrl: null }),
        upsertSurveySharedHeaderImage(supabase, next.headerImageUrl),
      ]);
      publishSettings(next);
      onSaved?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file || !settings) return;
    setSaving(true);
    try {
      const dataUrl = await readSurveyHeaderFile(file);
      const next = { ...settings, headerImageUrl: dataUrl };
      await persist(next);
      setFileLabel(`${file.name} (${surveyHeaderFileLabel(file.type)})`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "파일 업로드 실패");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemoveFile = async () => {
    if (!settings) return;
    const next = { ...settings, headerImageUrl: null };
    await persist(next);
    setFileLabel(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!settings) {
    return <p className="text-sm text-[var(--text-muted)]">설문 정보 불러오는 중...</p>;
  }

  const monthLabel = formatSurveyCampaignMonthLabel(campaignKey);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-dashed border-[var(--primary)]/50 bg-[#EFF6FF] p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
              <ImageIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">공통 상단 이미지</p>
              <p className="text-xs text-[var(--text-muted)]">
                모든 설문 템플릿에 동일 적용 · JPEG · PNG · PDF
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              className="hidden"
              disabled={saving}
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--primary)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] shadow-sm hover:bg-[#DBEAFE] disabled:opacity-50"
            >
              <FileUp className="h-4 w-4" />
              이미지 선택
            </button>
            {settings.headerImageUrl ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleRemoveFile()}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                제거
              </button>
            ) : null}
          </div>
        </div>
        {fileLabel ? (
          <p className="mb-3 text-xs font-medium text-[var(--primary)]">{fileLabel}</p>
        ) : null}
        <p className="text-xs text-[var(--text-muted)]">
          최대 {Math.round(SURVEY_HEADER_MAX_BYTES / 1024)}KB
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
        {settings.headerImageUrl ? (
          <div className="border-b border-[var(--border)] bg-[var(--bg)] p-4">
            <SurveyHeaderMedia
              url={settings.headerImageUrl}
              imageClassName="mx-auto max-h-40 w-full max-w-md object-contain"
            />
          </div>
        ) : headerLoading ? (
          <div className="flex h-28 w-full items-center justify-center border-b border-dashed border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text-muted)]">
            상단 이미지 불러오는 중…
          </div>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => fileRef.current?.click()}
            className="flex h-28 w-full flex-col items-center justify-center gap-2 border-b border-dashed border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-muted)] transition hover:bg-[#EFF6FF] hover:text-[var(--primary)] disabled:opacity-50"
          >
            <ImageIcon className="h-6 w-6 opacity-60" />
            상단 이미지를 올리면 여기에 표시됩니다
          </button>
        )}
        <div className="border-t-4 border-t-[var(--primary)] p-5">
          <input
            type="text"
            value={settings.title}
            disabled={saving}
            onChange={(e) => publishSettings({ ...settings, title: e.target.value })}
            onBlur={(e) => void persist({ ...settings, title: e.target.value })}
            className="w-full border-0 bg-transparent text-xl font-bold outline-none"
            placeholder={`위드스페이스 ${monthLabel} 만족도 조사`}
          />
          <textarea
            value={settings.introText}
            disabled={saving}
            rows={6}
            onChange={(e) => publishSettings({ ...settings, introText: e.target.value })}
            onBlur={(e) => void persist({ ...settings, introText: e.target.value })}
            className="mt-3 w-full resize-y border-0 bg-transparent text-sm leading-relaxed text-[var(--text-muted)] outline-none"
            placeholder="설문 소개 글을 입력하세요."
          />
        </div>
      </div>
    </div>
  );
}
