"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
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

export default function EditProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const devStore = useDevStore();
  const [project, setProject] = useState<Project | null>(null);
  const [org_name, setOrgName] = useState("");
  const [manager, setManager] = useState("");
  const [start_date, setStartDate] = useState("");
  const [end_date, setEndDate] = useState("");
  const [parking_support, setParkingSupport] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDevMode()) {
      const p = devStore.getProject(projectId);
      if (p) {
        setProject(p);
        setOrgName(p.org_name);
        setManager(p.manager);
        setStartDate(p.start_date);
        setEndDate(p.end_date);
        setParkingSupport(!!p.parking_support);
        setRemarks(p.remarks ?? "");
      }
      setLoading(false);
      return;
    }
    async function load() {
      const { data, error: e } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (!e && data) {
        const p = data as Project;
        setProject(p);
        setOrgName(p.org_name);
        setManager(p.manager);
        setStartDate(p.start_date);
        setEndDate(p.end_date);
        setParkingSupport(!!p.parking_support);
        setRemarks(p.remarks ?? "");
      }
      setLoading(false);
    }
    load();
  }, [projectId, devStore.data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!org_name.trim() || !manager.trim() || !start_date || !end_date) {
      setError("기관명, 담당자, 시작일, 종료일을 모두 입력해 주세요.");
      return;
    }
    if (new Date(start_date) > new Date(end_date)) {
      setError("시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }
    setSaving(true);
    try {
      if (isDevMode()) {
        devStore.updateProject(projectId, {
          org_name: org_name.trim(),
          manager: manager.trim(),
          start_date,
          end_date,
          parking_support,
          remarks: remarks.trim() || null,
        });
        router.push("/");
        router.refresh();
        return;
      }
      const { error: updateError } = await supabase
        .from("projects")
        .update({
          org_name: org_name.trim(),
          manager: manager.trim(),
          start_date,
          end_date,
          parking_support,
          remarks: remarks.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);
      if (updateError) throw updateError;
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-[var(--text-muted)]">로딩 중...</p>
        <Link href="/" className="mt-4 inline-flex items-center gap-2 text-[var(--primary)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> 대시보드
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-red-600">기관을 찾을 수 없습니다.</p>
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
            <h1 className="text-xl font-semibold text-[var(--text)]">기관 정보 수정</h1>
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
        <h2 className="mb-8 text-lg font-semibold text-[var(--text)]">{project.org_name}</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="card card-hover p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">기관명 *</label>
                <input type="text" value={org_name} onChange={(e) => setOrgName(e.target.value)} className="input w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]" placeholder="예: OO대학교" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">담당자명 *</label>
                <input type="text" value={manager} onChange={(e) => setManager(e.target.value)} className="input w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]" placeholder="예: 홍길동" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">사용 일자 (시작) *</label>
                <input type="date" value={start_date} onChange={(e) => setStartDate(e.target.value)} className="input w-full px-3 py-2.5 text-[var(--text)]" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">사용 일자 (종료) *</label>
                <input type="date" value={end_date} onChange={(e) => setEndDate(e.target.value)} className="input w-full px-3 py-2.5 text-[var(--text)]" />
              </div>
              <div className="sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--text)]">주차지원 여부</span>
                <div className="flex gap-6 text-[var(--text-muted)]">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="parking_support" checked={parking_support === true} onChange={() => setParkingSupport(true)} className="accent-[var(--primary)]" />
                    <span className="font-medium">O (지원함)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="parking_support" checked={parking_support === false} onChange={() => setParkingSupport(false)} className="accent-[var(--primary)]" />
                    <span>X (지원 안 함)</span>
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">비고</label>
                <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input w-full px-3 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)]" placeholder="선택" />
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? "저장 중..." : "수정 저장"}
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
