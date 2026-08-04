// 예상 주차 시간 → 등록 권종 추천 (여유분 반영 구간표)
export type ParkingTicketCounts = {
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
};

export type ParkingDurationRecommendation = {
  expectedMinutes: number;
  expectedLabel: string;
  tickets: ParkingTicketCounts;
  ticketsLabel: string;
  /** 종일권 여부 */
  isAllDay: boolean;
};

const EMPTY_TICKETS: ParkingTicketCounts = {
  all_day_cnt: 0,
  "2h_cnt": 0,
  "1h_cnt": 0,
  "30m_cnt": 0,
};

/** 4시간 30분 이상 → 종일권 */
export const ALL_DAY_THRESHOLD_MINUTES = 4 * 60 + 30;

type Bracket = { maxExclusive: number; tickets: Partial<ParkingTicketCounts> };

/**
 * 예상 주차 시간(분) 구간 → 권종.
 * 각 구간은 출차 여유(약 10~15분+)가 티켓 커버에 포함되도록 잡음.
 * 예) 2시간 5분 → 2h+30m / 3시간 45분 → 2h×2 / 4시간 30분+ → 종일
 */
const EXPECTED_MINUTES_BRACKETS: Bracket[] = [
  { maxExclusive: 21, tickets: { "30m_cnt": 1 } },
  { maxExclusive: 51, tickets: { "1h_cnt": 1 } },
  { maxExclusive: 81, tickets: { "1h_cnt": 1, "30m_cnt": 1 } },
  { maxExclusive: 111, tickets: { "2h_cnt": 1 } },
  { maxExclusive: 141, tickets: { "2h_cnt": 1, "30m_cnt": 1 } },
  { maxExclusive: 171, tickets: { "2h_cnt": 1, "1h_cnt": 1 } },
  { maxExclusive: 201, tickets: { "2h_cnt": 1, "1h_cnt": 1, "30m_cnt": 1 } },
  { maxExclusive: 231, tickets: { "2h_cnt": 2 } },
  { maxExclusive: 261, tickets: { "2h_cnt": 2, "30m_cnt": 1 } },
  { maxExclusive: ALL_DAY_THRESHOLD_MINUTES, tickets: { "2h_cnt": 2, "1h_cnt": 1 } },
];

export function parseTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 출차가 입차보다 이르면 익일 출차로 간주 */
export function expectedParkingMinutes(entryMinutes: number, exitMinutes: number): number {
  let diff = exitMinutes - entryMinutes;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

export function formatDurationMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h <= 0) return `${min}분`;
  if (min === 0) return `${h}시간`;
  return `${h}시간 ${min}분`;
}

function mergeTickets(partial: Partial<ParkingTicketCounts>): ParkingTicketCounts {
  return {
    all_day_cnt: partial.all_day_cnt ?? 0,
    "2h_cnt": partial["2h_cnt"] ?? 0,
    "1h_cnt": partial["1h_cnt"] ?? 0,
    "30m_cnt": partial["30m_cnt"] ?? 0,
  };
}

export function formatTicketCountsLabel(tickets: ParkingTicketCounts): string {
  if (tickets.all_day_cnt > 0) {
    return tickets.all_day_cnt === 1 ? "종일권" : `종일권 ${tickets.all_day_cnt}매`;
  }
  const parts: string[] = [];
  if (tickets["2h_cnt"] > 0) parts.push(`2시간권 ${tickets["2h_cnt"]}매`);
  if (tickets["1h_cnt"] > 0) parts.push(`1시간권 ${tickets["1h_cnt"]}매`);
  if (tickets["30m_cnt"] > 0) parts.push(`30분권 ${tickets["30m_cnt"]}매`);
  return parts.length > 0 ? parts.join(", ") : "없음";
}

/** 예상 주차 분 → 등록 권종 */
export function recommendTicketsForExpectedMinutes(expectedMinutes: number): ParkingTicketCounts {
  const e = Math.max(0, Math.floor(expectedMinutes));
  if (e >= ALL_DAY_THRESHOLD_MINUTES) {
    return { ...EMPTY_TICKETS, all_day_cnt: 1 };
  }
  for (const bracket of EXPECTED_MINUTES_BRACKETS) {
    if (e < bracket.maxExclusive) return mergeTickets(bracket.tickets);
  }
  return { ...EMPTY_TICKETS, all_day_cnt: 1 };
}

export function recommendParkingTickets(
  entryHhmm: string,
  exitHhmm: string
): ParkingDurationRecommendation | { error: string } {
  const entry = parseTimeToMinutes(entryHhmm);
  const exit = parseTimeToMinutes(exitHhmm);
  if (entry === null) return { error: "입차 시간을 확인해 주세요." };
  if (exit === null) return { error: "출차 예정 시간을 확인해 주세요." };

  const expectedMinutes = expectedParkingMinutes(entry, exit);
  const tickets = recommendTicketsForExpectedMinutes(expectedMinutes);
  const isAllDay = tickets.all_day_cnt > 0;

  return {
    expectedMinutes,
    expectedLabel: formatDurationMinutes(expectedMinutes),
    tickets,
    ticketsLabel: isAllDay
      ? `종일권 (4시간 30분 이상)`
      : formatTicketCountsLabel(tickets),
    isAllDay,
  };
}
