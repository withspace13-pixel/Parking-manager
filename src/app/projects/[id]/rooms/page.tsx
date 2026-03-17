"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, DoorOpen, Save } from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/lib/supabase";

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function ProjectRoomsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const devStore = useDevStore();
  const [project, setProject] = useState<Project | null>(null);
  const [roomByDate, setRoomByDate] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dateList =
    project?.start_date && project?.end_date
      ? getDateRange(project.start_date, project.end_date)
      : [];

  useEffect(() => {
    if (isDevMode()) {
      const p = devStore.getProject(projectId);
      if (!p) {
        setError("프로젝트를 찾을 수 없습니다.");
        return;
      }
      setProject(p);
      const rooms = devStore.getRooms(projectId);
      const map: Record<string, string> = {};
      rooms.forEach((r) => {
        map[r.date] = r.room_name;
      });
      setRoomByDate(map);
      return;
    }
    async function load() {
      const { data: p, error: e } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (e || !p) {
        setError("프로젝트를 찾을 수 없습니다.");
        return;
      }
      setProject(p as Project);

      const { data: rooms } = await supabase
        .from("project_rooms")
        .select("date, room_name")
        .eq("project_id", projectId);
      const map: Record<string, string> = {};
      (rooms || []).forEach((r: { date: string; room_name: string }) => {
        map[r.date] = r.room_name;
      });
      setRoomByDate(map);
    }
    load();
  }, [projectId, devStore.data]);

  const setRoom = (date: string, value: string) => {
    setRoomByDate((prev) => ({ ...prev, [date]: value }));
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

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      if (isDevMode()) {
        const rooms = dateList.map((date) => ({
          date,
          room_name: (roomByDate[date] ?? "").trim() || "미지정",
        }));
        devStore.saveRooms(projectId, rooms);
        router.push("/");
        return;
      }
      await supabase.from("project_rooms").delete().eq("project_id", projectId);
      if (dateList.length > 0) {
        const rooms = dateList.map((date) => ({
          project_id: projectId,
          date,
          room_name: (roomByDate[date] ?? "").trim() || "미지정",
        }));
        const { error: roomsError } = await supabase
          .from("project_rooms")
          .insert(rooms);
        if (roomsError) throw roomsError;
      }
      router.push("/");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string")
            ? String((err as { message: string }).message)
            : "저장 실패";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8">
        {error ? <p className="text-red-600">{error}</p> : <p className="text-[var(--text-muted)]">로딩 중...</p>}
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
            <h1 className="text-xl font-semibold text-[var(--text)]">룸 설정</h1>
            <nav className="flex items-center gap-2">
              <Link href="/" className="btn inline-flex items-center gap-2 px-3 py-2 text-sm">
                <ArrowLeft className="h-4 w-4" />
                대시보드
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">{project.org_name}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {project.manager} · {project.start_date} ~ {project.end_date}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={applyRoomsToAll} className="btn inline-flex items-center gap-2 px-4 py-2 text-sm">
              <Copy className="h-4 w-4" />
              룸 일괄 적용
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? "저장 중..." : "저장"}
            </button>
            <Link href="/" className="btn inline-flex items-center gap-2 px-4 py-2 text-sm">
              <ArrowLeft className="h-4 w-4" />
              목록
            </Link>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <div className="card card-hover overflow-hidden p-0">
          <div className="border-b border-[var(--border)] px-6 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <DoorOpen className="h-4 w-4 text-[var(--text-muted)]" />
              날짜별 사용 룸
            </h3>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {dateList.map((date) => (
              <li key={date} className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-[#F8FAFC]">
                <span className="w-28 shrink-0 text-sm text-[var(--text-muted)]">{date}</span>
                <input
                  type="text"
                  value={roomByDate[date] ?? ""}
                  onChange={(e) => setRoom(date, e.target.value)}
                  className="input flex-1 px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
                  placeholder="예: A, B, C"
                />
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
