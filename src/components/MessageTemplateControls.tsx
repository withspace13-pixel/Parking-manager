"use client";

// 감사문자·만족도 조사 문구 템플릿 저장·불러오기·관리 UI
import { useCallback, useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  BUILTIN_MESSAGE_TEMPLATE_NAME,
  createMessageTemplate,
  deleteMessageTemplate,
  ensureBuiltinMessageTemplates,
  getDefaultMessageTemplateBody,
  isBuiltinMessageTemplateName,
  loadMessageTemplates,
  suggestNewTemplateName,
  updateMessageTemplate,
  type MessageTemplateCampaign,
  type SavedMessageTemplate,
} from "@/lib/message-templates";

type Props = {
  campaign: MessageTemplateCampaign;
  /** 현재 문구를 플레이스홀더 템플릿 문자열로 반환 */
  getTemplateBody: () => string;
  onApplyTemplate: (body: string) => void;
  onFeedback: (message: string) => void;
  /** 기본 템플릿 저장·수정 후 미리보기 갱신 */
  onTemplatesChanged?: () => void;
  disabled?: boolean;
};

export function MessageTemplateControls({
  campaign,
  getTemplateBody,
  onApplyTemplate,
  onFeedback,
  onTemplatesChanged,
  disabled,
}: Props) {
  const [templates, setTemplates] = useState<SavedMessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");

  const reload = useCallback(() => {
    ensureBuiltinMessageTemplates(campaign);
    const list = loadMessageTemplates(campaign);
    setTemplates(list);
    const builtin = list.find((t) => t.name === BUILTIN_MESSAGE_TEMPLATE_NAME[campaign]);
    setSelectedId((prev) => {
      if (prev && list.some((t) => t.id === prev)) return prev;
      return builtin?.id ?? list[0]?.id ?? "";
    });
  }, [campaign]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadTemplateIntoForm = (tpl: SavedMessageTemplate) => {
    setIsCreating(false);
    setEditTemplateId(tpl.id);
    setEditName(tpl.name);
    setEditBody(tpl.body);
  };

  const resetFormForCreate = () => {
    setIsCreating(true);
    setEditTemplateId(null);
    setEditName(suggestNewTemplateName(campaign));
    setEditBody(getDefaultMessageTemplateBody(campaign));
  };

  const openManage = () => {
    reload();
    const list = loadMessageTemplates(campaign);
    const builtin = list.find((t) => t.name === BUILTIN_MESSAGE_TEMPLATE_NAME[campaign]);
    if (list.length === 0) {
      resetFormForCreate();
    } else {
      const initial =
        list.find((t) => t.id === selectedId) ?? builtin ?? list[0]!;
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
  };

  const handleLoad = () => {
    if (!selectedId) {
      onFeedback("불러올 템플릿을 선택해 주세요.");
      return;
    }
    const tpl = templates.find((t) => t.id === selectedId);
    if (!tpl) return;
    onApplyTemplate(tpl.body);
    onFeedback(`「${tpl.name}」 템플릿을 불러왔습니다.`);
  };

  const handleSaveCurrent = () => {
    const body = getTemplateBody().trim();
    if (!body) {
      onFeedback("저장할 문구가 없습니다.");
      return;
    }
    const defaultName = suggestNewTemplateName(campaign);
    const name = window.prompt("템플릿 이름을 입력해 주세요.", defaultName)?.trim();
    if (!name) return;
    try {
      const created = createMessageTemplate(campaign, name, body);
      reload();
      setSelectedId(created.id);
      onFeedback(`「${name}」 템플릿을 저장했습니다.`);
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : "저장에 실패했습니다.");
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

  const saveEdit = () => {
    try {
      if (isCreating || !editTemplateId) {
        const created = createMessageTemplate(campaign, editName, editBody);
        reload();
        setSelectedId(created.id);
        loadTemplateIntoForm(created);
        onFeedback(`「${created.name}」 템플릿을 추가했습니다.`);
        return;
      }
      updateMessageTemplate(campaign, editTemplateId, { name: editName, body: editBody });
      reload();
      onFeedback("템플릿을 수정했습니다.");
      onTemplatesChanged?.();
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : "저장에 실패했습니다.");
    }
  };

  const handleDelete = () => {
    if (!editTemplateId) return;
    const tpl = templates.find((t) => t.id === editTemplateId);
    if (!tpl) return;
    if (isBuiltinMessageTemplateName(campaign, tpl.name)) {
      onFeedback(`「${tpl.name}」 기본 템플릿은 삭제할 수 없습니다.`);
      return;
    }
    const ok = confirm(`「${tpl.name}」 템플릿을 삭제할까요?`);
    if (!ok) return;
    try {
      deleteMessageTemplate(campaign, tpl.id);
      if (selectedId === tpl.id) setSelectedId("");
      const next = loadMessageTemplates(campaign);
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
    }
  };

  const editingBuiltin =
    editTemplateId !== null &&
    templates.some(
      (t) => t.id === editTemplateId && isBuiltinMessageTemplateName(campaign, t.name)
    );

  const modalSelectValue = isCreating || !editTemplateId ? "__new__" : editTemplateId;

  return (
    <>
      <div className="mb-3 rounded-lg border border-[var(--border)] bg-[#F8FAFC] p-3">
        <p className="text-xs font-semibold text-[var(--text)]">문구 템플릿</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={disabled || templates.length === 0}
            className="input min-w-0 flex-1 px-2 py-1.5 text-xs sm:max-w-xs"
          >
            <option value="">
              {templates.length === 0 ? "저장된 템플릿 없음" : "템플릿 선택…"}
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || !selectedId}
            onClick={handleLoad}
            className="rounded-md border border-[var(--primary)] bg-[#EFF6FF] px-2.5 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[#DBEAFE] disabled:cursor-not-allowed disabled:opacity-50"
          >
            불러오기
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={handleSaveCurrent}
            className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-white/80 disabled:opacity-50"
          >
            현재 문구 저장
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={openManage}
            className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-white/80 disabled:opacity-50"
          >
            템플릿 수정
          </button>
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
            className="card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden"
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
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
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
                  onClick={saveEdit}
                  className="btn btn-primary px-4 py-2 text-xs font-semibold"
                >
                  {isCreating ? "추가" : "저장"}
                </button>
                <button
                  type="button"
                  onClick={closeManage}
                  className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[#F8FAFC]"
                >
                  취소
                </button>
                {editTemplateId && !editingBuiltin && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
