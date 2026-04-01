"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  PlusCircle,
  Calendar,
  Building2,
  Calculator,
  User,
  Home,
  Archive,
  Trash2,
  FileText,
  ChevronDown,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/lib/supabase";
import {
  periodLabelIsoFromSortedYmd,
  periodLabelMonthDayFromSortedYmd,
  periodLabelShortYmdFromSortedYmd,
} from "@/lib/schedule-dates";
import { isArchivedProjectExpiredForPurge } from "@/lib/archive-retention";
import { ParkingSection } from "@/components/ParkingSection";
import { Badge } from "@/components/ui/Badge";
import {
  cycleParkingSupport,
  parseParkingSupport,
  parkingSupportBadgeClass,
  parkingSupportBadgeVariant,
  parkingSupportShortLabel,
  parkingSupportUiClass,
  type ParkingSupport,
} from "@/lib/parking-support";

function normalizeProjectsFromApi(list: Project[]): Project[] {
  return list.map((p) => ({
    ...p,
    parking_support: parseParkingSupport(p.parking_support as unknown),
  }));
}

function todayString() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function shortYmd(d: string) {
  return d.length >= 10 ? d.slice(2) : d;
}

function monthDay(d: string) {
  if (d.length < 10) return d;
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

function koreanDateTitle(d: string) {
  if (d.length < 10) return d;
  const [y, m, day] = d.split("-");
  return `${Number(y.slice(2))}년 ${Number(m)}월 ${Number(day)}일`;
}

type ProjectWithRoom = Project & { roomName: string };

export default function HomePage() {
  const router = useRouter();
  const [today] = useState(() => todayString());
  const [listMode, setListMode] = useState<"active" | "archive">("active");
  const [supportFilter, setSupportFilter] = useState<
    "all" | "onlySupport" | "onlyNoSupport" | "onlyUnknown" | "onlyNeedsCheck"
  >("all");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomByProjectId, setRoomByProjectId] = useState<Record<string, string>>({});
  /** project_rooms 실제 일자 기준 기간 문구 (띄엄·중간일 제외 반영) */
  const [periodLabelById, setPeriodLabelById] = useState<
    Record<string, { list: string; detail: string; full: string }>
  >({});
  /** 행사별 대표 일자(정렬된 project_rooms 날짜 중 첫날, 없으면 end_date) — 보관함 전체 목록 클릭 시 selectedDate 동기화용 */
  const [primaryRoomDateByProjectId, setPrimaryRoomDateByProjectId] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingParkingId, setTogglingParkingId] = useState<string | null>(null);
  const [actionMenuProjectId, setActionMenuProjectId] = useState<string | null>(null);
  const devStore = useDevStore();
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  /** roomByProjectId가 현재 selectedDate 기준으로 갱신되었을 때만 선택 해제(useEffect)를 적용 — 날짜 전환 직후 레이스 방지 */
  const lastRoomFetchForDateRef = useRef<string | null>(null);
  const roomByProjectIdCacheRef = useRef<Map<string, Record<string, string>>>(new Map());

  useEffect(() => {
    if (isDevMode()) {
      setAllProjects(devStore.getProjects());
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .order("start_date", { ascending: false });
        if (!error) setAllProjects(normalizeProjectsFromApi((data || []) as Project[]));
      } finally {
        setLoading(false);
      }
    })();
  }, [devStore.data]);

  const activeProjects = useMemo(
    () => allProjects.filter((p) => new Date(p.end_date).toISOString().slice(0, 10) >= today),
    [allProjects]
  );
  const archivedProjects = useMemo(
    () => allProjects.filter((p) => new Date(p.end_date).toISOString().slice(0, 10) < today),
    [allProjects]
  );
  const sourceProjects = listMode === "active" ? activeProjects : archivedProjects;

  /** 보관함(행사 종료) 항목: 종료일 기준 30일 경과 시 자동 삭제 — 대시보드 방문 시 실행 */
  useEffect(() => {
    const expired = allProjects.filter((p) => isArchivedProjectExpiredForPurge(p.end_date, today));
    if (expired.length === 0) return;

    if (isDevMode()) {
      expired.forEach((p) => devStore.deleteProject(p.id));
      setAllProjects(devStore.getProjects());
      setSelectedProjectId((prev) => (prev && expired.some((e) => e.id === prev) ? null : prev));
      return;
    }
    if (loading) return;
    const ids = expired.map((p) => p.id);
    void (async () => {
      const { error } = await supabase.from("projects").delete().in("id", ids);
      if (error) {
        console.error("[보관함 자동 삭제]", error);
        return;
      }
      const { data } = await supabase.from("projects").select("*").order("start_date", { ascending: false });
      setAllProjects(normalizeProjectsFromApi((data || []) as Project[]));
      setSelectedProjectId((prev) => (prev && ids.includes(prev) ? null : prev));
    })();
  }, [allProjects, today, loading, devStore.data]);

  useEffect(() => {
    if (sourceProjects.length === 0) {
      setRoomByProjectId({});
      lastRoomFetchForDateRef.current = selectedDate;
      return;
    }
    if (isDevMode()) {
      const map: Record<string, string> = {};
      sourceProjects.forEach((p) => {
        const rooms = devStore.getRooms(p.id);
        const r = rooms.find((x) => x.date === selectedDate);
        if (r) map[p.id] = r.room_name ?? "미지정";
      });
      setRoomByProjectId(map);
      lastRoomFetchForDateRef.current = selectedDate;
      return;
    }
    const ids = sourceProjects.map((p) => p.id);
    const dateForThisFetch = selectedDate;
    const idsKey = [...ids].sort().join("|");
    const cacheKey = `${dateForThisFetch}__${idsKey}`;
    const cached = roomByProjectIdCacheRef.current.get(cacheKey);
    if (cached) {
      setRoomByProjectId(cached);
      lastRoomFetchForDateRef.current = dateForThisFetch;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("project_rooms")
          .select("project_id, room_name")
          .eq("date", dateForThisFetch)
          .in("project_id", ids);
        if (cancelled) return;
        const map: Record<string, string> = {};
        if (!error) {
          (data || []).forEach((x: { project_id: string; room_name: string | null }) => {
            map[x.project_id] = x.room_name ?? "미지정";
          });
        }
        setRoomByProjectId(map);
        lastRoomFetchForDateRef.current = dateForThisFetch;
        roomByProjectIdCacheRef.current.set(cacheKey, map);
        // 방어적으로 캐시가 무한정 커지지 않게 제한
        if (roomByProjectIdCacheRef.current.size > 20) {
          const firstKey = roomByProjectIdCacheRef.current.keys().next().value as string | undefined;
          if (firstKey) roomByProjectIdCacheRef.current.delete(firstKey);
        }
      } catch {
        if (cancelled) return;
        setRoomByProjectId({});
        lastRoomFetchForDateRef.current = dateForThisFetch;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceProjects, selectedDate, devStore.data]);

  useEffect(() => {
    if (allProjects.length === 0) {
      setPeriodLabelById({});
      setPrimaryRoomDateByProjectId({});
      return;
    }
    const fallback = (p: Project) => {
      const list =
        p.start_date === p.end_date
          ? monthDay(p.start_date)
          : `${monthDay(p.start_date)} ~ ${monthDay(p.end_date)}`;
      const detail =
        p.start_date === p.end_date
          ? shortYmd(p.start_date)
          : `${shortYmd(p.start_date)} ~ ${shortYmd(p.end_date)}`;
      const full =
        p.start_date === p.end_date
          ? String(p.start_date).slice(0, 10)
          : `${String(p.start_date).slice(0, 10)} ~ ${String(p.end_date).slice(0, 10)}`;
      return { list, detail, full };
    };
    if (isDevMode()) {
      const next: Record<string, { list: string; detail: string; full: string }> = {};
      const primary: Record<string, string> = {};
      allProjects.forEach((p) => {
        const rooms = devStore.getRooms(p.id);
        const dates = Array.from(new Set(rooms.map((r) => String(r.date).slice(0, 10)))).sort();
        primary[p.id] = dates.length > 0 ? dates[0]! : String(p.end_date).slice(0, 10);
        if (dates.length > 0) {
          next[p.id] = {
            list: periodLabelMonthDayFromSortedYmd(dates),
            detail: periodLabelShortYmdFromSortedYmd(dates),
            full: periodLabelIsoFromSortedYmd(dates),
          };
        } else {
          next[p.id] = fallback(p);
        }
      });
      setPeriodLabelById(next);
      setPrimaryRoomDateByProjectId(primary);
      return;
    }
    const ids = allProjects.map((p) => p.id);
    void supabase
      .from("project_rooms")
      .select("project_id, date")
      .in("project_id", ids)
      .then(({ data, error }) => {
        if (error) return;
        const byProject: Record<string, Set<string>> = {};
        (data || []).forEach((row: { project_id: string; date: string }) => {
          const pid = row.project_id;
          const d = String(row.date).slice(0, 10);
          if (!byProject[pid]) byProject[pid] = new Set();
          byProject[pid].add(d);
        });
        const next: Record<string, { list: string; detail: string; full: string }> = {};
        const primary: Record<string, string> = {};
        allProjects.forEach((p) => {
          const dates = byProject[p.id] ? Array.from(byProject[p.id]).sort() : [];
          primary[p.id] = dates.length > 0 ? dates[0]! : String(p.end_date).slice(0, 10);
          if (dates.length > 0) {
            next[p.id] = {
              list: periodLabelMonthDayFromSortedYmd(dates),
              detail: periodLabelShortYmdFromSortedYmd(dates),
              full: periodLabelIsoFromSortedYmd(dates),
            };
          } else {
            next[p.id] = fallback(p);
          }
        });
        setPeriodLabelById(next);
        setPrimaryRoomDateByProjectId(primary);
      });
  }, [allProjects, devStore.data]);

  const projectsForDate = useMemo(() => {
    // 해당 일자에 project_rooms가 존재하는 행사만 표시 (띄엄띄엄 일정 지원)
    if (!selectedDate) return [];
    if (Object.keys(roomByProjectId).length === 0) return [];
    return sourceProjects.filter((p) => roomByProjectId[p.id] !== undefined);
  }, [sourceProjects, roomByProjectId, selectedDate]);

  const projectsForDateWithFilter = useMemo(() => {
    if (supportFilter === "all") return projectsForDate;
    return projectsForDate.filter((p) => {
      const s = parseParkingSupport(p.parking_support as unknown);
      if (supportFilter === "onlySupport") return s === "yes";
      if (supportFilter === "onlyNoSupport") return s === "no";
      if (supportFilter === "onlyUnknown") return s === "undecided";
      if (supportFilter === "onlyNeedsCheck") return s === "needs_check";
      return true;
    });
  }, [projectsForDate, supportFilter]);

  const projectsWithRoom: ProjectWithRoom[] = useMemo(
    () =>
      projectsForDateWithFilter.map((p) => ({
        ...p,
        roomName: roomByProjectId[p.id] ?? "미지정",
      })),
    [projectsForDateWithFilter, roomByProjectId]
  );

  const selectedProjectForPicker = useMemo(() => {
    const list = projectsForDateWithFilter;
    if (!selectedProjectId) return null;
    return list.find((p) => p.id === selectedProjectId) ?? null;
  }, [projectsForDateWithFilter, selectedProjectId]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = projectPickerRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setProjectPickerOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [projectPickerOpen]);

  useEffect(() => {
    if (!actionMenuProjectId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest("[data-action-menu-root]")) {
        setActionMenuProjectId(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [actionMenuProjectId]);

  const selectedProject = selectedProjectId
    ? allProjects.find((p) => p.id === selectedProjectId) ?? null
    : null;

  useEffect(() => {
    if (!selectedProjectId) return;
    // 날짜 변경 직후 roomByProjectId가 아직 이전 일자 기준이면 잘못 해제되지 않도록, fetch 완료 후에만 검사
    if (lastRoomFetchForDateRef.current !== selectedDate) return;
    if (!projectsForDateWithFilter.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [projectsForDateWithFilter, selectedProjectId, selectedDate]);

  useEffect(() => {
    // 주차지원 필터 변경 시 현재 선택이 필터 결과에 없으면 선택만 해제
    setSelectedProjectId((prev) =>
      prev && projectsForDateWithFilter.some((p) => p.id === prev) ? prev : null
    );
  }, [supportFilter, projectsForDateWithFilter]);

  useEffect(() => {
    setSelectedProjectId(null);
  }, [listMode]);

  const handleSelectArchiveFullListRow = (p: Project) => {
    const d = primaryRoomDateByProjectId[p.id] ?? String(p.end_date).slice(0, 10);
    startTransition(() => {
      setSelectedDate(d);
      setSelectedProjectId(p.id);
      setProjectPickerOpen(false);
    });
  };

  const handleDeleteProject = async (projectId: string) => {
    if (deletingId) return;
    const message =
      listMode === "archive"
        ? "이 행사를 보관함에서 삭제할까요? 삭제 후 복구할 수 없습니다."
        : "이 기관(행사)을 삭제할까요? 삭제 후 복구할 수 없습니다.";
    if (!confirm(message)) return;
    setDeletingId(projectId);
    try {
      if (isDevMode()) {
        devStore.deleteProject(projectId);
        setAllProjects(devStore.getProjects());
      } else {
        await supabase.from("projects").delete().eq("id", projectId);
        const { data } = await supabase.from("projects").select("*").order("start_date", { ascending: false });
        setAllProjects(normalizeProjectsFromApi((data || []) as Project[]));
      }
      setSelectedProjectId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleParkingSupport = async (
    e: ReactMouseEvent<HTMLButtonElement>,
    projectId: string,
    current: Project["parking_support"] | unknown
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (togglingParkingId === projectId) return;
    const next: ParkingSupport = cycleParkingSupport(parseParkingSupport(current));
    setTogglingParkingId(projectId);
    try {
      if (isDevMode()) {
        devStore.updateProject(projectId, { parking_support: next });
        setAllProjects(devStore.getProjects());
      } else {
        const { error } = await supabase
          .from("projects")
          .update({ parking_support: next, updated_at: new Date().toISOString() })
          .eq("id", projectId);
        if (error) {
          console.error(error);
          alert("주차지원 여부를 저장하지 못했습니다.");
          return;
        }
        setAllProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, parking_support: next } : p))
        );
      }
    } finally {
      setTogglingParkingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto max-w-7xl px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setListMode("active");
                  setSupportFilter("all");
                  setSelectedDate(today);
                  setSelectedProjectId(null);
                  setProjectPickerOpen(false);
                  setActionMenuProjectId(null);
                }}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text-muted)] shadow-sm hover:bg-[var(--bg)] hover:text-[var(--text)]"
                aria-label="홈으로"
              >
                <Home className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-semibold text-[var(--text)]">주차권 관리 및 자동 정산</h1>
              {isDevMode() && (
                <Badge variant="secondary">개발자 모드</Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-[var(--text)]">기관 목록</h2>
            <div className="inline-flex rounded-full bg-[var(--bg)] p-1 text-sm">
              <button
                type="button"
                onClick={() => setListMode("active")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${
                  listMode === "active"
                    ? "bg-white text-[var(--text)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                진행 중
              </button>
              <button
                type="button"
                onClick={() => setListMode("archive")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${
                  listMode === "archive"
                    ? "bg-white text-[var(--text)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                <Archive className="h-3.5 w-3.5" />
                보관함
              </button>
            </div>
          </div>
          <Link
            href="/projects/new"
            className="btn btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
          >
            <PlusCircle className="h-4 w-4" />
            기관 등록
          </Link>
        </div>

        <div className="card mb-10 p-6">
          <div className="mb-4 flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs font-medium text-[var(--text-muted)]">주차지원 필터</span>
              <div className="inline-flex rounded-full bg-[var(--bg)] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSupportFilter("all")}
                  className={`rounded-full px-2 py-0.5 ${
                    supportFilter === "all"
                      ? "bg-white text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  전체
                </button>
                <button
                  type="button"
                  onClick={() => setSupportFilter("onlySupport")}
                  className={`rounded-full px-2 py-0.5 ${
                    supportFilter === "onlySupport"
                      ? "bg-white text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  O
                </button>
                <button
                  type="button"
                  onClick={() => setSupportFilter("onlyNoSupport")}
                  className={`rounded-full px-2 py-0.5 ${
                    supportFilter === "onlyNoSupport"
                      ? "bg-white text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  X
                </button>
                <button
                  type="button"
                  onClick={() => setSupportFilter("onlyUnknown")}
                  className={`rounded-full px-2 py-0.5 ${
                    supportFilter === "onlyUnknown"
                      ? "bg-white text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  미정
                </button>
                <button
                  type="button"
                  onClick={() => setSupportFilter("onlyNeedsCheck")}
                  className={`rounded-full px-2 py-0.5 ${
                    supportFilter === "onlyNeedsCheck"
                      ? "bg-white text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  확인
                </button>
              </div>
            </div>
            <div className="w-full max-w-full overflow-x-auto">
              <p className="whitespace-nowrap text-right text-xs leading-relaxed text-[var(--text-muted)]">
                행사 카드의{"\u00A0\u00A0"}
                <span className="text-sm font-semibold text-[var(--primary)]">주차지원 O/X/미정/확인 필요</span>
                {"\u00A0\u00A0"}를 누르면 주차지원 여부를 바로 변경할 수 있습니다.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
              <label className="text-sm font-medium text-[var(--text)]">일자</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="input min-w-[148px] px-3 py-2.5 text-sm text-[var(--text)]"
              />
            </div>
            <div className="h-6 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-3 flex-1 min-w-[260px]">
              <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
              <label className="text-sm font-medium text-[var(--text)] whitespace-nowrap">
                행사 선택
              </label>
              <div className="relative flex-1" ref={projectPickerRef}>
                <button
                  type="button"
                  onClick={() => setProjectPickerOpen((v) => !v)}
                  className="input flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-[var(--text)]"
                  aria-haspopup="listbox"
                  aria-expanded={projectPickerOpen}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {selectedProjectForPicker
                      ? `${selectedProjectForPicker.org_name} (${selectedProjectForPicker.manager}) | ${roomByProjectId[selectedProjectForPicker.id] ?? "미지정"}`
                      : "선택하세요"}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                </button>

                {projectPickerOpen && (
                  <div
                    role="listbox"
                    className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg"
                  >
                    <div className="max-h-72 overflow-auto py-1">
                      {projectsForDateWithFilter.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-[var(--text-muted)]">선택 가능한 행사가 없습니다.</div>
                      ) : (
                        projectsForDateWithFilter.map((p) => {
                          const room = roomByProjectId[p.id] ?? "미지정";
                          const active = selectedProjectId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              role="option"
                              aria-selected={active}
                              onClick={() => {
                                setSelectedProjectId(p.id);
                                setProjectPickerOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                active ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="min-w-0 flex-1 truncate text-[var(--text)]">
                                  {p.org_name} ({p.manager})
                                </span>
                                <span className="shrink-0 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-xs font-semibold text-[#1D4ED8]">
                                  {room}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-[var(--text-muted)]">로딩 중...</p>
        ) : allProjects.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-[var(--text-muted)]">등록된 기관이 없습니다.</p>
            <Link href="/projects/new" className="btn btn-primary mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm">
              <PlusCircle className="h-4 w-4" />
              기관 등록
            </Link>
          </div>
        ) : listMode === "archive" && archivedProjects.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-[var(--text-muted)]">보관함에 종료된 행사가 없습니다.</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">종료일이 지난 행사가 여기에 표시됩니다.</p>
          </div>
        ) : (
          <>
            {projectsWithRoom.length > 0 && (
              <div className="card card-hover mb-6 overflow-visible p-0">
                <div className="border-b border-[var(--border)] bg-[#F8FAFC] px-6 py-3">
              <h3 className="text-base font-bold text-[var(--text)]">
                    {listMode === "archive"
                      ? `보관함 · ${koreanDateTitle(selectedDate)} 종료 행사 목록`
                      : `${koreanDateTitle(selectedDate)} 행사 목록`}
                  </h3>
                </div>
                <ul className="space-y-3 p-3">
                  {projectsWithRoom.map((p) => (
                    <li
                      key={p.id}
                      className={`card flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 transition-colors hover:bg-[#F8FAFC] ${
                        selectedProjectId === p.id ? "bg-[#EFF6FF] border-[#CFE0FF]" : ""
                      }`}
                      onClick={() => setSelectedProjectId(p.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedProjectId(p.id);
                        }
                      }}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--border)]">
                          <User className="h-5 w-5 text-[var(--text-muted)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--text)]">
                            {p.org_name}
                            <span className="text-sm font-normal text-[var(--text-muted)]"> / {p.manager}</span>
                          </p>
                          <p className="text-sm font-semibold text-indigo-600">{p.event_name || "행사명 미입력"}</p>
                          <p className="mt-1 text-sm font-medium text-[var(--text)]">공간 : {p.roomName}</p>
                          {p.remarks?.trim() && (
                            <p
                              className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]"
                              title={p.remarks.trim()}
                            >
                              비고 · {p.remarks.trim()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text)]">
                          {periodLabelById[p.id]?.list ??
                            (p.start_date === p.end_date
                              ? monthDay(p.start_date)
                              : `${monthDay(p.start_date)} ~ ${monthDay(p.end_date)}`)}
                        </span>
                        <button
                          type="button"
                          title="클릭하여 주차지원 여부 변경"
                          aria-pressed={parseParkingSupport(p.parking_support as unknown) === "yes"}
                          disabled={togglingParkingId === p.id}
                          onClick={(e) => void handleToggleParkingSupport(e, p.id, p.parking_support)}
                          className={`inline-flex max-w-[11rem] flex-wrap items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60 ${parkingSupportUiClass(parseParkingSupport(p.parking_support as unknown))}`}
                        >
                          주차지원 {parkingSupportShortLabel(parseParkingSupport(p.parking_support as unknown))}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {listMode === "archive" ? (
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/projects/${p.id}/report`}
                              className="btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                            >
                              <FileText className="h-4 w-4" />
                              보고서
                            </Link>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProject(p.id);
                              }}
                              disabled={deletingId === p.id}
                              className="btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              {deletingId === p.id ? "삭제 중..." : "보관함에서 삭제"}
                            </button>
                          </div>
                        ) : (
                          <>
                            <Link
                              href={`/projects/${p.id}/parking`}
                              className="btn btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                            >
                              주차권 등록
                            </Link>
                            <div
                              className="relative"
                              data-action-menu-root
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setActionMenuProjectId((prev) => (prev === p.id ? null : p.id))
                                }
                                className="btn inline-flex items-center justify-center px-2.5 py-1.5 text-sm"
                                aria-label="추가 작업"
                                aria-haspopup="menu"
                                aria-expanded={actionMenuProjectId === p.id}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              {actionMenuProjectId === p.id && (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-[calc(100%+0.4rem)] z-40 min-w-[140px] rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-lg"
                                >
                                  <Link
                                    href={`/projects/${p.id}/edit`}
                                    role="menuitem"
                                    title="기본 정보·일정·날짜별 룸을 함께 수정"
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)]"
                                    onClick={() => setActionMenuProjectId(null)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    수정
                                  </Link>
                                  <Link
                                    href={`/projects/${p.id}/settlement`}
                                    role="menuitem"
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)]"
                                    onClick={() => setActionMenuProjectId(null)}
                                  >
                                    <Calculator className="h-4 w-4" />
                                    정산
                                  </Link>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      void handleDeleteProject(p.id);
                                      setActionMenuProjectId(null);
                                    }}
                                    disabled={deletingId === p.id}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {deletingId === p.id ? "삭제 중..." : "삭제"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {projectsForDate.length === 0 && !loading && (
              <div className="card p-8 text-center text-[var(--text-muted)]">
                {listMode === "archive"
                  ? "선택한 일자에 종료된 행사가 없습니다."
                  : "선택한 일자에 진행 중인 행사가 없습니다."}
              </div>
            )}

            {selectedProject && isDevMode() && listMode === "active" && (
              <div className="mt-6">
                <ParkingSection
                  projectId={selectedProject.id}
                  date={selectedDate}
                  project={selectedProject}
                />
              </div>
            )}
          </>
        )}

        {listMode === "archive" && (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
            보관함 전체 목록 (삭제 등)
          </summary>
          <div className="card card-hover mt-4 overflow-visible">
            <table className="w-full table-fixed text-left text-sm">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="w-[22%] px-3 py-4 font-medium text-[var(--text)] sm:px-6">기관명</th>
                  <th className="w-[14%] px-3 py-4 font-medium text-[var(--text)] sm:px-6">담당자</th>
                  <th className="w-[22%] px-3 py-4 font-medium text-[var(--text)] sm:px-6">사용 일자</th>
                  <th className="w-[12%] px-3 py-4 font-medium text-[var(--text)] sm:px-6">주차지원</th>
                  <th className="w-[16%] px-3 py-4 font-medium text-[var(--text)] sm:px-6">비고</th>
                  <th className="w-[14%] px-3 py-4 font-medium text-[var(--text)] whitespace-nowrap sm:px-6">작업</th>
                </tr>
              </thead>
              <tbody>
                {sourceProjects.map((p) => (
                  <tr
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectArchiveFullListRow(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectArchiveFullListRow(p);
                      }
                    }}
                    className={`table-row-hover cursor-pointer transition-colors ${
                      selectedProjectId === p.id ? "bg-[#F0F4FF]" : ""
                    }`}
                    aria-label={`${p.org_name} 행사 선택 — 상세로 이동`}
                  >
                    <td className="px-3 py-4 font-medium text-[var(--text)] sm:px-6">
                      <span className="block truncate">{p.org_name}</span>
                    </td>
                    <td className="px-3 py-4 text-[var(--text-muted)] sm:px-6">
                      <span className="block truncate">{p.manager}</span>
                    </td>
                    <td className="px-3 py-4 text-[var(--text-muted)] sm:px-6">
                      <span className="block truncate">
                      {periodLabelById[p.id]?.full ??
                        (p.start_date === p.end_date ? p.start_date : `${p.start_date} ~ ${p.end_date}`)}
                      </span>
                    </td>
                    <td className="px-3 py-4 sm:px-6">
                      {(() => {
                        const s = parseParkingSupport(p.parking_support as unknown);
                        return (
                          <Badge variant={parkingSupportBadgeVariant(s)} className={parkingSupportBadgeClass(s)}>
                            {parkingSupportShortLabel(s)}
                          </Badge>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-4 text-[var(--text-muted)] sm:px-6">
                      <span className="block truncate">{p.remarks || "—"}</span>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap sm:px-6">
                      <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/projects/${p.id}/report`}
                            className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            보고서
                          </Link>
                          <div
                            className="relative"
                            data-action-menu-root
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setActionMenuProjectId((prev) => (prev === p.id ? null : p.id))
                              }
                              className="btn inline-flex items-center justify-center px-2.5 py-1.5 text-sm"
                              aria-label="추가 작업"
                              aria-haspopup="menu"
                              aria-expanded={actionMenuProjectId === p.id}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {actionMenuProjectId === p.id && (
                              <div
                                role="menu"
                                className="absolute right-0 top-[calc(100%+0.4rem)] z-40 min-w-[140px] rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-lg"
                              >
                                <Link
                                  href={`/projects/${p.id}/edit`}
                                  role="menuitem"
                                  title="기본 정보·일정·날짜별 룸을 함께 수정"
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)]"
                                  onClick={() => setActionMenuProjectId(null)}
                                >
                                  <Pencil className="h-4 w-4" />
                                  수정
                                </Link>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    void handleDeleteProject(p.id);
                                    setActionMenuProjectId(null);
                                  }}
                                  disabled={deletingId === p.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {deletingId === p.id ? "삭제 중..." : "삭제"}
                                </button>
                              </div>
                            )}
                          </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
          </div>
        </details>
        )}
      </main>
    </div>
  );
}
