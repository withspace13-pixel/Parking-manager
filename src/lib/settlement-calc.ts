// 정산: 일자별 무료 차량(당일 발급액 상위 N대) 제외 집계
import { PRESETUP_DAILY_FREE_CAP_WON } from "@/lib/presetup";
import { TICKET_PRICES } from "@/lib/supabase";
import type { ParkingRecord } from "@/lib/supabase";

export type DayFree = ParkingRecord & { amount: number; discount: number };
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

export function settlementRecordDiscount(
  recordId: string,
  recordDiscounts: Record<string, number>
): number {
  return recordDiscounts[recordId] ?? 0;
}

export function settlementRecordCharge(
  r: ParkingRecord,
  recordDiscounts: Record<string, number>
): number {
  return Math.max(0, calcParkingRecordAmount(r) - settlementRecordDiscount(r.id, recordDiscounts));
}

export function isRecordFullyDiscounted(
  r: ParkingRecord,
  recordDiscounts: Record<string, number>
): boolean {
  const full = calcParkingRecordAmount(r);
  return full > 0 && settlementRecordDiscount(r.id, recordDiscounts) >= full;
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

export function presetupFreeFootnoteLabel(): string {
  return `사전세팅일은 1일 ${PRESETUP_DAILY_FREE_CAP_WON.toLocaleString()}원까지 무료`;
}

function applyPresetupDayDiscounts(
  withAmount: Array<ParkingRecord & { amount: number }>
): { discounts: Record<string, number>; freeEntries: DayFree[] } {
  const discounts: Record<string, number> = {};
  const freeEntries: DayFree[] = [];
  let budget = PRESETUP_DAILY_FREE_CAP_WON;

  for (const r of withAmount) {
    if (budget <= 0) break;
    const discount = Math.min(r.amount, budget);
    if (discount <= 0) continue;
    discounts[r.id] = discount;
    freeEntries.push({ ...r, discount });
    budget -= discount;
  }

  return { discounts, freeEntries };
}

/**
 * 정산 일자별·합계 집계.
 * 각 일자마다 당일 발급 총액이 높은 순으로 freeCarsPerDay대를 무료 처리.
 * 사전세팅일은 1일 18,000원까지(비싼 차량부터) 무료.
 */
export function computeSettlementTotals(
  settlementDatesSorted: string[],
  records: ParkingRecord[],
  freeCarsPerDay: number,
  options?: { presetupDates?: Set<string> }
): {
  dayFreeList: DayFree[];
  daySummaries: DaySummary[];
  totals: SettlementTotals;
  recordDiscounts: Record<string, number>;
} {
  const globalFreeN = Math.max(1, Math.min(5, Math.floor(freeCarsPerDay) || 1));
  const presetupDates = options?.presetupDates ?? new Set<string>();
  const recordDiscounts: Record<string, number> = {};

  if (!settlementDatesSorted.length || !records.length) {
    return {
      dayFreeList: [],
      daySummaries: [],
      totals: { all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0, amount: 0 },
      recordDiscounts: {},
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

    const withAmount = dayRecs
      .map((r) => ({ ...r, amount: calcParkingRecordAmount(r) }))
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.id.localeCompare(b.id);
      });

    let dayDiscounts: Record<string, number>;
    if (presetupDates.has(date)) {
      const applied = applyPresetupDayDiscounts(withAmount);
      dayDiscounts = applied.discounts;
      freeList.push(...applied.freeEntries);
    } else {
      dayDiscounts = {};
      for (const f of withAmount.slice(0, Math.min(globalFreeN, withAmount.length))) {
        dayDiscounts[f.id] = f.amount;
        freeList.push({ ...f, discount: f.amount });
      }
    }

    Object.assign(recordDiscounts, dayDiscounts);

    let dayAllDay = 0;
    let day2h = 0;
    let day1h = 0;
    let day30m = 0;
    let dayAmount = 0;

    for (const r of dayRecs) {
      const full = calcParkingRecordAmount(r);
      const discount = dayDiscounts[r.id] ?? 0;
      const amt = Math.max(0, full - discount);
      const fullyFree = full > 0 && discount >= full;

      dayAmount += amt;
      totalAmount += amt;

      if (!fullyFree) {
        dayAllDay += r.all_day_cnt;
        day2h += r["2h_cnt"];
        day1h += r["1h_cnt"];
        day30m += r["30m_cnt"];
        totalAllDay += r.all_day_cnt;
        total2h += r["2h_cnt"];
        total1h += r["1h_cnt"];
        total30m += r["30m_cnt"];
      }
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
    recordDiscounts,
  };
}
