function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());
}

function isWeekdayYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow !== 0 && dow !== 6;
}

/**
 * 선택된 날짜가 "하나의 연속 캘린더 구간에서 주말만 빠진 형태"인지 확인.
 * true면 표시를 여러 구간으로 쪼개지 않고 start~end 1구간으로 보여준다.
 */
function isSingleWeekdaySpan(sortedDates: string[]): boolean {
  if (sortedDates.length < 2) return false;
  const uniqueSorted = Array.from(new Set(sortedDates.map((d) => String(d).slice(0, 10)))).sort();
  const start = uniqueSorted[0]!;
  const end = uniqueSorted[uniqueSorted.length - 1]!;
  const set = new Set(uniqueSorted);
  const [sy, sm, sd] = start.split("-").map(Number);
  for (let i = 0; i < 366; i++) {
    const d = new Date(sy, sm - 1, sd + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const cur = `${y}-${m}-${day}`;
    if (cur > end) break;
    if (isWeekdayYmd(cur) && !set.has(cur)) return false;
  }
  return true;
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
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) weekdays.push(str);
  }
  return datesYmdToConsecutiveRanges(weekdays);
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

/** 정렬된 YYYY-MM-DD 목록 → "3/18 ~ 3/25, 3/27 ~ 3/30" 형태 */
export function periodLabelMonthDayFromSortedYmd(sortedDates: string[]): string {
  if (sortedDates.length === 0) return "";
  if (isSingleWeekdaySpan(sortedDates)) {
    const start = sortedDates[0]!;
    const end = sortedDates[sortedDates.length - 1]!;
    return start === end ? formatMonthDaySlash(start) : `${formatMonthDaySlash(start)} ~ ${formatMonthDaySlash(end)}`;
  }
  const ranges = datesYmdToConsecutiveRanges(sortedDates);
  return ranges
    .map((r) =>
      r.start === r.end
        ? formatMonthDaySlash(r.start)
        : `${formatMonthDaySlash(r.start)} ~ ${formatMonthDaySlash(r.end)}`
    )
    .join(", ");
}

/** 정렬된 YYYY-MM-DD 목록 → "26-03-18 ~ 26-03-25, ..." 형태 */
export function periodLabelShortYmdFromSortedYmd(sortedDates: string[]): string {
  if (sortedDates.length === 0) return "";
  if (isSingleWeekdaySpan(sortedDates)) {
    const start = sortedDates[0]!;
    const end = sortedDates[sortedDates.length - 1]!;
    return start === end ? shortYmdSlice(start) : `${shortYmdSlice(start)} ~ ${shortYmdSlice(end)}`;
  }
  const ranges = datesYmdToConsecutiveRanges(sortedDates);
  return ranges
    .map((r) =>
      r.start === r.end
        ? shortYmdSlice(r.start)
        : `${shortYmdSlice(r.start)} ~ ${shortYmdSlice(r.end)}`
    )
    .join(", ");
}

/** 정렬된 YYYY-MM-DD 목록 → "2026-03-18 ~ 2026-03-25, ..." (테이블용) */
export function periodLabelIsoFromSortedYmd(sortedDates: string[]): string {
  if (sortedDates.length === 0) return "";
  if (isSingleWeekdaySpan(sortedDates)) {
    const start = sortedDates[0]!;
    const end = sortedDates[sortedDates.length - 1]!;
    return start === end ? start : `${start} ~ ${end}`;
  }
  const ranges = datesYmdToConsecutiveRanges(sortedDates);
  return ranges.map((r) => (r.start === r.end ? r.start : `${r.start} ~ ${r.end}`)).join(", ");
}
