"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Calculator, Home, Receipt } from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { supabase } from "@/lib/supabase";
import type { Project, ParkingRecord } from "@/lib/supabase";
import { TICKET_PRICES } from "@/lib/supabase";

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

type DayFree = {
  date: string;
  vehicle_num: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
  amount: number;
};

type DaySummary = {
  date: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
  amount: number;
};

function calcAmount(r: {
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
}) {
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

export default function SettlementPage() {
  const params = useParams();
  const projectId = params.id as string;
  const devStore = useDevStore();
  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [dayFreeList, setDayFreeList] = useState<DayFree[]>([]);
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [totals, setTotals] = useState({
    all_day_cnt: 0,
    "2h_cnt": 0,
    "1h_cnt": 0,
    "30m_cnt": 0,
    amount: 0,
  });

  const dateList =
    project?.start_date && project?.end_date
      ? getDateRange(project.start_date, project.end_date)
      : [];

  useEffect(() => {
    if (isDevMode()) {
      const p = devStore.getProject(projectId);
      if (p) setProject(p);
      const recs = devStore.getParkingRecords(projectId);
      setRecords(recs);
      return;
    }
    async function load() {
      const { data: p } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (p) setProject(p as Project);

      const { data: recs } = await supabase
        .from("parking_records")
        .select("*")
        .eq("project_id", projectId)
        .order("date")
        .order("vehicle_num");
      setRecords((recs || []) as ParkingRecord[]);
    }
    load();
  }, [projectId, devStore.data]);

  useEffect(() => {
    if (!dateList.length || !records.length) {
      setDayFreeList([]);
      setDaySummaries([]);
      setTotals({ all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0, amount: 0 });
      return;
    }

    const byDate = new Map<string, ParkingRecord[]>();
    records.forEach((r) => {
      const list = byDate.get(r.date) ?? [];
      list.push(r);
      byDate.set(r.date, list);
    });

    const freeList: DayFree[] = [];
    const summaries: DaySummary[] = [];
    let totalAmount = 0;
    let totalAllDay = 0;
    let total2h = 0;
    let total1h = 0;
    let total30m = 0;

    dateList.forEach((date) => {
      const dayRecs = byDate.get(date) ?? [];
      if (dayRecs.length === 0) return;

      const withAmount = dayRecs.map((r) => ({ ...r, amount: calcAmount(r) }));
      const max = withAmount.reduce((a, b) => (a.amount >= b.amount ? a : b));
      freeList.push({
        date: max.date,
        vehicle_num: max.vehicle_num,
        all_day_cnt: max.all_day_cnt,
        "2h_cnt": max["2h_cnt"],
        "1h_cnt": max["1h_cnt"],
        "30m_cnt": max["30m_cnt"],
        amount: max.amount,
      });

      let dayAllDay = 0;
      let day2h = 0;
      let day1h = 0;
      let day30m = 0;
      let dayAmount = 0;

      dayRecs.forEach((r) => {
        const isFree = r.vehicle_num === max.vehicle_num && r.date === max.date;
        if (!isFree) {
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
      });

      summaries.push({
        date,
        all_day_cnt: dayAllDay,
        "2h_cnt": day2h,
        "1h_cnt": day1h,
        "30m_cnt": day30m,
        amount: dayAmount,
      });
    });

    setDayFreeList(freeList);
    setDaySummaries(summaries);
    setTotals({
      all_day_cnt: totalAllDay,
      "2h_cnt": total2h,
      "1h_cnt": total1h,
      "30m_cnt": total30m,
      amount: totalAmount,
    });
  }, [dateList, records]);

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

  const formatDate = (d: string) => {
    const [, m, day] = d.split("-");
    return `${m}/${day}`;
  };

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
        <div className="card card-hover mb-8 p-6">
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
            사용 일자: {project.start_date} ~ {project.end_date}
          </p>
        </div>

        <div className="card card-hover mb-8 overflow-hidden p-0">
          <h3 className="flex items-center gap-2 border-b border-[var(--border)] px-6 py-4 text-sm font-semibold text-[var(--text)]">
            <Calculator className="h-4 w-4 text-[var(--text-muted)]" />
            일자별 발급 수량 및 정산 금액 (무료 건 제외)
          </h3>
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
                  <td className="px-6 py-3 text-[var(--text-muted)]">{row.date}</td>
                  <td className="px-4 py-3 text-center text-[var(--text-muted)]">
                    {row.all_day_cnt}매
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--text-muted)]">
                    {row["2h_cnt"]}매
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--text-muted)]">
                    {row["1h_cnt"]}매
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--text-muted)]">
                    {row["30m_cnt"]}매
                  </td>
                  <td className="px-6 py-3 text-right text-[var(--text)]">
                    {row.amount.toLocaleString()}원
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[var(--border)] bg-[#F9FAFB]">
                <td className="px-6 py-4 font-semibold text-[var(--text)]">합계</td>
                <td className="px-4 py-4 text-center font-semibold text-[var(--text)]">
                  {totals.all_day_cnt}매
                </td>
                <td className="px-4 py-4 text-center font-semibold text-[var(--text)]">
                  {totals["2h_cnt"]}매
                </td>
                <td className="px-4 py-4 text-center font-semibold text-[var(--text)]">
                  {totals["1h_cnt"]}매
                </td>
                <td className="px-4 py-4 text-center font-semibold text-[var(--text)]">
                  {totals["30m_cnt"]}매
                </td>
                <td className="px-6 py-4 text-right text-xl font-semibold text-[var(--text)]">
                  {totals.amount.toLocaleString()}원
                </td>
              </tr>
            </tbody>
          </table>
          <p className="px-6 pb-4 pt-2 text-sm font-semibold text-red-600">
            ※ 위 수량 및 금액은 아래 무료 적용 차량(1일 1대 최상위 금액) 건을 제외한 기준입니다.
          </p>
        </div>

        <div className="card card-hover overflow-hidden p-0">
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
                <li key={`${row.date}-${row.vehicle_num}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-6 py-4 text-sm transition-colors hover:bg-[#F8FAFC]">
                  <span className="font-medium text-[var(--text)]">{formatDate(row.date)}</span>
                  <span className="font-bold text-[var(--text)]">{row.vehicle_num}차량</span>
                  <span className="text-[var(--text-muted)]">– {formatFreeDetail(row)} 무료 적용</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => {
              window.location.href = `/projects/${projectId}/parking`;
            }}
            className="btn btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            주차권 등록
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="btn inline-flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            목록
          </button>
        </div>
      </main>
    </div>
  );
}
