// 템플릿 선택 옆 공통 아이콘 버튼 (수정·저장·추가·삭제)
import { Pencil, Plus, Save, X } from "lucide-react";

export function templateIconBtnClass(extra = "") {
  return `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-white text-[var(--text-muted)] hover:bg-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-40 ${extra}`;
}

type Props = {
  disabled?: boolean;
  editDisabled?: boolean;
  saveDisabled?: boolean;
  addDisabled?: boolean;
  deleteDisabled?: boolean;
  onEdit: () => void;
  onSave: () => void;
  onAdd: () => void;
  onDelete: () => void;
};

export function TemplateToolbarIcons({
  disabled,
  editDisabled,
  saveDisabled,
  addDisabled,
  deleteDisabled,
  onEdit,
  onSave,
  onAdd,
  onDelete,
}: Props) {
  const allDisabled = Boolean(disabled);
  const primary = "text-[var(--primary)] hover:bg-[#EFF6FF]";
  const danger = "text-red-600 hover:bg-red-50";

  return (
    <>
      <button
        type="button"
        disabled={allDisabled || editDisabled}
        onClick={onEdit}
        className={templateIconBtnClass(primary)}
        title="템플릿 수정"
        aria-label="템플릿 수정"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={allDisabled || saveDisabled}
        onClick={onSave}
        className={templateIconBtnClass(primary)}
        title="현재 내용 저장"
        aria-label="템플릿 저장"
      >
        <Save className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={allDisabled || addDisabled}
        onClick={onAdd}
        className={templateIconBtnClass(primary)}
        title="새 템플릿 추가"
        aria-label="템플릿 추가"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={allDisabled || deleteDisabled}
        onClick={onDelete}
        className={templateIconBtnClass(danger)}
        title="템플릿 삭제"
        aria-label="템플릿 삭제"
      >
        <X className="h-4 w-4" />
      </button>
    </>
  );
}
