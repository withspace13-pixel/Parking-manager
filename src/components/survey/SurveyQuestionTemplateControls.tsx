"use client";

// 만족도 설문 템플릿 선택·생성·저장·삭제 (한 줄 컨트롤)
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TemplateToolbarIcons } from "@/components/TemplateToolbarIcons";
import {
  applySurveyQuestionTemplate,
  buildSurveyTemplateSnapshot,
  createBlankSurveyQuestionTemplate,
  deleteSurveyQuestionTemplate,
  fetchSurveyQuestionTemplateById,
  fetchSurveyQuestionTemplateSummaries,
  invalidateSurveyQuestionTemplatesCache,
  updateSurveyQuestionTemplate,
  type SurveyQuestionTemplateSummary,
  type SurveyTemplateApplyResult,
} from "@/lib/survey/survey-question-templates";
import { surveyQuestionTemplateFingerprint } from "@/lib/survey/survey-template-fingerprint";
import type { SurveyQuestionTemplate } from "@/lib/survey/types";

type Props = {
  campaignKey: string;
  campaignFingerprint: string | null;
  campaignReady: boolean;
  campaignRefreshing?: boolean;
  onChanged: (sync?: SurveyTemplateApplyResult) => void;
  onFeedback?: (message: string) => void;
};

function selectedTemplateStorageKey(campaignKey: string) {
  return `parking-manager-survey-selected-template:${campaignKey}`;
}

function readStoredTemplateId(campaignKey: string): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(selectedTemplateStorageKey(campaignKey)) ?? "";
  } catch {
    return "";
  }
}

function writeStoredTemplateId(campaignKey: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      sessionStorage.setItem(selectedTemplateStorageKey(campaignKey), id);
    } else {
      sessionStorage.removeItem(selectedTemplateStorageKey(campaignKey));
    }
  } catch {
    // ignore
  }
}

export function SurveyQuestionTemplateControls({
  campaignKey,
  campaignFingerprint,
  campaignReady,
  campaignRefreshing = false,
  onChanged,
  onFeedback,
}: Props) {
  const [summaries, setSummaries] = useState<SurveyQuestionTemplateSummary[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SurveyQuestionTemplate | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settlingTemplate, setSettlingTemplate] = useState(false);

  const isBuiltin = Boolean(selectedTemplate?.isBuiltin);

  const templateFingerprint = useMemo(
    () => (selectedTemplate ? surveyQuestionTemplateFingerprint(selectedTemplate) : null),
    [selectedTemplate]
  );

  const isDirty = Boolean(
    selectedId &&
      campaignReady &&
      !settlingTemplate &&
      !busy &&
      !campaignRefreshing &&
      templateFingerprint &&
      campaignFingerprint &&
      campaignFingerprint !== templateFingerprint
  );

  const setActiveTemplateId = useCallback(
    (id: string) => {
      setSelectedId(id);
      writeStoredTemplateId(campaignKey, id);
    },
    [campaignKey]
  );

  const reloadSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchSurveyQuestionTemplateSummaries(supabase);
      setSummaries(list);
      const storedId = readStoredTemplateId(campaignKey);
      const nextId =
        storedId && list.some((t) => t.id === storedId)
          ? storedId
          : selectedId && list.some((t) => t.id === selectedId)
            ? selectedId
            : "";
      setActiveTemplateId(nextId);
      if (nextId) {
        const full = await fetchSurveyQuestionTemplateById(supabase, nextId);
        setSelectedTemplate(full);
      } else {
        setSelectedTemplate(null);
      }
    } finally {
      setLoading(false);
    }
  }, [campaignKey, selectedId, setActiveTemplateId]);

  useEffect(() => {
    void reloadSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- campaignKey 변경 시에만 초기 로드
  }, [campaignKey]);

  useEffect(() => {
    if (!settlingTemplate || !templateFingerprint || !campaignFingerprint || campaignRefreshing) {
      return;
    }
    if (campaignFingerprint === templateFingerprint) {
      setSettlingTemplate(false);
    }
  }, [settlingTemplate, templateFingerprint, campaignFingerprint, campaignRefreshing]);

  const applyTemplate = async (tpl: SurveyQuestionTemplate) => {
    setActiveTemplateId(tpl.id);
    setSelectedTemplate(tpl);
    setSettlingTemplate(true);
    setBusy(true);
    try {
      const applied = await applySurveyQuestionTemplate(supabase, campaignKey, tpl);
      onChanged(applied);
    } catch (err) {
      setSettlingTemplate(false);
      onFeedback?.(err instanceof Error ? err.message : "템플릿 불러오기 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = async (id: string) => {
    if (!id) {
      setActiveTemplateId("");
      setSelectedTemplate(null);
      setSettlingTemplate(false);
      return;
    }
    if (id === selectedId) return;
    const summary = summaries.find((t) => t.id === id);
    if (!summary) return;
    setBusy(true);
    try {
      const tpl = await fetchSurveyQuestionTemplateById(supabase, id);
      if (!tpl) {
        onFeedback?.("템플릿을 불러오지 못했습니다.");
        return;
      }
      await applyTemplate(tpl);
      onFeedback?.(`「${tpl.name}」 템플릿을 불러왔습니다.`);
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedTemplate) return;
    if (isBuiltin) {
      onFeedback?.(`「${selectedTemplate.name}」 기본 템플릿 이름은 변경할 수 없습니다.`);
      return;
    }
    const name = window.prompt("템플릿 이름", selectedTemplate.name)?.trim();
    if (!name || name === selectedTemplate.name) return;
    setBusy(true);
    try {
      await updateSurveyQuestionTemplate(supabase, selectedTemplate.id, name, {
        title: selectedTemplate.title,
        introText: selectedTemplate.introText,
        headerImageUrl: selectedTemplate.headerImageUrl,
        questions: selectedTemplate.questions,
      });
      invalidateSurveyQuestionTemplatesCache();
      await reloadSummaries();
      onFeedback?.("템플릿 이름을 수정했습니다.");
    } catch (err) {
      onFeedback?.(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!selectedTemplate || !isDirty) return;
    setBusy(true);
    try {
      const snapshot = await buildSurveyTemplateSnapshot(supabase, campaignKey);
      const updated = await updateSurveyQuestionTemplate(
        supabase,
        selectedTemplate.id,
        selectedTemplate.name,
        snapshot
      );
      invalidateSurveyQuestionTemplatesCache();
      setSelectedTemplate(updated);
      await reloadSummaries();
      setSettlingTemplate(false);
      onFeedback?.(`「${selectedTemplate.name}」 템플릿을 저장했습니다.`);
      onChanged();
    } catch (err) {
      onFeedback?.(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBlank = async () => {
    setBusy(true);
    try {
      const tpl = await createBlankSurveyQuestionTemplate(supabase);
      invalidateSurveyQuestionTemplatesCache();
      await reloadSummaries();
      await applyTemplate(tpl);
      onFeedback?.(`「${tpl.name}」 템플릿을 추가했습니다.`);
    } catch (err) {
      onFeedback?.(err instanceof Error ? err.message : "템플릿 생성 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    if (isBuiltin) {
      onFeedback?.(`「${selectedTemplate.name}」 기본 템플릿은 삭제할 수 없습니다.`);
      return;
    }
    if (!confirm(`「${selectedTemplate.name}」 템플릿을 삭제할까요?`)) return;
    setBusy(true);
    try {
      await deleteSurveyQuestionTemplate(supabase, selectedTemplate.id);
      setActiveTemplateId("");
      setSelectedTemplate(null);
      setSettlingTemplate(false);
      invalidateSurveyQuestionTemplatesCache();
      await reloadSummaries();
      onFeedback?.("템플릿을 삭제했습니다.");
    } catch (err) {
      onFeedback?.(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-[var(--text-muted)]">템플릿 불러오는 중...</p>;
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-semibold text-[var(--text)]">템플릿</span>
        <select
          value={selectedId}
          onChange={(e) => void handleSelect(e.target.value)}
          disabled={busy || summaries.length === 0}
          className="min-w-[8rem] flex-1 rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:opacity-50"
          title="템플릿 선택"
        >
          <option value="">{summaries.length === 0 ? "템플릿 없음" : "템플릿 선택…"}</option>
          {summaries.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <TemplateToolbarIcons
          disabled={busy}
          editDisabled={!selectedId || isBuiltin}
          saveDisabled={!selectedId || !isDirty}
          deleteDisabled={!selectedId || isBuiltin}
          onEdit={() => void handleEdit()}
          onSave={() => void handleSave()}
          onAdd={() => void handleCreateBlank()}
          onDelete={() => void handleDelete()}
        />
      </div>
      {selectedTemplate ? (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          현재 템플릿:{" "}
          <span className="font-semibold text-[var(--primary)]">{selectedTemplate.name}</span>
          {isDirty ? (
            <span className="ml-2 font-medium text-amber-600">· 저장되지 않은 변경</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">현재 템플릿: 선택 안 됨</p>
      )}
    </div>
  );
}
