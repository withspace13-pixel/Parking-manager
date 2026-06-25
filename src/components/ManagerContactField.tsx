"use client";

// 기관 등록 시 담당자명·연락처 자동완성 입력 필드
import { useEffect, useMemo, useRef, useState } from "react";
import { formatManagerPhoneDisplay, sanitizeManagerPhoneDigits } from "@/lib/manager-display";
import {
  filterManagerContactSuggestions,
  lookupManagerPhone,
  type ManagerContact,
} from "@/lib/manager-contacts";

type Props = {
  manager: string;
  managerPhone: string;
  orgName: string;
  contacts: ManagerContact[];
  onManagerChange: (name: string) => void;
  onManagerPhoneChange: (phone: string) => void;
  disabled?: boolean;
};

export function ManagerContactField({
  manager,
  managerPhone,
  orgName,
  contacts,
  onManagerChange,
  onManagerPhoneChange,
  disabled,
}: Props) {
  const [draft, setDraft] = useState(manager);
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const phoneTouchedRef = useRef(false);
  const isComposingRef = useRef(false);

  const filtered = useMemo(
    () => filterManagerContactSuggestions(contacts, draft, orgName),
    [contacts, draft, orgName]
  );

  useEffect(() => {
    if (!isComposingRef.current) setDraft(manager);
  }, [manager]);

  useEffect(() => {
    setHl(0);
  }, [draft, filtered.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-contact-option-index="${hl}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [hl]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const commitManager = (value: string) => {
    const next = value;
    setDraft(next);
    onManagerChange(next);
  };

  useEffect(() => {
    if (isComposingRef.current) return;
    if (!draft.trim() || phoneTouchedRef.current || managerPhone.trim()) return;
    const found = lookupManagerPhone(contacts, draft, orgName);
    if (found) onManagerPhoneChange(found);
  }, [draft, orgName, contacts, managerPhone, onManagerPhoneChange]);

  const pick = (contact: ManagerContact) => {
    commitManager(contact.name);
    onManagerPhoneChange(contact.phone);
    phoneTouchedRef.current = false;
    setOpen(false);
  };

  return (
    <div ref={rootRef}>
      <div className="relative w-full">
        <input
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (!isComposingRef.current) {
              onManagerChange(next);
              setOpen(true);
            }
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            commitManager(e.currentTarget.value);
            setOpen(true);
          }}
          onBlur={(e) => {
            isComposingRef.current = false;
            commitManager(e.currentTarget.value);
            setOpen(false);
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
              if (isComposingRef.current || e.nativeEvent.isComposing) return;
              e.preventDefault();
              const sel = filtered[hl] ?? filtered[0];
              if (sel) pick(sel);
              return;
            }
            if (e.key === "Tab") setOpen(false);
          }}
          className="input w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]"
          placeholder="예: 홍길동"
          autoComplete="off"
          name="manager"
          aria-autocomplete="list"
          aria-expanded={open && filtered.length > 0}
        />
        {open && filtered.length > 0 && (
          <ul
            ref={listRef}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg"
          >
            {filtered.map((contact, i) => (
              <li key={`${contact.org_name}-${contact.name}-${contact.phone}-${i}`}>
                <button
                  type="button"
                  data-contact-option-index={i}
                  role="option"
                  aria-selected={i === hl}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                    i === hl ? "bg-[#EFF6FF] text-[var(--text)]" : "text-[var(--text)] hover:bg-[#F8FAFC]"
                  }`}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    pick(contact);
                  }}
                  onMouseEnter={() => setHl(i)}
                >
                  <span className="font-medium">{contact.name}</span>
                  {contact.org_name ? (
                    <span className="text-[var(--text-muted)]"> · {contact.org_name}</span>
                  ) : null}
                  <span className="text-[var(--text-muted)]">
                    {" "}
                    · {formatManagerPhoneDisplay(contact.phone)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        type="tel"
        inputMode="numeric"
        value={managerPhone}
        disabled={disabled}
        onChange={(e) => {
          phoneTouchedRef.current = true;
          onManagerPhoneChange(sanitizeManagerPhoneDigits(e.target.value));
        }}
        className="input mt-2 w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]"
        placeholder="예: 01012345678"
        autoComplete="tel"
      />
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
        담당자명 입력 시 저장된 연락처가 자동으로 채워집니다. (숫자만, 하이픈 없이)
      </p>
    </div>
  );
}
