"use client";

// 감사문자·만족도 조사 문구 템플릿 저장·불러오기·관리 UI
import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import { TemplateToolbarIcons } from "@/components/TemplateToolbarIcons";
import {
  BUILTIN_MESSAGE_TEMPLATE_NAME,
  createMessageTemplate,
  deleteMessageTemplate,
  fetchMessageTemplates,
  isBuiltinMessageTemplateName,
  SEED_TEMPLATE_BODY,
  suggestNewTemplateName,
  updateMessageTemplate,
  type MessageTemplateCampaign,
  type SavedMessageTemplate,
} from "@/lib/message-templates";
import { MESSAGE_TEMPLATE_VARIABLE_HINTS } from "@/lib/message-template-variables";
import { supabase } from "@/lib/supabase";

type Props = {
  campaign: MessageTemplateCampaign;
  /** 현재 문구를 플레이스홀더 템플릿 문자열로 반환 */
  getTemplateBody: () => string;
  /** 저장 버튼 활성화 판단용 — getTemplateBody와 동일한 값을 넘기면 됩니다 */
  trackedTemplateBody?: string;
  onApplyTemplate: (body: string) => void;
  onFeedback: (message: string) => void;
  /** 기본 템플릿 저장·수정 후 미리보기 갱신 */
  onTemplatesChanged?: () => void;
  disabled?: boolean;
  variableHints?: Array<{ token: string; description: string; example?: string }>;
};

type EditBaseline = {
  name: string;
  body: string;
};

export function MessageTemplateControls({
  campaign,
  getTemplateBody,
  trackedTemplateBody,
  onApplyTemplate,
  onFeedback,
  onTemplatesChanged,
  disabled,
  variableHints = [...MESSAGE_TEMPLATE_VARIABLE_HINTS],
}: Props) {
  const [templates, setTemplates] = useState<SavedMessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editBaseline, setEditBaseline] = useState<EditBaseline | null>(null);

  const reload = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const list = await fetchMessageTemplates(supabase, campaign);
      setTemplates(list);
      const builtin = list.find((t) => t.name === BUILTIN_MESSAGE_TEMPLATE_NAME[campaign]);
      setSelectedId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        return builtin?.id ?? list[0]?.id ?? "";
      });
    } catch (err) {
      console.warn("[message_templates reload]", err);
    } finally {
      setTemplatesLoading(false);
    }
  }, [campaign]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadTemplateIntoForm = (tpl: SavedMessageTemplate) => {
    setIsCreating(false);
    setEditTemplateId(tpl.id);
    setEditName(tpl.name);
    setEditBody(tpl.body);
    setEditBaseline({ name: tpl.name, body: tpl.body });
  };

  const resetFormForCreate = () => {
    setIsCreating(true);
    setEditTemplateId(null);
    const name = suggestNewTemplateName(templates.length);
    const body = templates.find((t) => t.name === BUILTIN_MESSAGE_TEMPLATE_NAME[campaign])?.body
      ?? SEED_TEMPLATE_BODY[campaign];
    setEditName(name);
    setEditBody(body);
    setEditBaseline({ name, body });
  };

  const openManage = async () => {
    const list = await fetchMessageTemplates(supabase, campaign);
    setTemplates(list);
    const builtin = list.find((t) => t.name === BUILTIN_MESSAGE_TEMPLATE_NAME[campaign]);
    if (list.length === 0) {
      setIsCreating(true);
      setEditTemplateId(null);
      const name = suggestNewTemplateName(0);
      const body = builtin?.body ?? SEED_TEMPLATE_BODY[campaign];
      setEditName(name);
      setEditBody(body);
      setEditBaseline({ name, body });
    } else {
      const initial = list.find((t) => t.id === selectedId) ?? builtin ?? list[0]!;
      loadTemplateIntoForm(initial);
    }
    setManageOpen(true);
  };

  const closeManage = () => {
    setManageOpen(false);
    setIsCreating(false);
    setEditTemplateId(null);
    setEditName("");
    setEditBody("");
    setEditBaseline(null);
  };

  const handleSelectChange = (id: string) => {
    setSelectedId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    onApplyTemplate(tpl.body);
    onFeedback(`「${tpl.name}」 템플릿을 불러왔습니다.`);
  };

  const handleSave = async () => {
    const body = getTemplateBody().trim();
    if (!body) {
      onFeedback("저장할 문구가 없습니다.");
      return;
    }
    if (!selectedId) {
      const defaultName = suggestNewTemplateName(templates.length);
      const name = window.prompt("템플릿 이름을 입력해 주세요.", defaultName)?.trim();
      if (!name) return;
      setSaving(true);
      try {
        const created = await createMessageTemplate(supabase, campaign, name, body);
        await reload();
        setSelectedId(created.id);
        onFeedback(`「${name}」 템플릿을 저장했습니다.`);
      } catch (err) {
        onFeedback(err instanceof Error ? err.message : "저장에 실패했습니다.");
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      await updateMessageTemplate(supabase, campaign, selectedId, { body });
      await reload();
      onFeedback("템플릿을 저장했습니다.");
      onTemplatesChanged?.();
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const list = await fetchMessageTemplates(supabase, campaign);
    setTemplates(list);
    resetFormForCreate();
    setManageOpen(true);
  };

  const handleDeleteSelected = async () => {
    if (!selectedId) return;
    const tpl = templates.find((t) => t.id === selectedId);
    if (!tpl) return;
    if (isBuiltinMessageTemplateName(campaign, tpl.name)) {
      onFeedback(`「${tpl.name}」 기본 템플릿은 삭제할 수 없습니다.`);
      return;
    }
    if (!confirm(`「${tpl.name}」 템플릿을 삭제할까요?`)) return;
    setSaving(true);
    try {
      await deleteMessageTemplate(supabase, campaign, tpl.id);
      const next = await fetchMessageTemplates(supabase, campaign);
      setTemplates(next);
      const builtin = next.find((t) => t.name === BUILTIN_MESSAGE_TEMPLATE_NAME[campaign]);
      const fallback = builtin?.id ?? next[0]?.id ?? "";
      setSelectedId(fallback);
      if (fallback) {
        const loaded = next.find((t) => t.id === fallback);
        if (loaded) onApplyTemplate(loaded.body);
      }
      onFeedback("템플릿을 삭제했습니다.");
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleModalTemplateChange = (id: string) => {
    if (id === "__new__") {
      resetFormForCreate();
      return;
    }
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    loadTemplateIntoForm(tpl);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      if (isCreating || !editTemplateId) {
        const created = await createMessageTemplate(supabase, campaign, editName, editBody);
        await reload();
        setSelectedId(created.id);
        loadTemplateIntoForm(created);
        onFeedback(`「${created.name}」 템플릿을 추가했습니다.`);
        return;
      }
      const updated = await updateMessageTemplate(supabase, campaign, editTemplateId, {
        name: editName,
        body: editBody,
      });
      await reload();
      if (updated) {
        loadTemplateIntoForm(updated);
      } else {
        setEditBaseline({ name: editName.trim(), body: editBody });
      }
      onFeedback("템플릿을 저장했습니다.");
      onTemplatesChanged?.();
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editTemplateId) return;
    const tpl = templates.find((t) => t.id === editTemplateId);
    if (!tpl) return;
    if (isBuiltinMessageTemplateName(campaign, tpl.name)) {
      onFeedback(`「${tpl.name}」 기본 템플릿은 삭제할 수 없습니다.`);
      return;
    }
    const ok = confirm(`「${tpl.name}」 템플릿을 삭제할까요?`);
    if (!ok) return;
    setSaving(true);
    try {
      await deleteMessageTemplate(supabase, campaign, tpl.id);
      if (selectedId === tpl.id) setSelectedId("");
      const next = await fetchMessageTemplates(supabase, campaign);
      setTemplates(next);
      if (next.length === 0) {
        resetFormForCreate();
        onFeedback("템플릿을 삭제했습니다.");
        return;
      }
      loadTemplateIntoForm(next[0]!);
      onFeedback("템플릿을 삭제했습니다.");
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const editingBuiltin =
    editTemplateId !== null &&
    templates.some(
      (t) => t.id === editTemplateId && isBuiltinMessageTemplateName(campaign, t.name)
    );

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;
  const selectedIsBuiltin = selectedTemplate
    ? isBuiltinMessageTemplateName(campaign, selectedTemplate.name)
    : false;

  const currentToolbarBody = (trackedTemplateBody ?? getTemplateBody()).trim();
  const toolbarDirty = selectedTemplate
    ? currentToolbarBody !== selectedTemplate.body.trim()
    : currentToolbarBody.length > 0;

  const modalDirty = useMemo(() => {
    if (!editBaseline) return false;
    if (isCreating || !editTemplateId) {
      return editName.trim() !== editBaseline.name.trim() || editBody !== editBaseline.body;
    }
    return editName.trim() !== editBaseline.name.trim() || editBody !== editBaseline.body;
  }, [editBaseline, editBody, editName, editTemplateId, isCreating]);

  const modalSaveDisabled =
    saving ||
    !editName.trim() ||
    !editBody.trim() ||
    (!isCreating && editTemplateId !== null && !modalDirty);

  const modalSelectValue = isCreating || !editTemplateId ? "__new__" : editTemplateId;
  const controlsDisabled = disabled || templatesLoading || saving;

  return (
    <>
      <div className="mb-3 rounded-lg border border-[var(--border)] bg-[#F8FAFC] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-[var(--text)]">문구 템플릿</span>
          <select
            value={selectedId}
            onChange={(e) => handleSelectChange(e.target.value)}
            disabled={controlsDisabled || templates.length === 0}
            className="input min-w-0 flex-1 px-2 py-1.5 text-xs sm:max-w-xs"
          >
            <option value="">
              {templatesLoading
                ? "템플릿 불러오는 중…"
                : templates.length === 0
                  ? "저장된 템플릿 없음"
                  : "템플릿 선택…"}
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <TemplateToolbarIcons
            disabled={controlsDisabled}
            editDisabled={!selectedId}
            saveDisabled={!toolbarDirty}
            deleteDisabled={!selectedId || selectedIsBuiltin}
            onEdit={() => void openManage()}
            onSave={() => void handleSave()}
            onAdd={() => void handleAdd()}
            onDelete={() => void handleDeleteSelected()}
          />
        </div>
      </div>

      {manageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-edit-title"
          onClick={closeManage}
        >
          <div
            className="card flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h3 id="template-edit-title" className="text-sm font-bold text-[var(--text)]">
                문구 템플릿 수정
              </h3>
              <button
                type="button"
                onClick={closeManage}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[#F8FAFC]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex min-w-0 flex-col gap-3">
                <label className="block text-xs font-medium text-[var(--text-muted)]">
                  템플릿 선택
                  <select
                    value={modalSelectValue}
                    onChange={(e) => handleModalTemplateChange(e.target.value)}
                    className="input mt-1 w-full px-2 py-1.5 text-sm"
                  >
                    <option value="__new__">+ 새 템플릿 작성</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  readOnly={editingBuiltin}
                  className="input w-full shrink-0 px-2 py-1.5 text-sm disabled:bg-[#F8FAFC]"
                  placeholder="템플릿 이름"
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="input min-h-72 w-full resize-y px-2 py-2 font-mono text-xs leading-relaxed"
                  spellCheck={false}
                />
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={modalSaveDisabled}
                    className="btn btn-primary px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "저장 중…" : isCreating ? "추가" : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={closeManage}
                    disabled={saving}
                    className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[#F8FAFC] disabled:opacity-50"
                  >
                    취소
                  </button>
                  {editTemplateId && !editingBuiltin && (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={saving}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </button>
                  )}
                </div>
              </div>
              <aside className="rounded-xl border border-[var(--border)] bg-[#F8FAFC] p-4">
                <h4 className="text-sm font-bold text-[var(--text)]">치환 변수 안내</h4>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  아래 토큰을 문구에 넣으면 발송 시 실제 값으로 자동 바뀝니다.
                </p>
                <div className="mt-3 space-y-2">
                  {variableHints.length > 0 ? (
                    variableHints.map((hint) => (
                      <div
                        key={hint.token}
                        className="rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                      >
                        <div className="text-sm font-semibold text-[var(--primary)]">
                          {hint.token}
                        </div>
                        <div className="mt-1 text-xs text-[var(--text)]">
                          {hint.description}
                        </div>
                        {hint.example ? (
                          <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                            예: {hint.example}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs text-[var(--text-muted)]">
                      사용 가능한 치환 변수가 없습니다.
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
