// NOTE: 이 파일은 컴파일 에러(보이지 않는 깨진 문자) 방지를 위해 전체를 재작성했습니다.
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Calculator, Download, Home } from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { datesYmdToConsecutiveRanges, periodLabelMonthDayFromSortedYmd } from "@/lib/schedule-dates";
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

function toMonthDayParts(ymd: string) {
  const [, m, d] = String(ymd).slice(0, 10).split("-");
  return { m: Number(m), d: Number(d) };
}

function formatCompactRange(start: string, end: string) {
  const s = toMonthDayParts(start);
  const e = toMonthDayParts(end);
  if (start === end) return `${s.m}/${s.d}`;
  if (s.m === e.m) return `${s.m}/${s.d} ~ ${e.d}`;
  return `${s.m}/${s.d} ~ ${e.m}/${e.d}`;
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());
}

function clampYmd(ymd: string, min: string, max: string): string {
  const d = ymd.slice(0, 10);
  if (d < min) return min;
  if (d > max) return max;
  return d;
}

/** 여러 시작~종료 구간의 날짜 합집합(정렬), 행사 기간 [min,max] 안으로 자름 */
function unionDatesFromRanges(
  ranges: Array<{ start: string; end: string }>,
  min: string,
  max: string
): string[] {
  const set = new Set<string>();
  for (const r of ranges) {
    const s = clampYmd(String(r.start).trim().slice(0, 10), min, max);
    const e = clampYmd(String(r.end).trim().slice(0, 10), min, max);
    if (!isYmd(s) || !isYmd(e) || s > e) continue;
    getDateRange(s, e).forEach((d) => set.add(d));
  }
  return Array.from(set).sort();
}

export default function SettlementPageClient() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const devStore = useDevStore();

  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [eventDates, setEventDates] = useState<string[]>([]);
  const pdfExportRef = useRef<HTMLDivElement>(null);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [settlementEditorOpen, setSettlementEditorOpen] = useState(false);
  /** 정산에 포함할 기간(행사 start~end 범위 내). 기본은 행사 전체 */
  const [settlementRanges, setSettlementRanges] = useState<Array<{ start: string; end: string }>>([]);
  /** 정산 일자 집계 시 주말 포함(기본: 제외) */
  const [includeWeekendsInSettlement, setIncludeWeekendsInSettlement] = useState(false);

  const projectMin = eventDates.length > 0 ? eventDates[0] : project ? String(project.start_date).slice(0, 10) : "";
  const projectMax =
    eventDates.length > 0 ? eventDates[eventDates.length - 1] : project ? String(project.end_date).slice(0, 10) : "";
  const eventDateSet = useMemo(() => new Set(eventDates), [eventDates]);

  useEffect(() => {
    if (!project) return;
    if (eventDates.length > 0) {
      const split = datesYmdToConsecutiveRanges(eventDates);
      setSettlementRanges(split.length > 0 ? split : [{ start: projectMin, end: projectMax }]);
      return;
    }
    if (projectMin && projectMax) {
      setSettlementRanges([{ start: projectMin, end: projectMax }]);
    }
  }, [project?.id, projectMin, projectMax, eventDates]);

  const settlementDatesSorted = useMemo(() => {
    if (!project || !projectMin || !projectMax) return [];
    let raw: string[];
    if (settlementRanges.length === 0) {
      raw = getDateRange(projectMin, projectMax);
    } else {
      raw = unionDatesFromRanges(settlementRanges, projectMin, projectMax);
    }
    if (eventDates.length > 0) {
      raw = raw.filter((d) => eventDateSet.has(d));
    }
    if (includeWeekendsInSettlement) return raw;
    return raw.filter((ymd) => {
      const [y, m, d] = ymd.split("-").map(Number);
      const day = new Date(y, m - 1, d).getDay();
      return day !== 0 && day !== 6;
    });
  }, [project, projectMin, projectMax, settlementRanges, includeWeekendsInSettlement, eventDates, eventDateSet]);

  const settlementDateSet = useMemo(() => new Set(settlementDatesSorted), [settlementDatesSorted]);

  const filteredRecords = useMemo(
    () => records.filter((r) => settlementDateSet.has(String(r.date).slice(0, 10))),
    [records, settlementDateSet]
  );

  useEffect(() => {
    if (isDevMode()) {
      const p = devStore.getProject(projectId);
      if (p) setProject(p);
      const roomDates = (devStore.getRooms(projectId) ?? [])
        .map((r) => String(r.date).slice(0, 10))
        .filter(isYmd)
        .sort();
      setEventDates(Array.from(new Set(roomDates)));
      setRecords(devStore.getParkingRecords(projectId));
      return;
    }
    (async () => {
      const { data: p } = await supabase.from("projects").select("*").eq("id", projectId).single();
      if (p) setProject(p as Project);
      const { data: rooms } = await supabase
        .from("project_rooms")
        .select("date")
        .eq("project_id", projectId)
        .order("date");
      const roomDates = (rooms || [])
        .map((r: { date: string }) => String(r.date).slice(0, 10))
        .filter(isYmd)
        .sort();
      setEventDates(Array.from(new Set(roomDates)));
      const { data: recs } = await supabase
        .from("parking_records")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      setRecords((recs || []) as ParkingRecord[]);
    })();
  }, [projectId, devStore.data]);
  const eventPeriodLabel = useMemo(() => {
    if (eventDates.length === 0) {
      if (!project) return "";
      return project.start_date === project.end_date
        ? shortDate(project.start_date)
        : `${shortDate(project.start_date)} ~ ${shortDate(project.end_date)}`;
    }
    return periodLabelMonthDayFromSortedYmd(eventDates);
  }, [eventDates, project]);

  const settlementLabelCompact = useMemo(() => {
    if (!settlementDatesSorted.length) return "선택된 정산 일자가 없습니다.";
    return datesYmdToConsecutiveRanges(settlementDatesSorted)
      .map((r) => formatCompactRange(r.start, r.end))
      .join(" ,   ");
  }, [settlementDatesSorted]);

  const isSettlementSameAsUsage = useMemo(() => {
    const usage = eventDates;
    if (usage.length !== settlementDatesSorted.length) return false;
    for (let i = 0; i < usage.length; i++) {
      if (usage[i] !== settlementDatesSorted[i]) return false;
    }
    return true;
  }, [eventDates, settlementDatesSorted]);


  const { dayFreeList, daySummaries, totals } = useMemo(() => {
    if (!settlementDatesSorted.length || !filteredRecords.length) {
      return {
        dayFreeList: [] as DayFree[],
        daySummaries: [] as DaySummary[],
        totals: { all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0, amount: 0 },
      };
    }

    const byDate = new Map<string, ParkingRecord[]>();
    for (const r of filteredRecords) {
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

      const withAmount = dayRecs.map((r) => ({ ...r, amount: calcAmount(r) }));
      const max = withAmount.reduce((a, b) => (a.amount >= b.amount ? a : b));
      freeList.push(max);

      let dayAllDay = 0;
      let day2h = 0;
      let day1h = 0;
      let day30m = 0;
      let dayAmount = 0;

      for (const r of dayRecs) {
        const isFree = r.id === max.id;
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
  }, [settlementDatesSorted, filteredRecords]);

  const sortedRecords = useMemo(
    () =>
      filteredRecords
        .slice()
        .sort((a, b) => {
          const at = new Date(a.created_at ?? 0).getTime();
          const bt = new Date(b.created_at ?? 0).getTime();
          if (at !== bt) return at - bt;
          return a.id.localeCompare(b.id);
        }),
    [filteredRecords]
  );

  const freeRecordIdSet = useMemo(() => new Set(dayFreeList.map((f) => f.id)), [dayFreeList]);

  const listTotals = useMemo(() => {
    return sortedRecords.reduce(
      (acc, r) => {
        const isFree = freeRecordIdSet.has(r.id);
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
  }, [sortedRecords, freeRecordIdSet]);

  const settlementPeriodLabel = useMemo(() => {
    if (!settlementDatesSorted.length) return "";
    return datesYmdToConsecutiveRanges(settlementDatesSorted)
      .map((r) => (r.start === r.end ? monthDay(r.start) : `${monthDay(r.start)} ~ ${monthDay(r.end)}`))
      .join(", ");
  }, [settlementDatesSorted]);

  const usageDaysCount = useMemo(() => {
    if (eventDates.length > 0) return eventDates.length;
    if (!project?.start_date || !project?.end_date) return 0;
    return getDateRange(project.start_date, project.end_date).length;
  }, [eventDates, project?.start_date, project?.end_date]);

  const updateSettlementRange = (idx: number, key: "start" | "end", value: string) => {
    const v = value.slice(0, 10);
    setSettlementRanges((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r));
      return next.map((r) => {
        let s = clampYmd(String(r.start).slice(0, 10), projectMin, projectMax);
        let e = clampYmd(String(r.end).slice(0, 10), projectMin, projectMax);
        if (s > e) e = s;
        return { start: s, end: e };
      });
    });
  };

  const addSettlementRange = () => {
    setSettlementRanges((prev) => [...prev, { start: projectMin, end: projectMin }]);
  };

  const removeSettlementRange = (idx: number) => {
    setSettlementRanges((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [{ start: projectMin, end: projectMax }];
    });
  };

  const resetSettlementRanges = () => {
    setSettlementRanges([{ start: projectMin, end: projectMax }]);
  };

  const handlePdfDownload = async () => {
    if (!pdfExportRef.current || !project) return;
    setSettlementEditorOpen(false);
    setPdfSaving(true);
    try {
      const { downloadParkingHistoryPdf } = await import("@/lib/parking-history-pdf");
      await downloadParkingHistoryPdf(pdfExportRef.current, project);
    } catch (e) {
      console.error(e);
      alert("PDF 저장 중 오류가 발생했습니다.");
    } finally {
      setPdfSaving(false);
    }
  };

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text-muted)] shadow-sm hover:bg-[var(--bg)] hover:text-[var(--text)]"
                aria-label="홈으로"
              >
                <Home className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-semibold text-[var(--text)]">정산</h1>
            </div>
            <button
              type="button"
              onClick={() => void handlePdfDownload()}
              disabled={pdfSaving}
              className="btn inline-flex shrink-0 items-center gap-2 border border-[var(--border)] bg-white px-4 py-2 text-sm hover:bg-[var(--bg)] disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {pdfSaving ? "PDF 생성 중…" : "PDF로 저장"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 py-10">
        <div ref={pdfExportRef} className="flex flex-col gap-8">
        <div className="report-paper p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Parking Invoice</p>
              <h2 className="mt-2 text-3xl font-extrabold text-[var(--text)]">주차권 발급 정산서</h2>
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => setSettlementEditorOpen((prev) => !prev)}
                className="btn btn-relief px-4 py-2 text-sm"
              >
                정산 기간 수정
              </button>
              <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                {isSettlementSameAsUsage ? "사용 일자와 동일" : settlementLabelCompact}
              </p>
            </div>
          </div>
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
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-base font-semibold text-[var(--text)]">
              사용 일자: {eventPeriodLabel}
            </p>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-4 py-1.5 text-base font-extrabold text-amber-700">
              총 {usageDaysCount}일 사용
            </span>
          </div>
        </div>

        {settlementEditorOpen && (
          <div className="report-paper mb-8 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text)]">정산 기간</p>
              <button type="button" onClick={resetSettlementRanges} className="btn btn-relief shrink-0 px-4 py-2.5 text-sm">
                전체 행사 기간
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[#F8FAFC] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--text-muted)]">정산 반영 일자</p>
              <p className="mt-1 text-base font-semibold text-[var(--text)]">
                {isSettlementSameAsUsage ? "사용 일자와 동일" : settlementLabelCompact}
              </p>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text)]">
              <input
                type="checkbox"
                checked={includeWeekendsInSettlement}
                onChange={(e) => setIncludeWeekendsInSettlement(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
              />
              주말 포함
            </label>
            <div className="mt-4 space-y-4">
              {settlementRanges.map((r, idx) => (
                <div key={`settle-${idx}`} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">시작</label>
                    <input
                      type="date"
                      min={projectMin}
                      max={projectMax}
                      value={r.start}
                      onChange={(e) => updateSettlementRange(idx, "start", e.target.value)}
                      className="input min-h-[48px] min-w-[200px] px-4 py-3 text-base text-[var(--text)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">종료</label>
                    <input
                      type="date"
                      min={projectMin}
                      max={projectMax}
                      value={r.end}
                      onChange={(e) => updateSettlementRange(idx, "end", e.target.value)}
                      className="input min-h-[48px] min-w-[200px] px-4 py-3 text-base text-[var(--text)]"
                    />
                  </div>
                  {settlementRanges.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSettlementRange(idx)}
                      className="shrink-0 text-sm font-semibold text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={addSettlementRange}
                className="btn btn-relief shrink-0 px-4 py-2.5 text-sm"
              >
                구간 추가
              </button>
              <button
                type="button"
                onClick={() => setSettlementEditorOpen(false)}
                className="btn btn-primary shrink-0 px-5 py-2.5 text-sm"
              >
                확인
              </button>
            </div>
          </div>
        )}

        <div className="order-2 report-paper overflow-hidden p-0">
          <div className="border-b border-[var(--border)] px-6 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Calculator className="h-4 w-4 text-[var(--text-muted)]" />
              일자별 발급 수량 및 정산 금액 (무료 건 제외)
            </h3>
          </div>
          <table className="report-table report-table-compact text-left text-sm">
            <thead>
              <tr className="text-[var(--text-muted)]">
                <th className="px-6 font-medium text-[var(--text)]">일자</th>
                <th className="px-6 text-center font-medium text-[var(--text)]">종일권 (30,000원)</th>
                <th className="px-6 text-center font-medium text-[var(--text)]">2시간 (12,000원)</th>
                <th className="px-6 text-center font-medium text-[var(--text)]">1시간 (6,000원)</th>
                <th className="px-6 text-center font-medium text-[var(--text)]">30분 (3,000원)</th>
                <th className="px-6 text-right font-medium text-[var(--text)]">일자 합계</th>
              </tr>
            </thead>
            <tbody>
              {daySummaries.map((row) => (
                <tr key={row.date} className="table-row-hover">
                  <td className="px-6 text-[var(--text-muted)]">{monthDay(row.date)}</td>
                  <td className="px-6 text-center text-[var(--text-muted)]">{row.all_day_cnt}매</td>
                  <td className="px-6 text-center text-[var(--text-muted)]">{row["2h_cnt"]}매</td>
                  <td className="px-6 text-center text-[var(--text-muted)]">{row["1h_cnt"]}매</td>
                  <td className="px-6 text-center text-[var(--text-muted)]">{row["30m_cnt"]}매</td>
                  <td className="px-6 text-right text-[var(--text)]">{row.amount.toLocaleString()}원</td>
                </tr>
              ))}
              <tr>
                <td className="px-6 font-semibold text-[var(--text)]">합계</td>
                <td className="px-6 text-center font-semibold text-[var(--text)]">{totals.all_day_cnt}매</td>
                <td className="px-6 text-center font-semibold text-[var(--text)]">{totals["2h_cnt"]}매</td>
                <td className="px-6 text-center font-semibold text-[var(--text)]">{totals["1h_cnt"]}매</td>
                <td className="px-6 text-center font-semibold text-[var(--text)]">{totals["30m_cnt"]}매</td>
                <td className="px-6 text-right text-3xl font-extrabold text-emboss">{totals.amount.toLocaleString()}원</td>
              </tr>
            </tbody>
          </table>
          <p className="px-8 pb-5 pt-2 text-sm font-semibold text-red-600">
            ※ 위 수량 및 금액은 1일 1대 무료 건을 제외한 기준입니다.
          </p>
        </div>

        <div className="order-1 card p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">전체 발급 내역 (차량 · 일자별)</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                총 {filteredRecords.length.toLocaleString()}건 · 위 정산 기간에 포함된 일자만 · 일자/차량 순으로 정렬된 상세 발급 내역입니다.
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
                  const isFree = freeRecordIdSet.has(r.id);
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
            ※ 위 내역에서 노란색 부분은 1일 1대 무료 적용 차량입니다.
          </p>
        </div>

        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => router.push(`/projects/${projectId}/parking`)} className="btn btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            주차권 등록
          </button>
          <button type="button" onClick={() => router.push("/")} className="btn inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <ArrowLeft className="h-4 w-4" />
            목록
          </button>
        </div>
      </main>
    </div>
  );
}
