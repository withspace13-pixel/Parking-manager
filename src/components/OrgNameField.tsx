"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  /** 전체 후보(파일 + 최근 등록 등). 입력 시 부분 일치로 걸러서 표시 */
  candidates: string[];
  placeholder?: string;
  disabled?: boolean;
};

const MAX_SHOWN = 100;

export function OrgNameField({ value, onChange, candidates, placeholder, disabled, id }: Props) {
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return candidates.slice(0, MAX_SHOWN);
    return candidates.filter((n) => n.toLowerCase().includes(q)).slice(0, MAX_SHOWN);
  }, [value, candidates]);

  useEffect(() => {
    setHl(0);
  }, [value, filtered.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-org-option-index="${hl}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [hl]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!filtered.length) {
            if (e.key === "Escape") setOpen(false);
            return;
          }
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHl((h) => Math.min(filtered.length - 1, h + 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHl((h) => Math.max(0, h - 1));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const sel = filtered[hl] ?? filtered[0];
            if (sel) pick(sel);
          }
        }}
        className="input w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]"
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open && filtered.length > 0}
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg"
        >
          {filtered.map((name, i) => (
            <li key={`${name}-${i}`}>
              <button
                type="button"
                data-org-option-index={i}
                role="option"
                aria-selected={i === hl}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  i === hl ? "bg-[#EFF6FF] text-[var(--text)]" : "text-[var(--text)] hover:bg-[#F8FAFC]"
                }`}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  pick(name);
                }}
                onMouseEnter={() => setHl(i)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
