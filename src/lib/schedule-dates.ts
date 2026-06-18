import { isKrPublicHolidayYmd } from "@/lib/kr-holidays";

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());
}

function isWeekdayYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow !== 0 && dow !== 6;
}

/** 평일이면서 공휴일·선거일이 아닌 날 (주말 제외 일정·표시 병합 기준) */
export function isWorkingDayYmd(ymd: string): boolean {
  return isWeekdayYmd(ymd) && !isKrPublicHolidayYmd(ymd);
}

function periodRangesFromSortedYmd(sortedDates: string[]): { start: string; end: string }[] {
  return datesYmdToFormRanges(sortedDates, false);
}

/**
 * 캘린더 시작~종료 사이의 평일만 모아 연속 구간 { start, end }[] 로 분할 (주말 제외 UI용).
 * 예: 2026-03-24 ~ 2026-03-31 → [{ 24~27 }, { 30~31 }]
 */
export function splitCalendarSpanToWeekdayRanges(start: string, end: string): { start: string; end: string }[] {
  const s = String(start).trim().slice(0, 10);
  const e = String(end).trim().slice(0, 10);
  if (!isYmd(s) || !isYmd(e) || s > e) return [];
  const weekdays: string[] = [];
  const [sy, sm, sd] = s.split("-").map(Number);
  for (let i = 0; i < 366; i++) {
    const d = new Date(sy, sm - 1, sd + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const str = `${y}-${m}-${day}`;
    if (str > e) break;
    if (isWorkingDayYmd(str)) weekdays.push(str);
  }
  return datesYmdToConsecutiveRanges(weekdays);
}

/** prev 다음날~curr 전날 사이에, 집합에 없는 근무일이 있으면 true (구간 분리 필요) */
function workingDaysMissingStrictlyBetween(set: Set<string>, prev: string, curr: string): boolean {
  const [sy, sm, sd] = prev.split("-").map(Number);
  for (let i = 1; i < 400; i++) {
    const cal = new Date(sy, sm - 1, sd + i);
    const y = cal.getFullYear();
    const m = String(cal.getMonth() + 1).padStart(2, "0");
    const day = String(cal.getDate()).padStart(2, "0");
    const str = `${y}-${m}-${day}`;
    if (str >= curr) break;
    if (isWorkingDayYmd(str) && !set.has(str)) return true;
  }
  return false;
}

/**
 * 기관 등록/수정 화면의 시작~종료 입력 행을 만들 때 사용.
 * - 주말 포함: 캘린더상 하루라도 끊기면 구간 분리 (기존 datesYmdToConsecutiveRanges와 동일)
 * - 주말·공휴일 제외: 근무일만 보면 이어지면 주말·빨간날이 끼어 있어도 한 구간으로 합침
 */
export function datesYmdToFormRanges(dates: string[], includeWeekends: boolean): { start: string; end: string }[] {
  const sorted = Array.from(new Set(dates.map((d) => String(d).slice(0, 10)))).sort();
  if (sorted.length === 0) return [];
  if (includeWeekends) return datesYmdToConsecutiveRanges(sorted);

  const set = new Set(sorted);
  const out: { start: string; end: string }[] = [];
  let runStart = sorted[0]!;
  let runEnd = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]!;
    if (workingDaysMissingStrictlyBetween(set, runEnd, d)) {
      out.push({ start: runStart, end: runEnd });
      runStart = d;
      runEnd = d;
    } else {
      runEnd = d;
    }
  }
  out.push({ start: runStart, end: runEnd });
  return out;
}

/** YYYY-MM-DD 목록을 캘린더상 연속 구간 { start, end }[] 로 묶음 (하루 건너뛰면 구간 분리) */
export function datesYmdToConsecutiveRanges(dates: string[]): { start: string; end: string }[] {
  const sorted = Array.from(new Set(dates.map((d) => String(d).slice(0, 10)))).sort();
  if (sorted.length === 0) return [];

  const dayTime = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  const out: { start: string; end: string }[] = [];
  let curStart = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (dayTime(next) - dayTime(prev) === 24 * 60 * 60 * 1000) {
      prev = next;
    } else {
      out.push({ start: curStart, end: prev });
      curStart = next;
      prev = next;
    }
  }
  out.push({ start: curStart, end: prev });
  return out;
}

/** 표시용 M/D */
export function formatMonthDaySlash(ymd: string): string {
  const s = String(ymd).slice(0, 10);
  if (s.length < 10) return ymd;
  const [, m, day] = s.split("-");
  return `${Number(m)}/${Number(day)}`;
}

/** 표시용 yy-mm-dd */
export function shortYmdSlice(ymd: string): string {
  const s = String(ymd).slice(0, 10);
  return s.length >= 10 ? s.slice(2) : s;
}

function formatMonthDayRangeLabel(start: string, end: string): string {
  if (start === end) return formatMonthDaySlash(start);
  const [, sm, sd] = start.split("-");
  const [, em, ed] = end.split("-");
  if (sm === em) return `${Number(sm)}/${Number(sd)} ~ ${Number(ed)}`;
  return `${formatMonthDaySlash(start)} ~ ${formatMonthDaySlash(end)}`;
}

function formatShortYmdRangeLabel(start: string, end: string): string {
  if (start === end) return shortYmdSlice(start);
  const ss = shortYmdSlice(start);
  const es = shortYmdSlice(end);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${ss} ~ ${es.slice(3)}`;
  return `${ss} ~ ${es}`;
}

function formatIsoRangeLabel(start: string, end: string): string {
  return start === end ? start : `${start} ~ ${end}`;
}

/** 정렬된 YYYY-MM-DD 목록 → "6/12 ~ 6/19" (주말·공휴일만 끼면 1구간, 근무일 공백이면 분리) */
export function periodLabelMonthDayFromSortedYmd(sortedDates: string[]): string {
  if (sortedDates.length === 0) return "";
  const ranges = periodRangesFromSortedYmd(sortedDates);
  return ranges.map((r) => formatMonthDayRangeLabel(r.start, r.end)).join(", ");
}

/** 정렬된 YYYY-MM-DD 목록 → "26-06-12 ~ 26-06-19" 형태 */
export function periodLabelShortYmdFromSortedYmd(sortedDates: string[]): string {
  if (sortedDates.length === 0) return "";
  const ranges = periodRangesFromSortedYmd(sortedDates);
  return ranges.map((r) => formatShortYmdRangeLabel(r.start, r.end)).join(", ");
}

/** 정렬된 YYYY-MM-DD 목록 → "2026-06-12 ~ 2026-06-19" (테이블용) */
export function periodLabelIsoFromSortedYmd(sortedDates: string[]): string {
  if (sortedDates.length === 0) return "";
  const ranges = periodRangesFromSortedYmd(sortedDates);
  return ranges.map((r) => formatIsoRangeLabel(r.start, r.end)).join(", ");
}
