"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Home, Save, X } from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { supabase } from "@/lib/supabase";
import { datesYmdToConsecutiveRanges, splitCalendarSpanToWeekdayRanges } from "@/lib/schedule-dates";

/** YYYY-MM-DD 형식인지 확인 */
function isDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());
}

/** 시작~종료 일자(YYYY-MM-DD) 사이의 모든 날짜 배열. */
function getDateRange(start: string, end: string): string[] {
  const s = String(start).trim().slice(0, 10);
  const e = String(end).trim().slice(0, 10);
  if (!isDateStr(s) || !isDateStr(e) || s > e) return s && e && s <= e ? [s] : [];

  const [sy, sm, sd] = s.split("-").map(Number);
  const [ey, em, ed] = e.split("-").map(Number);
  const dates: string[] = [];
  for (let i = 0; i < 366; i++) {
    const d = new Date(sy, sm - 1, sd + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const str = `${y}-${m}-${day}`;
    if (str > e) break;
    dates.push(str);
  }
  return dates;
}

function todayString() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function formatMdDow(ymd: string) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${dow})`;
}

export default function NewProjectPage() {
  const router = useRouter();
  const devStore = useDevStore();
  type ScheduleRange = { start: string; end: string };
  const [org_name, setOrgName] = useState("");
  const [manager, setManager] = useState("");
  const [ranges, setRanges] = useState<ScheduleRange[]>(() => {
    const t = todayString();
    return [{ start: t, end: t }];
  });
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [parking_support, setParkingSupport] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [roomByDate, setRoomByDate] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Supabase URL 확인용 (연동 디버깅 후 제거 가능)
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    console.log("[Supabase 연결] URL:", url || "(비어 있음)");
  }, []);

  const normalizedRanges = (() => {
    return ranges
      .map((r) => ({ start: String(r.start ?? "").trim().slice(0, 10), end: String(r.end ?? "").trim().slice(0, 10) }))
      .filter((r) => isDateStr(r.start) && isDateStr(r.end) && r.start <= r.end);
  })();

  const dateList = (() => {
    const set = new Set<string>();
    normalizedRanges.forEach((r) => {
      getDateRange(r.start, r.end).forEach((d) => set.add(d));
    });
    const all = Array.from(set).sort();
    if (includeWeekends) return all;
    return all.filter((ymd) => {
      const [y, m, d] = ymd.split("-").map(Number);
      const day = new Date(y, m - 1, d).getDay();
      return day !== 0 && day !== 6;
    });
  })();

  const rangesLabel = (() => {
    // 실제 생성된 날짜(dateList)를 연속 구간으로 묶어 표시 (주말 제외/띄엄띄엄 일정 반영)
    if (dateList.length === 0) return "";
    const ranges: Array<{ start: string; end: string }> = [];
    const toTime = (ymd: string) => {
      const [y, m, d] = ymd.split("-").map(Number);
      return new Date(y, m - 1, d).getTime();
    };
    let curStart = dateList[0];
    let prev = dateList[0];
    for (let i = 1; i < dateList.length; i++) {
      const next = dateList[i];
      const isConsecutive = toTime(next) - toTime(prev) === 24 * 60 * 60 * 1000;
      if (!isConsecutive) {
        ranges.push({ start: curStart, end: prev });
        curStart = next;
      }
      prev = next;
    }
    ranges.push({ start: curStart, end: prev });
    return ranges
      .map((r) => (r.start === r.end ? formatMdDow(r.start) : `${formatMdDow(r.start)} ~ ${formatMdDow(r.end)}`))
      .join(", ");
  })();

  const addRange = () => {
    const t = todayString();
    setRanges((prev) => [...prev, { start: t, end: t }]);
    setError("");
  };

  const removeRange = (idx: number) => {
    setRanges((prev) => prev.filter((_, i) => i !== idx));
    setError("");
  };

  const updateRange = (idx: number, key: "start" | "end", value: string) => {
    const v = value.slice(0, 10);
    setRanges((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, [key]: v } : r));
      /** 주말 제외 + 일정이 1구간일 때: 긴 기간을 평일 연속 구간으로 자동 분할 (예: 3/24~3/31 → 3/24~27, 3/30~31) */
      if (idx !== 0 || prev.length !== 1 || includeWeekends) return next;
      const r0 = next[0];
      if (!isDateStr(r0.start) || !isDateStr(r0.end) || r0.start > r0.end) return next;
      const split = splitCalendarSpanToWeekdayRanges(r0.start, r0.end);
      if (split.length === 0) return next;
      if (split.length > 1) return split;
      return [split[0]];
    });
  };

  const applyRoomsToAll = () => {
    const firstRoom = roomByDate[dateList[0]] ?? "";
    if (!firstRoom) {
      setError("최상단 날짜에 룸을 입력한 뒤 일괄 적용해 주세요.");
      return;
    }
    const next: Record<string, string> = {};
    dateList.forEach((d) => (next[d] = firstRoom));
    setRoomByDate((prev) => ({ ...prev, ...next }));
    setError("");
  };

  const setRoom = (date: string, value: string) => {
    setRoomByDate((prev) => ({ ...prev, [date]: value }));
  };

  /** 날짜별 룸에서 해당 일 제거 → 사용 일정을 연속 구간으로 재구성 (예: 3/26 제거 시 3/18~25, 3/27~30) */
  const removeDateFromSchedule = (ymd: string) => {
    if (dateList.length <= 1) {
      setError("사용 일자는 최소 1일 이상 필요합니다.");
      return;
    }
    const nextDates = dateList.filter((d) => d !== ymd);
    const newRanges = datesYmdToConsecutiveRanges(nextDates);
    setRanges(newRanges);
    setRoomByDate((prev) => {
      const n = { ...prev };
      delete n[ymd];
      return n;
    });
    setError("");
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    const name = String(org_name ?? "").trim();
    const mgr = String(manager ?? "").trim();
    if (!name || !mgr) {
      setError("기관명과 담당자명을 입력해 주세요.");
      return;
    }
    if (normalizedRanges.length === 0) {
      setError("사용 일자(시작/종료)를 올바르게 입력해 주세요.");
      return;
    }
    if (dateList.length === 0) {
      setError("선택한 기간에 사용 가능한 일자가 없습니다. 주말 포함을 켜거나 일정을 조정해 주세요.");
      return;
    }
    const sortedDays = [...dateList].sort();
    const sDate = sortedDays[0];
    const eDate = sortedDays[sortedDays.length - 1];
    setSaving(true);
    setError("");
    try {
      if (isDevMode()) {
        const roomList = dateList.map((date) => ({
          date,
          room_name: (roomByDate[date] ?? "").trim() || "미지정",
        }));
        devStore.createProject(
          {
            org_name: name,
            manager: mgr,
            start_date: sDate,
            end_date: eDate,
            parking_support,
            remarks: String(remarks ?? "").trim() || null,
          },
          roomList
        );
        router.push("/");
        router.refresh();
        return;
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          org_name: name,
          manager: mgr,
          start_date: sDate,
          end_date: eDate,
          parking_support,
          remarks: String(remarks ?? "").trim() || null,
        })
        .select("id")
        .single();

      if (projectError) throw projectError;
      if (!project?.id) throw new Error("프로젝트 생성 실패");

      if (dateList.length > 0) {
        const rooms = dateList.map((date) => ({
          project_id: project.id,
          date,
          room_name: (roomByDate[date] ?? "").trim() || "미지정",
        }));
        const { error: roomsError } = await supabase
          .from("project_rooms")
          .insert(rooms);
        if (roomsError) throw roomsError;
      }

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string")
            ? String((err as { message: string }).message)
            : String(err) || "저장 중 오류가 발생했습니다.";
      setError(
        message.includes("Supabase") || message.includes("fetch") || message.includes("network")
          ? `${message} Supabase가 연결되지 않았을 수 있습니다. 테스트하려면 .env.local에 NEXT_PUBLIC_SUPABASE_URL을 비우거나 'placeholder'로 두면 개발자 모드(로컬 저장)로 동작합니다.`
          : message
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text-muted)] shadow-sm hover:bg-[var(--bg)] hover:text-[var(--text)]"
              aria-label="홈으로"
            >
              <Home className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-semibold text-[var(--text)]">기관 등록</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-[var(--text)]">기관 및 담당자 등록</h2>
          {isDevMode() && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
              개발자 모드 — 브라우저에 저장되며 등록 후 대시보드로 이동합니다.
            </span>
          )}
        </div>

        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleSubmit(e);
          }}
        >
          <p className="text-sm text-[var(--text-muted)]">
            사용 일자(시작/종료)를 입력하시면 아래에 <strong className="text-[var(--text)]">날짜별 사용 룸</strong>을 개별 지정하거나 &quot;룸 일괄 적용&quot; 버튼으로 한 번에 지정할 수 있습니다.
          </p>
          <div className="card card-hover p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">기관명</label>
                <input
                  type="text"
                  value={org_name}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="input w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]"
                  placeholder="예: OO대학교"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">담당자명</label>
                <input
                  type="text"
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  className="input w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]"
                  placeholder="예: 홍길동"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-full sm:w-[260px]">
                    <label className="mb-2 block text-sm font-medium text-[var(--text)]">사용 일자 (시작)</label>
                    <input
                      type="date"
                      value={ranges[0]?.start ?? ""}
                      onChange={(e) => updateRange(0, "start", e.target.value || "")}
                      onBlur={(e) => updateRange(0, "start", e.target.value || (ranges[0]?.start ?? ""))}
                      className="input w-full px-3 py-2.5 text-[var(--text)]"
                    />
                  </div>
                  <div className="w-full sm:w-[260px]">
                    <label className="mb-2 block text-sm font-medium text-[var(--text)]">사용 일자 (종료)</label>
                    <input
                      type="date"
                      value={ranges[0]?.end ?? ""}
                      onChange={(e) => updateRange(0, "end", e.target.value || "")}
                      onBlur={(e) => updateRange(0, "end", e.target.value || (ranges[0]?.end ?? ""))}
                      className="input w-full px-3 py-2.5 text-[var(--text)]"
                    />
                  </div>
                  <div className="hidden sm:block flex-1" />
                  <button
                    type="button"
                    onClick={addRange}
                    className="btn w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    일정 추가
                  </button>
                </div>
              </div>

              {ranges.length > 1 && (
                <div className="sm:col-span-2 space-y-3">
                  {ranges.slice(1).map((r, offset) => {
                    const idx = offset + 1;
                    return (
                      <div key={`range-${idx}`} className="flex flex-wrap items-end gap-3">
                        <div className="w-full sm:w-[260px]">
                          <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                            사용 일자 (시작) <span className="text-[var(--text-muted)]">(추가 일정 {idx})</span>
                          </label>
                          <input
                            type="date"
                            value={r.start ?? ""}
                            onChange={(e) => updateRange(idx, "start", e.target.value || "")}
                            className="input w-full px-3 py-2.5 text-[var(--text)]"
                          />
                        </div>
                        <div className="w-full sm:w-[260px]">
                          <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                            사용 일자 (종료) <span className="text-[var(--text-muted)]">(추가 일정 {idx})</span>
                          </label>
                          <input
                            type="date"
                            value={r.end ?? ""}
                            onChange={(e) => updateRange(idx, "end", e.target.value || "")}
                            className="input w-full px-3 py-2.5 text-[var(--text)]"
                          />
                        </div>
                        <div className="hidden sm:block flex-1" />
                        <button
                          type="button"
                          onClick={() => removeRange(idx)}
                          className="w-full sm:w-auto text-xs font-semibold text-red-600 hover:underline"
                        >
                          삭제
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {rangesLabel && (
                <div className="sm:col-span-2 mt-1 rounded-xl border border-[var(--border)] bg-[#F8FAFC] px-4 py-3">
                  <div
                    className="flex flex-wrap items-center gap-2"
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}
                  >
                    <span className="text-sm font-semibold text-[var(--text)]">선택된 기간</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        includeWeekends
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {includeWeekends ? "주말 포함" : "주말 제외"}
                    </span>
                    <span
                      className="ml-auto rounded-full bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-700"
                      style={{ marginLeft: "auto" }}
                    >
                      총 {dateList.length}일 사용
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)] break-words">
                    {rangesLabel}
                  </p>
                </div>
              )}
              <div className="sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--text)]">주차지원 여부</span>
                <div className="flex gap-6">
                  <label className="flex cursor-pointer items-center gap-2 text-[var(--text-muted)]">
                    <input type="radio" name="parking_support" checked={parking_support === true} onChange={() => setParkingSupport(true)} className="accent-[var(--primary)]" />
                    <span className="font-medium">O (지원함)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-[var(--text-muted)]">
                    <input type="radio" name="parking_support" checked={parking_support === false} onChange={() => setParkingSupport(false)} className="accent-[var(--primary)]" />
                    <span>X (지원 안 함)</span>
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">비고</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="input w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]"
                  placeholder="선택"
                />
              </div>
            </div>
          </div>

          {dateList.length > 0 && (
            <div className="card card-hover p-8">
              <div
                className="mb-4 flex items-center justify-between"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <h3
                  className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]"
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}
                >
                  날짜별 사용 룸 ({dateList.length}일)
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      includeWeekends
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {includeWeekends ? "주말 포함" : "주말 제외"}
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIncludeWeekends((prev) => {
                        const next = !prev;
                        if (!next && prev) {
                          setRanges((ranges) => {
                            if (ranges.length !== 1) return ranges;
                            const r0 = ranges[0];
                            const s = String(r0.start ?? "").trim().slice(0, 10);
                            const e = String(r0.end ?? "").trim().slice(0, 10);
                            if (!isDateStr(s) || !isDateStr(e) || s > e) return ranges;
                            const split = splitCalendarSpanToWeekdayRanges(s, e);
                            if (split.length > 1) return split;
                            return ranges;
                          });
                        }
                        return next;
                      });
                      setError("");
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      includeWeekends
                        ? "border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                    aria-pressed={includeWeekends}
                  >
                    주말 포함
                  </button>
                  <button
                    type="button"
                    onClick={applyRoomsToAll}
                    className="btn btn-relief inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl"
                  >
                    <Copy className="h-4 w-4" />
                    룸 일괄 적용
                  </button>
                </div>
              </div>
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                최상단 날짜에 입력한 룸을 아래 모든 날짜에 동일 적용합니다. 우측 X로 해당 일을 사용 일정에서 빼면 위 &quot;사용 일자&quot; 구간이 자동으로 나뉩니다.
              </p>
              <ul className="max-h-[320px] space-y-3 overflow-y-auto">
                {dateList.map((date) => (
                  <li key={date} className="flex items-center gap-2 sm:gap-3">
                    <span className="w-24 shrink-0 text-sm text-[var(--text-muted)] sm:w-28">{formatMdDow(date)}</span>
                    <input
                      type="text"
                      value={roomByDate[date] ?? ""}
                      onChange={(e) => setRoom(date, e.target.value)}
                      className="input min-w-0 flex-1 px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
                      placeholder="예: A, B, C"
                    />
                    <button
                      type="button"
                      onClick={() => removeDateFromSchedule(date)}
                      disabled={dateList.length <= 1}
                      className="shrink-0 rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-50 disabled:hover:text-red-600"
                      title="이 날짜를 사용 일정에서 제외"
                      aria-label={`${formatMdDow(date)} 제외`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              name="register"
              disabled={saving}
              className="btn btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "저장 중..." : "등록"}
            </button>
            <Link href="/" className="btn inline-flex items-center gap-2 px-5 py-2.5 text-sm">
              <ArrowLeft className="h-4 w-4" />
              취소
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
