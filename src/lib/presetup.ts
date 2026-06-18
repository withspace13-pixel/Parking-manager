// 사전세팅 일자 계산·표시·정산 연동
import type { ParkingRecord } from "@/lib/supabase";
import {
  formatMonthDaySlash,
  periodLabelIsoFromSortedYmd,
  periodLabelMonthDayFromSortedYmd,
  periodLabelShortYmdFromSortedYmd,
  shortYmdSlice,
} from "@/lib/schedule-dates";

export const PRESETUP_DAILY_FREE_CAP_WON = 18_000;
export const PRESETUP_ROOM_NAME = "사전세팅";

export function isPresetupRoomName(name: string | null | undefined): boolean {
  return String(name ?? "").trim() === PRESETUP_ROOM_NAME;
}

export type ProjectRoomDate = { date: string; room_name: string };

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 행사 시작일(사전세팅 제외 최초 일자) 기준 사전세팅 일자 */
export function computePresetupDateYmd(firstEventStartYmd: string): string {
  const [y, m, d] = String(firstEventStartYmd).slice(0, 10).split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const pre = new Date(start);
  if (start.getDay() === 1) {
    pre.setDate(pre.getDate() - 3);
  } else {
    pre.setDate(pre.getDate() - 1);
  }
  return toYmd(pre);
}

export function getFirstEventStartYmdFromRooms(rooms: ProjectRoomDate[]): string | null {
  const eventOnly = rooms
    .map((r) => ({ date: String(r.date).slice(0, 10), room_name: r.room_name }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !isPresetupRoomName(r.room_name))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (eventOnly.length > 0) return eventOnly[0]!.date;

  const all = rooms
    .map((r) => String(r.date).slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return all[0] ?? null;
}

export function findPresetupDateYmd(rooms: ProjectRoomDate[]): string | null {
  const row = rooms.find((r) => isPresetupRoomName(r.room_name));
  return row ? String(row.date).slice(0, 10) : null;
}

export function getPresetupDateSet(rooms: ProjectRoomDate[]): Set<string> {
  const d = findPresetupDateYmd(rooms);
  return d ? new Set([d]) : new Set();
}

export function hasPresetupCars(
  rooms: ProjectRoomDate[],
  records: Pick<ParkingRecord, "date">[]
): boolean {
  const presetupDate = findPresetupDateYmd(rooms);
  if (!presetupDate) return false;
  return records.some((r) => String(r.date).slice(0, 10) === presetupDate);
}

/** 사전세팅일에 차량이 있을 때만 presetup 날짜 포함 */
export function getActivePresetupDateSet(
  rooms: ProjectRoomDate[],
  records: Pick<ParkingRecord, "date">[]
): Set<string> {
  return hasPresetupCars(rooms, records) ? getPresetupDateSet(rooms) : new Set();
}

/**
 * 정산·표시에 쓸 사용 일자 (사전세팅일에 등록 차량 없으면 해당 일 제외)
 */
export function getUsageDatesSorted(
  rooms: ProjectRoomDate[],
  records: Pick<ParkingRecord, "date">[],
  allRoomDatesSorted: string[] = []
): string[] {
  const eventOnly = getEventOnlyDatesSorted(rooms);
  const presetupDate = findPresetupDateYmd(rooms);
  const includePresetup = hasPresetupCars(rooms, records);

  if (eventOnly.length > 0) {
    if (includePresetup && presetupDate) {
      return Array.from(new Set([...eventOnly, presetupDate])).sort();
    }
    return eventOnly;
  }

  if (presetupDate && !includePresetup) {
    return allRoomDatesSorted.filter((d) => d !== presetupDate);
  }
  return allRoomDatesSorted;
}

export function getEventOnlyDatesSorted(rooms: ProjectRoomDate[]): string[] {
  const set = new Set<string>();
  for (const r of rooms) {
    if (isPresetupRoomName(r.room_name)) continue;
    const d = String(r.date).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d);
  }
  return Array.from(set).sort();
}

/** 사전세팅 일자에 등록 차량이 있으면 +1 반영한 사용 일수 문구 */
export function buildUsageDaysBadgeText(
  rooms: ProjectRoomDate[],
  records: Pick<ParkingRecord, "date">[],
  allRoomDatesSorted: string[] = [],
  fallbackEventDayCount?: number
): string {
  const usageDates = getUsageDatesSorted(rooms, records, allRoomDatesSorted);
  const n =
    usageDates.length > 0 ? usageDates.length : Math.max(0, fallbackEventDayCount ?? 0);
  if (hasPresetupCars(rooms, records)) {
    return `${n}일 사용 (사전세팅 1일 포함)`;
  }
  return n > 0 ? `${n}일 사용` : "0일 사용";
}

/** 사전세팅 룸이 있고 표시 일자에 포함되면 앞에 분리 (예: 6/12, 6/15 ~ 19) */
function joinPresetupPeriodLabel(
  rooms: ProjectRoomDate[],
  sortedDates: string[],
  formatPresetup: (ymd: string) => string,
  formatRest: (dates: string[]) => string
): string {
  const presetupDate = findPresetupDateYmd(rooms);
  if (!presetupDate) return formatRest(sortedDates);
  const dateSet = new Set(sortedDates.map((d) => String(d).slice(0, 10)));
  if (!dateSet.has(presetupDate)) return formatRest(sortedDates);
  const eventDates = sortedDates.filter((d) => String(d).slice(0, 10) !== presetupDate);
  const presetupPart = formatPresetup(presetupDate);
  const eventPart = formatRest(eventDates);
  return eventPart ? `${presetupPart}, ${eventPart}` : presetupPart;
}

export function periodLabelMonthDayFromRooms(rooms: ProjectRoomDate[], sortedDates: string[]): string {
  return joinPresetupPeriodLabel(rooms, sortedDates, formatMonthDaySlash, periodLabelMonthDayFromSortedYmd);
}

export function periodLabelShortYmdFromRooms(rooms: ProjectRoomDate[], sortedDates: string[]): string {
  return joinPresetupPeriodLabel(rooms, sortedDates, shortYmdSlice, periodLabelShortYmdFromSortedYmd);
}

export function periodLabelIsoFromRooms(rooms: ProjectRoomDate[], sortedDates: string[]): string {
  return joinPresetupPeriodLabel(
    rooms,
    sortedDates,
    (d) => String(d).slice(0, 10),
    periodLabelIsoFromSortedYmd
  );
}
