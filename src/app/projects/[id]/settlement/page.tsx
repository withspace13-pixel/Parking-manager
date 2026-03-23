// NOTE: 이 파일은 컴파일 에러(보이지 않는 깨진 문자) 방지를 위해 전체를 재작성했습니다.
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, Home, Receipt } from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { supabase, TICKET_PRICES } from "@/lib/supabase";
import type { Project, ParkingRecord } from "@/lib/supabase";

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

type DayFree = ParkingRecord & { amount: number };
type DaySummary = {
  date: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
  amount: number;
};

function calcAmount(r: Pick<ParkingRecord, "all_day_cnt" | "2h_cnt" | "1h_cnt" | "30m_cnt">) {
  return (
    r.all_day_cnt * TICKET_PRICES.all_day +
    r["2h_cnt"] * TICKET_PRICES["2h"] +
    r["1h_cnt"] * TICKET_PRICES["1h"] +
    r["30m_cnt"] * TICKET_PRICES["30m"]
  );
}

function formatFreeDetail(r: DayFree): string {
  const parts: string[] = [];
  if (r.all_day_cnt) parts.push(`종일권 ${r.all_day_cnt}매`);
  if (r["2h_cnt"]) parts.push(`2시간 ${r["2h_cnt"]}매`);
  if (r["1h_cnt"]) parts.push(`1시간 ${r["1h_cnt"]}매`);
  if (r["30m_cnt"]) parts.push(`30분 ${r["30m_cnt"]}매`);
  return parts.length ? parts.join(", ") : "없음";
}

/** YYYY-MM-DD → YY-MM-DD (상단 사용 일자용) */
function shortDate(d: string) {
  return d.length >= 10 ? d.slice(2) : d;
}

/** YYYY-MM-DD → MM/DD (테이블·리스트용, 연도 미표기) */
function monthDay(d: string) {
  if (d.length < 10) return d;
  const [, m, day] = d.split("-");
  return `${m}/${day}`;
}

export default function SettlementPage() {
  const params = useParams();
  const projectId = params.id as string;
  const devStore = useDevStore();

  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<ParkingRecord[]>([]);

  const dateList = useMemo(
    () => (project?.start_date && project?.end_date ? getDateRange(project.start_date, project.end_date) : []),
    [project?.start_date, project?.end_date]
  );

  useEffect(() => {
    if (isDevMode()) {
      const p = devStore.getProject(projectId);
      if (p) setProject(p);
      setRecords(devStore.getParkingRecords(projectId));
      return;
    }
    (async () => {
      const { data: p } = await supabase.from("projects").select("*").eq("id", projectId).single();
      if (p) setProject(p as Project);
      const { data: recs } = await supabase
        .from("parking_records")
        .select("*")
        .eq("project_id", projectId)
        .order("date")
        .order("vehicle_num");
      setRecords((recs || []) as ParkingRecord[]);
    })();
  }, [projectId, devStore.data]);

  const { dayFreeList, daySummaries, totals } = useMemo(() => {
    if (!dateList.length || !records.length) {
      return {
        dayFreeList: [] as DayFree[],
        daySummaries: [] as DaySummary[],
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

    for (const date of dateList) {
      const dayRecs = byDate.get(date) ?? [];
      if (dayRecs.length === 0) continue;

      const withAmount = dayRecs.map((r) => ({ ...r, amount: calcAmount(r) }));
      const max = withAmount.reduce((a, b) => (a.amount >= b.amount ? a : b));
      freeList.push(max);

      let dayAllDay = 0;
      let day2h = 0;
      let day1h = 0;
      let day30m = 0;
      let dayAmount = 0;

      for (const r of dayRecs) {
        const isFree = r.vehicle_num === max.vehicle_num && r.date === max.date;
        if (isFree) continue;

        const amt = calcAmount(r);
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

      summaries.push({ date, all_day_cnt: dayAllDay, "2h_cnt": day2h, "1h_cnt": day1h, "30m_cnt": day30m, amount: dayAmount });
    }

    return {
      dayFreeList: freeList,
      daySummaries: summaries,
      totals: { all_day_cnt: totalAllDay, "2h_cnt": total2h, "1h_cnt": total1h, "30m_cnt": total30m, amount: totalAmount },
    };
  }, [dateList, records]);

  const sortedRecords = useMemo(
    () =>
      records
        .slice()
        .sort((a, b) => (a.date === b.date ? a.vehicle_num.localeCompare(b.vehicle_num) : a.date.localeCompare(b.date))),
    [records]
  );

  const freeKeySet = useMemo(() => new Set(dayFreeList.map((f) => `${f.date}-${f.vehicle_num}`)), [dayFreeList]);

  const listTotals = useMemo(() => {
    return sortedRecords.reduce(
      (acc, r) => {
        const key = `${r.date}-${r.vehicle_num}`;
        const isFree = freeKeySet.has(key);
        const amount = isFree ? 0 : calcAmount(r);
        acc.all_day_cnt += r.all_day_cnt;
        acc["2h_cnt"] += r["2h_cnt"];
        acc["1h_cnt"] += r["1h_cnt"];
        acc["30m_cnt"] += r["30m_cnt"];
        acc.amount += amount;
        return acc;
      },
      { all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0, amount: 0 }
    );
  }, [sortedRecords, freeKeySet]);

  if (!project) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-[var(--text-muted)]">로딩 중...</p>
        <Link href="/" className="mt-4 inline-flex items-center gap-2 text-[var(--primary)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> 대시보드
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text-muted)] shadow-sm hover:bg-[var(--bg)] hover:text-[var(--text)]"
                aria-label="홈으로"
              >
                <Home className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-semibold text-[var(--text)]">정산</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="card-raise mb-8 p-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">기관명</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{project.org_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">담당자</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text)]">{project.manager}</p>
            </div>
          </div>
          <p className="mt-4 text-base font-semibold text-[var(--text)]">
            사용 일자: {project.start_date === project.end_date
              ? shortDate(project.start_date)
              : `${shortDate(project.start_date)} ~ ${shortDate(project.end_date)}`}
          </p>
        </div>

        <div className="card-raise mb-8 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Calculator className="h-4 w-4 text-[var(--text-muted)]" />
              일자별 발급 수량 및 정산 금액 (무료 건 제외)
            </h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[var(--text-muted)]">
                <th className="px-6 py-4 font-medium text-[var(--text)]">일자</th>
                <th className="px-4 py-4 text-center font-medium text-[var(--text)]">종일권</th>
                <th className="px-4 py-4 text-center font-medium text-[var(--text)]">2시간</th>
                <th className="px-4 py-4 text-center font-medium text-[var(--text)]">1시간</th>
                <th className="px-4 py-4 text-center font-medium text-[var(--text)]">30분</th>
                <th className="px-6 py-4 text-right font-medium text-[var(--text)]">일자 합계</th>
              </tr>
            </thead>
            <tbody>
              {daySummaries.map((row) => (
                <tr key={row.date} className="table-row-hover">
                  <td className="px-6 py-4 text-[var(--text-muted)]">{monthDay(row.date)}</td>
                  <td className="px-4 py-4 text-center text-[var(--text-muted)]">{row.all_day_cnt}매</td>
                  <td className="px-4 py-4 text-center text-[var(--text-muted)]">{row["2h_cnt"]}매</td>
                  <td className="px-4 py-4 text-center text-[var(--text-muted)]">{row["1h_cnt"]}매</td>
                  <td className="px-4 py-4 text-center text-[var(--text-muted)]">{row["30m_cnt"]}매</td>
                  <td className="px-6 py-4 text-right text-[var(--text)]">{row.amount.toLocaleString()}원</td>
                </tr>
              ))}
              <tr className="border-t border-[var(--border)]">
                <td className="px-6 py-5 font-semibold text-[var(--text)]">합계</td>
                <td className="px-4 py-5 text-center font-semibold text-[var(--text)]">{totals.all_day_cnt}매</td>
                <td className="px-4 py-5 text-center font-semibold text-[var(--text)]">{totals["2h_cnt"]}매</td>
                <td className="px-4 py-5 text-center font-semibold text-[var(--text)]">{totals["1h_cnt"]}매</td>
                <td className="px-4 py-5 text-center font-semibold text-[var(--text)]">{totals["30m_cnt"]}매</td>
                <td className="px-6 py-5 text-right text-3xl font-bold text-emboss">{totals.amount.toLocaleString()}원</td>
              </tr>
            </tbody>
          </table>
          <p className="px-6 pb-4 pt-2 text-sm font-semibold text-red-600">
            ※ 위 수량 및 금액은 아래 무료 적용 차량(1일 1대 최상위 금액) 건을 제외한 기준입니다.
          </p>
        </div>

        <div className="mt-8 card p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">전체 발급 내역 (차량 · 일자별)</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                총 {records.length.toLocaleString()}건 · 일자/차량 순으로 정렬된 상세 발급 내역입니다.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-[var(--border)] border-collapse text-left text-sm">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="border-b border-[var(--border)] bg-[#F9FAFB] px-4 py-3 font-medium text-[var(--text)]">사용 일자</th>
                  <th className="border-b border-[var(--border)] bg-[#F9FAFB] px-4 py-3 font-medium text-[var(--text)]">차량 번호</th>
                  <th className="border-b border-[var(--border)] bg-[#F9FAFB] px-4 py-3 text-center font-medium text-[var(--text)]">종일권</th>
                  <th className="border-b border-[var(--border)] bg-[#F9FAFB] px-4 py-3 text-center font-medium text-[var(--text)]">2시간</th>
                  <th className="border-b border-[var(--border)] bg-[#F9FAFB] px-4 py-3 text-center font-medium text-[var(--text)]">1시간</th>
                  <th className="border-b border-[var(--border)] bg-[#F9FAFB] px-4 py-3 text-center font-medium text-[var(--text)]">30분</th>
                  <th className="border-b border-[var(--border)] bg-[#F9FAFB] px-4 py-3 text-right font-medium text-[var(--text)]">금액</th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((r) => {
                  const key = `${r.date}-${r.vehicle_num}`;
                  const isFree = freeKeySet.has(key);
                  const amount = isFree ? 0 : calcAmount(r);
                  return (
                    <tr key={r.id} className={`table-row-hover ${isFree ? "bg-amber-100" : "bg-white"}`}>
                      <td className="border-t border-[var(--border)] px-4 py-2 text-[var(--text-muted)]">{monthDay(r.date)}</td>
                      <td className="border-t border-[var(--border)] px-4 py-2 font-medium text-[var(--text)]">{r.vehicle_num}</td>
                      <td className="border-t border-[var(--border)] px-4 py-2 text-center text-[var(--text-muted)]">{r.all_day_cnt}</td>
                      <td className="border-t border-[var(--border)] px-4 py-2 text-center text-[var(--text-muted)]">{r["2h_cnt"]}</td>
                      <td className="border-t border-[var(--border)] px-4 py-2 text-center text-[var(--text-muted)]">{r["1h_cnt"]}</td>
                      <td className="border-t border-[var(--border)] px-4 py-2 text-center text-[var(--text-muted)]">{r["30m_cnt"]}</td>
                      <td className="border-t border-[var(--border)] px-4 py-2 text-right text-[var(--text)]">{amount.toLocaleString()}원</td>
                    </tr>
                  );
                })}
                <tr className="bg-[#F9FAFB]">
                  <td className="border-t border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text)]">합계</td>
                  <td className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">-</td>
                  <td className="border-t border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--text)]">{listTotals.all_day_cnt}</td>
                  <td className="border-t border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--text)]">{listTotals["2h_cnt"]}</td>
                  <td className="border-t border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--text)]">{listTotals["1h_cnt"]}</td>
                  <td className="border-t border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--text)]">{listTotals["30m_cnt"]}</td>
                  <td className="border-t border-[var(--border)] px-4 py-3 text-right text-base font-bold text-[var(--text)]">{listTotals.amount.toLocaleString()}원</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm font-semibold text-red-600">
            ※ 위 수량 및 금액은 아래 무료 적용 차량(1일 1대 최상위 금액) 건을 제외한 기준입니다.
          </p>
        </div>

        <div className="mt-8 card-raise overflow-hidden p-0">
          <h3 className="flex items-center gap-2 border-b border-[var(--border)] px-6 py-4 text-sm font-semibold text-[var(--text)]">
            <Receipt className="h-4 w-4 text-[var(--text-muted)]" />
            1일 1대 최상위 금액 차량 무료 적용 내역
          </h3>
          <p className="border-b border-[var(--border)] px-6 py-3 text-xs text-[var(--text-muted)]">
            각 날짜별 당일 발급 총액이 가장 높은 차량 1대를 무료 처리했습니다.
          </p>
          <ul className="divide-y divide-[var(--border)]">
            {dayFreeList.length === 0 ? (
              <li className="px-6 py-10 text-center text-[var(--text-muted)]">해당 기간 발급 내역이 없습니다.</li>
            ) : (
              dayFreeList.map((row) => (
                <li key={`${row.date}-${row.vehicle_num}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-6 py-5 text-sm transition-colors table-row-hover">
                  <span className="font-medium text-[var(--text)]">{monthDay(row.date)}</span>
                  <span className="font-bold text-[var(--text)]">{row.vehicle_num}차량</span>
                  <span className="text-[var(--text-muted)]">– {formatFreeDetail(row)} 무료 적용</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="mt-8 flex gap-3">
          <button type="button" onClick={() => (window.location.href = `/projects/${projectId}/parking`)} className="btn btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            주차권 등록
          </button>
          <button type="button" onClick={() => (window.location.href = "/")} className="btn inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <ArrowLeft className="h-4 w-4" />
            목록
          </button>
        </div>
      </main>
    </div>
  );
}
