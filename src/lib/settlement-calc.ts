// 정산: 일자별 무료 차량(당일 발급액 상위 N대) 제외 집계
import { TICKET_PRICES } from "@/lib/supabase";
import type { ParkingRecord } from "@/lib/supabase";

export type DayFree = ParkingRecord & { amount: number };
export type DaySummary = {
  date: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
  amount: number;
};

export type SettlementTotals = {
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
  amount: number;
};

export function calcParkingRecordAmount(
  r: Pick<ParkingRecord, "all_day_cnt" | "2h_cnt" | "1h_cnt" | "30m_cnt">
) {
  return (
    r.all_day_cnt * TICKET_PRICES.all_day +
    r["2h_cnt"] * TICKET_PRICES["2h"] +
    r["1h_cnt"] * TICKET_PRICES["1h"] +
    r["30m_cnt"] * TICKET_PRICES["30m"]
  );
}

/** 발급 수량 합계 라벨 */
export function freeCarsSummaryLabel(freeCarsPerDay: number) {
  const n = Math.max(1, Math.min(5, Math.floor(freeCarsPerDay) || 1));
  return `발급 수량 합계 (1일 ${n}대 무료 제외)`;
}

/** 하단 각주 문구 */
export function freeCarsFootnoteLabel(freeCarsPerDay: number) {
  const n = Math.max(1, Math.min(5, Math.floor(freeCarsPerDay) || 1));
  return `1일 ${n}대 무료`;
}

/**
 * 정산 일자별·합계 집계.
 * 각 일자마다 당일 발급 총액이 높은 순으로 freeCarsPerDay대를 무료 처리.
 */
export function computeSettlementTotals(
  settlementDatesSorted: string[],
  records: ParkingRecord[],
  freeCarsPerDay: number,
  options?: { presetupDates?: Set<string> }
): { dayFreeList: DayFree[]; daySummaries: DaySummary[]; totals: SettlementTotals } {
  const globalFreeN = Math.max(1, Math.min(5, Math.floor(freeCarsPerDay) || 1));
  const presetupDates = options?.presetupDates ?? new Set<string>();

  if (!settlementDatesSorted.length || !records.length) {
    return {
      dayFreeList: [],
      daySummaries: [],
      totals: { all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0, amount: 0 },
    };
  }

  const byDate = new Map<string, ParkingRecord[]>();
  for (const r of records) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }

  const freeList: DayFree[] = [];
  const summaries: DaySummary[] = [];
  let totalAmount = 0;
  let totalAllDay = 0;
  let total2h = 0;
  let total1h = 0;
  let total30m = 0;

  for (const date of settlementDatesSorted) {
    const dayRecs = byDate.get(date) ?? [];
    if (dayRecs.length === 0) continue;

    const freeN = presetupDates.has(date) ? 1 : globalFreeN;

    const withAmount = dayRecs
      .map((r) => ({ ...r, amount: calcParkingRecordAmount(r) }))
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.id.localeCompare(b.id);
      });

    const freeIds = new Set(withAmount.slice(0, Math.min(freeN, withAmount.length)).map((r) => r.id));
    for (const f of withAmount.slice(0, Math.min(freeN, withAmount.length))) {
      freeList.push(f);
    }

    let dayAllDay = 0;
    let day2h = 0;
    let day1h = 0;
    let day30m = 0;
    let dayAmount = 0;

    for (const r of dayRecs) {
      if (freeIds.has(r.id)) continue;

      const amt = calcParkingRecordAmount(r);
      dayAmount += amt;
      dayAllDay += r.all_day_cnt;
      day2h += r["2h_cnt"];
      day1h += r["1h_cnt"];
      day30m += r["30m_cnt"];
      totalAmount += amt;
      totalAllDay += r.all_day_cnt;
      total2h += r["2h_cnt"];
      total1h += r["1h_cnt"];
      total30m += r["30m_cnt"];
    }

    summaries.push({
      date,
      all_day_cnt: dayAllDay,
      "2h_cnt": day2h,
      "1h_cnt": day1h,
      "30m_cnt": day30m,
      amount: dayAmount,
    });
  }

  return {
    dayFreeList: freeList,
    daySummaries: summaries,
    totals: {
      all_day_cnt: totalAllDay,
      "2h_cnt": total2h,
      "1h_cnt": total1h,
      "30m_cnt": total30m,
      amount: totalAmount,
    },
  };
}
