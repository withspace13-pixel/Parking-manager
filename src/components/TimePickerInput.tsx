"use client";

// 24시간 HH:MM 분리 박스 입력 (빈 값은 회색 00 플레이스홀더)
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toInt(raw: string, fallback = 0) {
  if (raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseValue(value: string): { hour: string; minute: string } {
  const trimmed = value.trim();
  if (!trimmed) return { hour: "", minute: "" };
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (!match) return { hour: "", minute: "" };
  const hour = Math.min(23, Math.max(0, toInt(match[1])));
  const minute = Math.min(59, Math.max(0, toInt(match[2])));
  return { hour: pad2(hour), minute: pad2(minute) };
}

function digitsOnly(raw: string, maxLen: number) {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

function clampHourDigits(digits: string): string {
  if (digits.length < 2) return digits;
  const n = toInt(digits);
  return n > 23 ? "23" : digits;
}

function clampMinuteDigits(digits: string): string {
  if (digits.length < 2) return digits;
  const n = toInt(digits);
  return n > 59 ? "59" : digits;
}

function applyPaste(text: string): { hour: string; minute: string } | null {
  const digits = text.replace(/\D/g, "").slice(0, 4);
  if (digits.length < 3) return null;
  const hour = clampHourDigits(digits.slice(0, 2));
  const minute = clampMinuteDigits(digits.slice(2).padEnd(2, "0").slice(0, 2));
  return {
    hour: hour.length === 2 ? hour : pad2(toInt(hour)),
    minute: minute.length === 2 ? minute : pad2(toInt(minute)),
  };
}

function normalizeHourDigits(raw: string): string {
  if (raw === "") return "";
  return pad2(Math.min(23, toInt(raw)));
}

function normalizeMinuteDigits(raw: string): string {
  if (raw === "") return "";
  return pad2(Math.min(59, toInt(raw)));
}

const boxClass =
  "input h-11 w-12 px-0 text-center text-base font-semibold tabular-nums outline-none placeholder:text-[var(--text-muted)]";

export type TimeSegment = "hour" | "minute";

export type TimePickerInputHandle = {
  focus: () => void;
  focusSegment: (segment: TimeSegment) => void;
};

type Props = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onComplete?: () => void;
  onNavigate?: (direction: "left" | "right" | "up" | "down", segment: TimeSegment) => void;
  className?: string;
};

export const TimePickerInput = forwardRef<TimePickerInputHandle, Props>(
  function TimePickerInput(
    { id, value, onChange, onComplete, onNavigate, className = "" },
    ref
  ) {
    const autoId = useId();
    const hourId = id ?? autoId;
    const parsed = parseValue(value);
    const [hour, setHour] = useState(parsed.hour);
    const [minute, setMinute] = useState(parsed.minute);
    const hourDraftRef = useRef(parsed.hour);
    const minuteDraftRef = useRef(parsed.minute);
    const hourRef = useRef<HTMLInputElement>(null);
    const minuteRef = useRef<HTMLInputElement>(null);
    const onCompleteRef = useRef(onComplete);
    const onNavigateRef = useRef(onNavigate);
    onCompleteRef.current = onComplete;
    onNavigateRef.current = onNavigate;

    const focusSegment = (segment: TimeSegment) => {
      const el = segment === "hour" ? hourRef.current : minuteRef.current;
      el?.focus();
      el?.select();
    };

    useImperativeHandle(ref, () => ({
      focus: () => focusSegment("hour"),
      focusSegment,
    }));

    useEffect(() => {
      const next = parseValue(value);
      hourDraftRef.current = next.hour;
      minuteDraftRef.current = next.minute;
      setHour(next.hour);
      setMinute(next.minute);
    }, [value]);

    const commit = (nextHour: string, nextMinute: string) => {
      if (nextHour.length === 0 && nextMinute.length === 0) {
        onChange("");
        return;
      }
      if (nextHour.length !== 2 || nextMinute.length !== 2) return;
      onChange(`${nextHour}:${nextMinute}`);
    };

    const handleHourChange = (raw: string) => {
      const next = clampHourDigits(digitsOnly(raw, 2));
      hourDraftRef.current = next;
      setHour(next);
      if (next.length === 2) {
        const m = minuteDraftRef.current;
        if (m.length === 2) commit(next, m);
        // blur가 이전 자리(0)로 정규화하지 않도록 draft를 먼저 확정한 뒤 이동
        focusSegment("minute");
      } else if (next.length === 0 && minuteDraftRef.current.length === 0) {
        commit("", "");
      }
    };

    const handleMinuteChange = (raw: string) => {
      const next = clampMinuteDigits(digitsOnly(raw, 2));
      minuteDraftRef.current = next;
      setMinute(next);
      if (next.length === 2) {
        const h = normalizeHourDigits(hourDraftRef.current);
        if (h.length === 2) {
          hourDraftRef.current = h;
          setHour(h);
          commit(h, next);
          onCompleteRef.current?.();
        }
      } else if (next.length === 0 && hourDraftRef.current.length === 0) {
        commit("", "");
      }
    };

    const normalizeHour = () => {
      const current = hourDraftRef.current;
      const other = minuteDraftRef.current;
      if (current === "" && other === "") {
        commit("", "");
        return;
      }
      if (current === "") return;
      const next = normalizeHourDigits(current);
      hourDraftRef.current = next;
      setHour(next);
      if (other.length === 2) commit(next, normalizeMinuteDigits(other));
    };

    const normalizeMinute = () => {
      const current = minuteDraftRef.current;
      const other = hourDraftRef.current;
      if (current === "" && other === "") {
        commit("", "");
        return;
      }
      if (current === "") return;
      const next = normalizeMinuteDigits(current);
      minuteDraftRef.current = next;
      setMinute(next);
      if (other.length >= 1) {
        const h = normalizeHourDigits(other);
        hourDraftRef.current = h;
        setHour(h);
        if (h.length === 2) commit(h, next);
      }
    };

    const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
      const applied = applyPaste(event.clipboardData.getData("text"));
      if (!applied) return;
      event.preventDefault();
      hourDraftRef.current = applied.hour;
      minuteDraftRef.current = applied.minute;
      setHour(applied.hour);
      setMinute(applied.minute);
      commit(applied.hour, applied.minute);
      onCompleteRef.current?.();
    };

    const handleHourKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        focusSegment("minute");
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onNavigateRef.current?.("left", "hour");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onNavigateRef.current?.("up", "hour");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onNavigateRef.current?.("down", "hour");
        return;
      }
    };

    const handleMinuteKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && minute === "") {
        e.preventDefault();
        focusSegment("hour");
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        focusSegment("hour");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNavigateRef.current?.("right", "minute");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onNavigateRef.current?.("up", "minute");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onNavigateRef.current?.("down", "minute");
        return;
      }
    };

    const hourFilled = hour.length > 0;
    const minuteFilled = minute.length > 0;

    return (
      <div className={`mt-1 flex items-center gap-1.5 ${className}`}>
        <input
          ref={hourRef}
          id={hourId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="시"
          maxLength={2}
          value={hour}
          placeholder="00"
          onChange={(e) => handleHourChange(e.target.value)}
          onBlur={normalizeHour}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={handleHourKeyDown}
          className={`${boxClass} ${
            hourFilled ? "text-[var(--text)]" : "text-[var(--text-muted)]"
          }`}
        />
        <span className="select-none text-base font-semibold text-[var(--text-muted)]" aria-hidden>
          :
        </span>
        <input
          ref={minuteRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="분"
          maxLength={2}
          value={minute}
          placeholder="00"
          onChange={(e) => handleMinuteChange(e.target.value)}
          onBlur={normalizeMinute}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={handleMinuteKeyDown}
          className={`${boxClass} ${
            minuteFilled ? "text-[var(--text)]" : "text-[var(--text-muted)]"
          }`}
        />
      </div>
    );
  }
);
