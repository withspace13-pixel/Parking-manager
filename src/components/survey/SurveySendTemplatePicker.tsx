"use client";

// 만족도 조사 발송 시 설문 템플릿 선택 + 목록 미리보기
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchSurveyQuestionTemplateById } from "@/lib/survey/survey-question-templates";
import type { SurveyQuestionTemplateSummary } from "@/lib/survey/survey-question-templates";
import {
  SURVEY_QUESTION_TYPE_LABEL,
  type SurveyQuestionTemplate,
} from "@/lib/survey/types";

type Props = {
  value: string;
  options: SurveyQuestionTemplateSummary[];
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
  /** 드롭다운을 이 영역 너비(문자 미리보기 패널 등)에 맞춤 */
  menuAlignRef?: RefObject<HTMLElement | null>;
};

function optionLabel(t: SurveyQuestionTemplateSummary) {
  return t.isBuiltin ? `${t.name} (기본)` : t.name;
}

function SurveyTemplatePreview({ template }: { template: SurveyQuestionTemplate | null }) {
  if (!template) {
    return <p className="text-xs text-[var(--text-muted)]">미리보기 불러오는 중…</p>;
  }

  if (template.questions.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">질문이 없습니다.</p>;
  }

  return (
    <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
      {template.questions.map((q, i) => (
        <li key={`${q.title}-${i}`} className="break-words">
          {i + 1}. [{SURVEY_QUESTION_TYPE_LABEL[q.questionType]}] {q.title}
          {q.required ? "" : " (선택)"}
        </li>
      ))}
    </ul>
  );
}

export function SurveySendTemplatePicker({
  value,
  options,
  onChange,
  disabled,
  className = "",
  menuAlignRef,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlightId, setHighlightId] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, SurveyQuestionTemplate>>({});
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const previewCacheRef = useRef<Record<string, SurveyQuestionTemplate>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const ignoreOutsideUntilRef = useRef(0);

  const selectedSummary = useMemo(
    () => options.find((t) => t.id === value) ?? null,
    [options, value]
  );

  const previewId = highlightId || value;
  const previewTemplate = previewId ? (previewCache[previewId] ?? null) : null;

  const loadPreview = useCallback(async (id: string, force = false) => {
    if (!id) return;
    if (!force && previewCacheRef.current[id]) return;
    setLoadingPreviewId(id);
    try {
      // 드롭다운 hover는 캐시 사용. force일 때만 DB 재조회
      const tpl = await fetchSurveyQuestionTemplateById(supabase, id, { force });
      if (tpl) {
        previewCacheRef.current[id] = tpl;
        setPreviewCache((prev) => ({ ...prev, [id]: tpl }));
      }
    } finally {
      setLoadingPreviewId((current) => (current === id ? null : current));
    }
  }, []);

  useEffect(() => {
    if (value) void loadPreview(value, false);
  }, [value, loadPreview]);

  useEffect(() => {
    if (!open) return;
    const initial = value || options[0]?.id || "";
    setHighlightId(initial);
    // 메뉴를 열 때만 선택 템플릿을 한 번 최신화 (hover마다 재조회하지 않음)
    if (initial) void loadPreview(initial, true);
  }, [open, value, options, loadPreview]);

  const computeMenuStyle = useCallback((): CSSProperties | null => {
    if (!rootRef.current) return null;
    const trigger = rootRef.current.getBoundingClientRect();
    const panel = menuAlignRef?.current?.getBoundingClientRect();
    const left = panel?.left ?? trigger.left;
    const width = panel?.width ?? trigger.width;
    return {
      position: "fixed",
      left,
      width,
      top: trigger.bottom + 4,
      zIndex: 50,
    };
  }, [menuAlignRef]);

  const updateMenuPosition = useCallback(() => {
    const next = computeMenuStyle();
    if (next) setMenuStyle(next);
  }, [computeMenuStyle]);

  const openMenu = useCallback(() => {
    const next = computeMenuStyle();
    if (!next) return;
    setMenuStyle(next);
    ignoreOutsideUntilRef.current = performance.now() + 200;
    setOpen(true);
  }, [computeMenuStyle]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    let attached = false;
    const onDown = (e: MouseEvent) => {
      if (performance.now() < ignoreOutsideUntilRef.current) return;
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      attached = true;
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (attached) document.removeEventListener("mousedown", onDown);
    };
  }, [open, closeMenu]);

  const highlightIndex = useMemo(
    () => options.findIndex((t) => t.id === highlightId),
    [options, highlightId]
  );

  useEffect(() => {
    if (!open || highlightIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-template-option-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlightIndex]);

  const pick = (id: string) => {
    onChange(id);
    closeMenu();
  };

  const handleHighlight = (id: string) => {
    setHighlightId(id);
    void loadPreview(id, false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={(e) => {
          if (!open || options.length === 0) {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openMenu();
            }
            return;
          }
          if (e.key === "Escape") {
            closeMenu();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = options[Math.min(options.length - 1, Math.max(0, highlightIndex) + 1)];
            if (next) handleHighlight(next.id);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = options[Math.max(0, Math.max(0, highlightIndex) - 1)];
            if (next) handleHighlight(next.id);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const id = highlightId || value;
            if (id) pick(id);
          }
        }}
        className="input flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">
          {options.length === 0
            ? "템플릿 없음"
            : selectedSummary
              ? optionLabel(selectedSummary)
              : "템플릿 선택…"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && options.length > 0 && menuStyle ? (
        <div
          ref={menuRef}
          style={menuStyle}
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg"
        >
          <div className="grid max-h-80 grid-cols-[9.5rem_minmax(0,1fr)]">
            <ul
              ref={listRef}
              role="listbox"
              className="max-h-80 overflow-auto border-r border-[var(--border)]"
            >
              {options.map((t, i) => {
                const active = t.id === highlightId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      data-template-option-index={i}
                      role="option"
                      aria-selected={active}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-[#EFF6FF] font-medium text-[var(--text)]"
                          : "text-[var(--text)] hover:bg-[#F8FAFC]"
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => handleHighlight(t.id)}
                      onClick={() => pick(t.id)}
                    >
                      {optionLabel(t)}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="max-h-80 overflow-auto bg-[#FAFAFA] p-3">
              {loadingPreviewId === previewId && !previewTemplate ? (
                <p className="text-xs text-[var(--text-muted)]">미리보기 불러오는 중…</p>
              ) : (
                <SurveyTemplatePreview template={previewTemplate} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
