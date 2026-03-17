"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  PlusCircle,
  Calendar,
  Building2,
  Calculator,
  Pencil,
  DoorOpen,
  User,
  Home,
  Archive,
  Trash2,
  FileText,
} from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/lib/supabase";
import { ParkingSection } from "@/components/ParkingSection";
import { Badge } from "@/components/ui/Badge";

function todayString() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

type ProjectWithRoom = Project & { roomName: string };

export default function HomePage() {
  const [today] = useState(() => todayString());
  const [listMode, setListMode] = useState<"active" | "archive">("active");
  const [supportFilter, setSupportFilter] = useState<"all" | "onlySupport" | "onlyNoSupport">("all");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomByProjectId, setRoomByProjectId] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const devStore = useDevStore();

  useEffect(() => {
    if (isDevMode()) {
      setAllProjects(devStore.getProjects());
      return;
    }
    setLoading(true);
    supabase
      .from("projects")
      .select("*")
      .order("start_date", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setAllProjects(data || []);
      })
      .finally(() => setLoading(false));
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

  const projectsForDate = useMemo(() => {
    const d = new Date(selectedDate).getTime();
    return sourceProjects.filter((p) => {
      const s = new Date(p.start_date).getTime();
      const e = new Date(p.end_date).getTime();
      return d >= s && d <= e;
    });
  }, [sourceProjects, selectedDate]);

  const projectsForDateWithFilter = useMemo(() => {
    if (supportFilter === "all") return projectsForDate;
    return projectsForDate.filter((p) =>
      supportFilter === "onlySupport" ? p.parking_support : !p.parking_support
    );
  }, [projectsForDate, supportFilter]);

  useEffect(() => {
    if (projectsForDate.length === 0) {
      setRoomByProjectId({});
      return;
    }
    if (isDevMode()) {
      const map: Record<string, string> = {};
      projectsForDate.forEach((p) => {
        const rooms = devStore.getRooms(p.id);
        const r = rooms.find((x) => x.date === selectedDate);
        map[p.id] = r?.room_name ?? "미지정";
      });
      setRoomByProjectId(map);
      return;
    }
    const ids = projectsForDate.map((p) => p.id);
    supabase
      .from("project_rooms")
      .select("project_id, room_name")
      .eq("date", selectedDate)
      .in("project_id", ids)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        projectsForDate.forEach((p) => {
          map[p.id] = (data || []).find((x: { project_id: string }) => x.project_id === p.id)?.room_name ?? "미지정";
        });
        setRoomByProjectId(map);
      });
  }, [projectsForDate, selectedDate, devStore.data]);

  const projectsWithRoom: ProjectWithRoom[] = useMemo(
    () =>
      projectsForDateWithFilter.map((p) => ({
        ...p,
        roomName: roomByProjectId[p.id] ?? "미지정",
      })),
    [projectsForDateWithFilter, roomByProjectId]
  );

  const selectedProject = selectedProjectId
    ? allProjects.find((p) => p.id === selectedProjectId) ?? null
    : null;

  useEffect(() => {
    if (selectedProjectId && !projectsForDateWithFilter.some((p) => p.id === selectedProjectId)) {
      // 현재 선택이 필터 결과에 없으면 선택 해제만 하고, 기본 선택은 없음
      setSelectedProjectId(null);
    }
  }, [projectsForDateWithFilter, selectedProjectId]);

  useEffect(() => {
    // 주차지원 필터 변경 시 현재 선택이 필터 결과에 없으면 선택만 해제
    setSelectedProjectId((prev) =>
      prev && projectsForDateWithFilter.some((p) => p.id === prev) ? prev : null
    );
  }, [supportFilter, projectsForDateWithFilter]);

  useEffect(() => {
    setSelectedProjectId(null);
  }, [listMode]);

  const handleDeleteFromArchive = async (projectId: string) => {
    if (deletingId) return;
    if (!confirm("이 행사를 보관함에서 삭제할까요? 삭제 후 복구할 수 없습니다.")) return;
    setDeletingId(projectId);
    try {
      if (isDevMode()) {
        devStore.deleteProject(projectId);
        setAllProjects(devStore.getProjects());
      } else {
        await supabase.from("projects").delete().eq("id", projectId);
        const { data } = await supabase.from("projects").select("*").order("start_date", { ascending: false });
        setAllProjects(data || []);
      }
      setSelectedProjectId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
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
              <h1 className="text-xl font-semibold text-[var(--text)]">주차권 관리 및 자동 정산</h1>
              {isDevMode() && (
                <Badge variant="secondary">개발자 모드</Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[var(--text)]">기관 목록</h2>
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

        <div className="glass mb-8 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              {selectedProject && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[var(--text)]">주차지원</span>
                  <Badge
                    variant={selectedProject.parking_support ? "success" : "destructive"}
                  >
                    <span className="px-2 py-1 text-sm font-bold">
                      {selectedProject.parking_support ? "O" : "X"}
                    </span>
                  </Badge>
                </div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
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
              </div>
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
              {(() => {
                const filteredList = projectsForDateWithFilter;
                return (
              <select
                value={selectedProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
                className="input flex-1 px-3 py-2.5 text-sm text-[var(--text)]"
              >
                <option value="">선택하세요</option>
                {filteredList.map((p) => (
                  <option key={p.id} value={p.id}>
                    기관: {p.org_name} ({p.manager}){" "}
                    {`| 사용 공간: ${roomByProjectId[p.id] ?? "미지정"}`}
                  </option>
                ))}
              </select>
                );
              })()}
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
              <div className="card card-hover mb-6 overflow-hidden p-0">
                <div className="border-b border-[var(--border)] bg-[#F8FAFC] px-6 py-3">
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    {listMode === "archive"
                      ? `보관함 · 선택 일자: ${selectedDate} — 해당 일자 종료 행사 목록`
                      : `선택 일자: ${selectedDate} — 해당 일자 행사 목록`}
                  </h3>
                </div>
                <ul className="divide-y divide-[var(--border)]">
                  {projectsWithRoom.map((p) => (
                    <li
                      key={p.id}
                      className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 transition-colors hover:bg-[#F8FAFC] ${
                        selectedProjectId === p.id ? "bg-[#EFF6FF]" : ""
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
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--border)]">
                          <User className="h-5 w-5 text-[var(--text-muted)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--text)]">{p.org_name}</p>
                          <p className="text-sm text-[var(--text-muted)]">{p.manager}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-4 text-sm">
                          <span className="text-[var(--text-muted)]">
                            <span className="font-medium text-[var(--text)]">일자</span> {selectedDate}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            <span className="font-medium text-[var(--text)]">사용 공간</span> {p.roomName}
                          </span>
                          <Badge variant={p.parking_support ? "success" : "destructive"}>
                            주차지원 {p.parking_support ? "O" : "X"}
                          </Badge>
                        </div>
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
                                handleDeleteFromArchive(p.id);
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
                            <Link
                              href={`/projects/${p.id}/settlement`}
                              className="btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                            >
                              <Calculator className="h-4 w-4" />
                              정산
                            </Link>
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

            {selectedProject && projectsForDate.length > 0 && (
              <div className="card card-hover p-6">
                <p className="mb-3 text-sm font-medium text-[var(--text-muted)]">선택한 행사 상세</p>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2 rounded-lg bg-[#F9FAFF] px-4 py-3">
                    <p className="text-base font-semibold text-[var(--text)]">
                      {selectedProject.org_name}{" "}
                      <span className="text-sm font-normal text-[var(--text-muted)]">
                        / {selectedProject.manager}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-6 text-sm items-center">
                      <Badge variant={selectedProject.parking_support ? "success" : "destructive"}>
                        주차지원 {selectedProject.parking_support ? "O" : "X"}
                      </Badge>
                      {selectedProject.remarks && (
                        <p className="font-semibold text-[var(--text)]">
                          {selectedProject.remarks}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[var(--text)]">
                      사용 공간 {roomByProjectId[selectedProject.id] ?? "미지정"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/projects/${selectedProject.id}/edit`}
                      className="btn inline-flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <Pencil className="h-4 w-4" />
                      수정
                    </Link>
                    <Link
                      href={`/projects/${selectedProject.id}/rooms`}
                      className="btn inline-flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <DoorOpen className="h-4 w-4" />
                      룸 설정
                    </Link>
                    <Link
                      href={`/projects/${selectedProject.id}/parking`}
                      className="btn btn-primary inline-flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      주차권 등록
                    </Link>
                    <Link
                      href={`/projects/${selectedProject.id}/settlement`}
                      className="btn inline-flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <Calculator className="h-4 w-4" />
                      정산
                    </Link>
                    {listMode === "archive" && (
                      <>
                        <Link
                          href={`/projects/${selectedProject.id}/report`}
                          className="btn inline-flex items-center gap-2 px-3 py-2 text-sm"
                        >
                          <FileText className="h-4 w-4" />
                          보고서
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteFromArchive(selectedProject.id)}
                          disabled={deletingId === selectedProject.id}
                          className="btn inline-flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingId === selectedProject.id ? "삭제 중..." : "보관함에서 삭제"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
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

        <details className="mt-10">
          <summary className="cursor-pointer text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
            {listMode === "archive" ? "보관함 전체 목록 (삭제 등)" : "전체 기관 목록 (수정 · 룸 설정 등)"}
          </summary>
          <div className="card card-hover mt-4 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="px-6 py-4 font-medium text-[var(--text)]">기관명</th>
                  <th className="px-6 py-4 font-medium text-[var(--text)]">담당자</th>
                  <th className="px-6 py-4 font-medium text-[var(--text)]">사용 일자</th>
                  <th className="px-6 py-4 font-medium text-[var(--text)]">주차지원</th>
                  <th className="px-6 py-4 font-medium text-[var(--text)]">비고</th>
                  <th className="px-6 py-4 font-medium text-[var(--text)]">작업</th>
                </tr>
              </thead>
              <tbody>
                {sourceProjects.map((p) => (
                  <tr key={p.id} className="table-row-hover transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--text)]">{p.org_name}</td>
                    <td className="px-6 py-4 text-[var(--text-muted)]">{p.manager}</td>
                    <td className="px-6 py-4 text-[var(--text-muted)]">{p.start_date} ~ {p.end_date}</td>
                    <td className="px-6 py-4">
                      <Badge variant={p.parking_support ? "success" : "destructive"}>
                        {p.parking_support ? "O" : "X"}
                      </Badge>
                    </td>
                    <td className="max-w-[140px] truncate px-6 py-4 text-[var(--text-muted)]">{p.remarks || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {listMode === "archive" ? (
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/projects/${p.id}/report`}
                              className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              보고서
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDeleteFromArchive(p.id)}
                              disabled={deletingId === p.id}
                              className="inline-flex items-center gap-1.5 text-red-600 hover:underline disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              보관함에서 삭제
                            </button>
                          </div>
                        ) : (
                          <>
                            <Link
                              href={`/projects/${p.id}/edit`}
                              className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:underline"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              수정
                            </Link>
                            <Link href={`/projects/${p.id}/rooms`} className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text)]">룸 설정</Link>
                            <Link href={`/projects/${p.id}/parking`} className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text)]">주차권</Link>
                            <Link
                              href={`/projects/${p.id}/settlement`}
                              className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                            >
                              <Calculator className="h-3.5 w-3.5" />
                              정산
                            </Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </main>
    </div>
  );
}
