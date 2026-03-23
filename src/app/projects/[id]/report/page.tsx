"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FileText, Home } from "lucide-react";
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

function formatTicketSummary(r: ParkingRecord): string {
  const parts: string[] = [];
  if (r.all_day_cnt) parts.push(`종일 ${r.all_day_cnt}매`);
  if (r["2h_cnt"]) parts.push(`2h ${r["2h_cnt"]}매`);
  if (r["1h_cnt"]) parts.push(`1h ${r["1h_cnt"]}매`);
  if (r["30m_cnt"]) parts.push(`30m ${r["30m_cnt"]}매`);
  return parts.length ? parts.join(", ") : "—";
}

function formatFreeTicketDetail(r: ParkingRecord): string {
  const parts: string[] = [];
  if (r.all_day_cnt) parts.push(`종일 ${r.all_day_cnt}매`);
  if (r["2h_cnt"]) parts.push(`2h ${r["2h_cnt"]}매`);
  if (r["1h_cnt"]) parts.push(`1h ${r["1h_cnt"]}매`);
  if (r["30m_cnt"]) parts.push(`30m ${r["30m_cnt"]}매`);
  return parts.length ? parts.join(", ") : "—";
}

type ReportRow = {
  vehicle_num: string;
  ticketSummary: string;
  date: string;
  amount: number;
  isFree: boolean;
};

type FreeRow = {
  date: string;
  vehicle_num: string;
  ticketDetail: string;
};

export default function ProjectReportPage() {
  const params = useParams();
  const projectId = params.id as string;
  const devStore = useDevStore();
  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<ParkingRecord[]>([]);

  useEffect(() => {
    if (isDevMode()) {
      const p = devStore.getProject(projectId);
      if (p) setProject(p);
      const recs = devStore.getParkingRecords(projectId);
      setRecords(recs);
      return;
    }
    (async () => {
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
    })();
  }, [projectId, devStore.data]);

  const { rows, freeList, totals } = useMemo(() => {
    const dateList =
      project?.start_date && project?.end_date
        ? getDateRange(project.start_date, project.end_date)
        : [];
    const byDate = new Map<string, ParkingRecord[]>();
    records.forEach((r) => {
      const list = byDate.get(r.date) ?? [];
      list.push(r);
      byDate.set(r.date, list);
    });

    const freeSet = new Set<string>();
    const freeRows: FreeRow[] = [];
    dateList.forEach((date) => {
      const dayRecs = byDate.get(date) ?? [];
      if (dayRecs.length === 0) return;
      const withAmount = dayRecs.map((r) => ({ ...r, amount: calcAmount(r) }));
      const max = withAmount.reduce((a, b) => (a.amount >= b.amount ? a : b));
      freeSet.add(`${max.date}\t${max.vehicle_num}`);
      freeRows.push({
        date: max.date,
        vehicle_num: max.vehicle_num,
        ticketDetail: formatFreeTicketDetail(max),
      });
    });

    const reportRows: ReportRow[] = records
      .map((r) => {
        const amount = calcAmount(r);
        const isFree = freeSet.has(`${r.date}\t${r.vehicle_num}`);
        return {
          vehicle_num: r.vehicle_num,
          ticketSummary: formatTicketSummary(r),
          date: r.date,
          amount: isFree ? 0 : amount,
          isFree,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.vehicle_num.localeCompare(b.vehicle_num));

    const paidTotal = reportRows.filter((r) => !r.isFree).reduce((s, r) => s + r.amount, 0);
    const totalAllDay = records.reduce((s, r) => s + r.all_day_cnt, 0);
    const total2h = records.reduce((s, r) => s + r["2h_cnt"], 0);
    const total1h = records.reduce((s, r) => s + r["1h_cnt"], 0);
    const total30m = records.reduce((s, r) => s + r["30m_cnt"], 0);

    return {
      rows: reportRows,
      freeList: freeRows,
      totals: {
        all_day_cnt: totalAllDay,
        "2h_cnt": total2h,
        "1h_cnt": total1h,
        "30m_cnt": total30m,
        amount: paidTotal,
      },
    };
  }, [project, records]);

  if (!project) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-[var(--text-muted)]">로딩 중...</p>
        <Link href="/" className="mt-4 inline-flex items-center gap-2 text-[var(--primary)] hover:underline">
          <Home className="h-4 w-4" /> 홈
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { window.location.href = "/"; }}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text-muted)] shadow-sm hover:bg-[var(--bg)] hover:text-[var(--text)]"
                aria-label="홈으로"
              >
                <Home className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-semibold text-[var(--text)]">행사 보고서</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--text)]">{project.org_name}</h2>
          <p className="text-sm text-[var(--text-muted)]">{project.manager} · {project.start_date === project.end_date ? project.start_date : `${project.start_date} ~ ${project.end_date}`}</p>
        </div>

        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[#F8FAFC]">
                  <th className="px-4 py-3 font-semibold text-[var(--text)]">차량번호</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text)]">등록한 권종 및 매수</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text)]">날짜</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text)] text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      등록된 기록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr
                      key={`${row.date}-${row.vehicle_num}-${i}`}
                      className={`border-b border-[var(--border)] ${
                        row.isFree ? "bg-amber-100/80" : "bg-white"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-[var(--text)]">{row.vehicle_num}</td>
                      <td className="px-4 py-2.5 text-[var(--text)]">{row.ticketSummary}</td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)]">{row.date}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-[var(--text)]">
                        {row.isFree ? "무료" : `${row.amount.toLocaleString()}원`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[var(--border)] bg-[#F1F5F9] px-4 py-4">
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)]">합계 권종</p>
                <p className="mt-0.5 text-sm text-[var(--text)]">
                  종일 {totals.all_day_cnt}매 · 2h {totals["2h_cnt"]}매 · 1h {totals["1h_cnt"]}매 · 30m {totals["30m_cnt"]}매
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-[var(--text-muted)]">금액</p>
                <p className="mt-0.5 text-xl font-bold text-[var(--text)]">
                  정산 합계 {totals.amount.toLocaleString()}원
                </p>
              </div>
            </div>
          )}
        </div>

        {freeList.length > 0 && (
          <div className="card mt-8 overflow-hidden p-0">
            <div className="border-b border-[var(--border)] bg-amber-50 px-4 py-3">
              <h3 className="font-semibold text-[var(--text)]">무료 처리 차량</h3>
              <p className="text-xs text-[var(--text-muted)]">일자별 최상위 금액 1대 무료 적용</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[#F8FAFC]">
                    <th className="px-4 py-3 font-semibold text-[var(--text)]">일자</th>
                    <th className="px-4 py-3 font-semibold text-[var(--text)]">차량 번호</th>
                    <th className="px-4 py-3 font-semibold text-[var(--text)]">권종</th>
                  </tr>
                </thead>
                <tbody>
                  {freeList.map((f, i) => (
                    <tr key={`${f.date}-${f.vehicle_num}-${i}`} className="border-b border-[var(--border)] bg-amber-100/60">
                      <td className="px-4 py-2.5 text-[var(--text)]">{f.date}</td>
                      <td className="px-4 py-2.5 font-medium text-[var(--text)]">{f.vehicle_num}</td>
                      <td className="px-4 py-2.5 text-[var(--text)]">{f.ticketDetail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-8">
          <button
            type="button"
            onClick={() => { window.location.href = "/"; }}
            className="btn inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Home className="h-4 w-4" />
            목록으로
          </button>
        </div>
      </main>
    </div>
  );
}
