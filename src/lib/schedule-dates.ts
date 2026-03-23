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
  const ranges = datesYmdToConsecutiveRanges(sortedDates);
  return ranges.map((r) => (r.start === r.end ? r.start : `${r.start} ~ ${r.end}`)).join(", ");
}
