"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Calculator, Home, Plus, Trash2 } from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { supabase } from "@/lib/supabase";
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

type RowState = {
  vehicle_num: string;
  date: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
  recordId?: string;
};

const TICKET_KEYS = ["all_day_cnt", "2h_cnt", "1h_cnt", "30m_cnt"] as const;
const TICKET_LABELS: Record<string, string> = {
  all_day_cnt: "종일",
  "2h_cnt": "2h",
  "1h_cnt": "1h",
  "30m_cnt": "30m",
};

export default function ParkingPageClient() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const devStore = useDevStore();
  const [project, setProject] = useState<Project | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedRoomName, setSelectedRoomName] = useState<string>("미지정");
  const [rows, setRows] = useState<RowState[]>([]);
  const vehicleRefs = useRef<(HTMLInputElement | null)[]>([]);
  const ticketRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const dateList =
    project?.start_date && project?.end_date
      ? getDateRange(project.start_date, project.end_date)
      : [];

  useEffect(() => {
    if (!dateList.length) return;
    if (!selectedDate) {
      const today = new Date().toISOString().slice(0, 10);
      const defaultDate = dateList.includes(today) ? today : dateList[0];
      setSelectedDate(defaultDate);
    }
  }, [dateList, selectedDate]);

  useEffect(() => {
    if (!project) return;
    if (!selectedDate) {
      setSelectedRoomName("미지정");
      return;
    }
    if (isDevMode()) {
      const rooms = devStore.getRooms(projectId);
      const r = rooms.find((x) => x.date === selectedDate);
      setSelectedRoomName(r?.room_name ?? "미지정");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("project_rooms")
        .select("room_name")
        .eq("project_id", projectId)
        .eq("date", selectedDate)
        .maybeSingle();
      setSelectedRoomName((data as { room_name: string } | null)?.room_name ?? "미지정");
    })();
  }, [project, selectedDate, projectId, devStore]);

  useEffect(() => {
    if (isDevMode()) {
      const p = devStore.getProject(projectId);
      if (p) setProject(p);
      return;
    }
    async function loadProject() {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (!error && data) setProject(data as Project);
    }
    loadProject();
  }, [projectId, devStore.data]);

  const loadRecords = useCallback(
    (date: string) => {
      if (isDevMode()) {
        const data = devStore.getParkingRecords(projectId, date);
        const list = data.map((r: ParkingRecord) => ({
          vehicle_num: r.vehicle_num,
          date: r.date,
          all_day_cnt: r.all_day_cnt,
          "2h_cnt": r["2h_cnt"],
          "1h_cnt": r["1h_cnt"],
          "30m_cnt": r["30m_cnt"],
          recordId: r.id,
        }));
        setRows(list.length ? list : [{ vehicle_num: "", date, all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0 }]);
        return;
      }
      (async () => {
        const { data } = await supabase
          .from("parking_records")
          .select("*")
          .eq("project_id", projectId)
          .eq("date", date)
          .order("vehicle_num");
        const list = (data || []).map((r: ParkingRecord) => ({
          vehicle_num: r.vehicle_num,
          date: r.date,
          all_day_cnt: r.all_day_cnt,
          "2h_cnt": r["2h_cnt"],
          "1h_cnt": r["1h_cnt"],
          "30m_cnt": r["30m_cnt"],
          recordId: r.id,
        }));
        setRows(list.length ? list : [{ vehicle_num: "", date, all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0 }]);
      })();
    },
    [projectId, devStore]
  );

  useEffect(() => {
    if (selectedDate) loadRecords(selectedDate);
  }, [selectedDate, loadRecords]);

  const saveRow = useCallback(
    (row: RowState, index: number) => {
      const vehicle = String(row.vehicle_num).trim().slice(0, 4);
      if (!vehicle) return;
      if (isDevMode()) {
        const saved = devStore.upsertParkingRecord({
          project_id: projectId,
          vehicle_num: vehicle,
          date: row.date,
          all_day_cnt: row.all_day_cnt,
          "2h_cnt": row["2h_cnt"],
          "1h_cnt": row["1h_cnt"],
          "30m_cnt": row["30m_cnt"],
        });
        setRows((prev) =>
          prev.map((r, i) => (i === index ? { ...r, recordId: saved.id } : r))
        );
        return;
      }
      (async () => {
        const payload = {
          project_id: projectId,
          vehicle_num: vehicle,
          date: row.date,
          all_day_cnt: row.all_day_cnt,
          "2h_cnt": row["2h_cnt"],
          "1h_cnt": row["1h_cnt"],
          "30m_cnt": row["30m_cnt"],
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from("parking_records")
          .upsert(payload, { onConflict: "project_id,vehicle_num,date" })
          .select("id")
          .single();
        if (!error && data) {
          setRows((prev) =>
            prev.map((r, i) => (i === index ? { ...r, recordId: data.id } : r))
          );
        }
      })();
    },
    [projectId, devStore]
  );

  const updateRow = useCallback(
    (index: number, field: keyof RowState, value: string | number) => {
      setRows((prev) => {
        const next = [...prev];
        const r = { ...next[index] };
        if (field === "vehicle_num") {
          r.vehicle_num = String(value).replace(/\D/g, "").slice(0, 4);
        } else if (field === "all_day_cnt" || field === "2h_cnt" || field === "1h_cnt" || field === "30m_cnt") {
          r[field] = Math.max(0, parseInt(String(value), 10) || 0);
        } else if (field === "date") {
          r.date = String(value);
        }
        next[index] = r;
        if (field !== "vehicle_num" && r.vehicle_num.trim()) saveRow(r, index);
        return next;
      });
    },
    [saveRow]
  );

  const saveVehicleRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (row?.vehicle_num?.trim()) saveRow(row, index);
    },
    [rows, saveRow]
  );

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { vehicle_num: "", date: selectedDate, all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0 },
    ]);
    setTimeout(() => vehicleRefs.current[rows.length]?.focus(), 0);
  }, [selectedDate, rows.length]);

  const removeRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (row?.recordId) {
        if (isDevMode()) devStore.deleteParkingRecord(row.recordId);
        else supabase.from("parking_records").delete().eq("id", row.recordId).then(() => loadRecords(selectedDate));
      }
      setRows((prev) => prev.filter((_, i) => i !== index));
    },
    [rows, selectedDate, devStore, loadRecords]
  );

  const onVehicleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[index];
      const v = String(row?.vehicle_num ?? "").trim().slice(0, 4);
      if (v) {
        saveRow({ ...row!, vehicle_num: v }, index);
        ticketRefs.current[index]?.[0]?.focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index > 0) vehicleRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (index < rows.length - 1) vehicleRefs.current[index + 1]?.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      ticketRefs.current[index]?.[0]?.focus();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      ticketRefs.current[index]?.[0]?.focus();
    }
  };

  const onTicketKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const row = rows[rowIndex];
      const key = TICKET_KEYS[colIndex];
      updateRow(rowIndex, key, (row[key] || 0) + 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const row = rows[rowIndex];
      const key = TICKET_KEYS[colIndex];
      updateRow(rowIndex, key, Math.max(0, (row[key] || 0) - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (colIndex > 0) {
        ticketRefs.current[rowIndex]?.[colIndex - 1]?.focus();
      } else {
        vehicleRefs.current[rowIndex]?.focus();
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (colIndex < TICKET_KEYS.length - 1) {
        ticketRefs.current[rowIndex]?.[colIndex + 1]?.focus();
      }
    } else if (e.key === "Tab" && !e.shiftKey && rowIndex === rows.length - 1 && colIndex === TICKET_KEYS.length - 1) {
      e.preventDefault();
      const nextIndex = rows.length;
      addRow();
      setTimeout(() => vehicleRefs.current[nextIndex]?.focus(), 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (colIndex < TICKET_KEYS.length - 1) {
        ticketRefs.current[rowIndex]?.[colIndex + 1]?.focus();
      } else {
        addRow();
      }
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white p-2 text-[var(--text-muted)] shadow-sm hover:bg-[var(--bg)] hover:text-[var(--text)]"
                aria-label="홈으로"
              >
                <Home className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-semibold text-[var(--text)]">주차권 등록</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3 rounded-2xl border border-[#DCE8FF] bg-[#EFF4FF] px-6 py-5">
            <p className="text-lg font-semibold text-[var(--text)]">
              {project.org_name}{" "}
              <span className="text-base font-normal text-[var(--text-muted)]">/ {project.manager}</span>
            </p>
            <div className="flex flex-wrap items-center gap-4 text-base">
              <span className="font-semibold text-[var(--text)]">
                주차지원{" "}
                <span
                  className={
                    project.parking_support ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"
                  }
                >
                  {project.parking_support ? "O" : "X"}
                </span>
              </span>
              {project.remarks && (
                <span className="font-semibold text-[var(--text)]">{project.remarks}</span>
              )}
            </div>
            <p className="text-base font-semibold text-[var(--text)]">
              사용 공간{" "}
              <span className="font-semibold text-[var(--text)]">{selectedRoomName}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-[var(--text)]">일자</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input min-w-[148px] px-3 py-2.5 text-sm text-[var(--text)]"
            >
              {dateList.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <Link
              href={`/projects/${projectId}/settlement`}
              className="btn btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
            >
              <Calculator className="h-4 w-4" />
              정산 보기
            </Link>
          </div>
        </div>

        <p className="mb-4 text-xs text-[var(--text-muted)]">
          차량 4자리 → Enter 시 숫자 칸으로 이동. Tab으로 다음 칸. ↑↓로 수량 증감.
        </p>

        <div className="card card-hover overflow-x-auto p-8">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[var(--text-muted)]">
                <th className="w-24 pb-3 font-medium text-[var(--text)]">차량</th>
                {TICKET_KEYS.map((k) => (
                  <th key={k} className="w-16 px-1 pb-3 text-center font-medium text-[var(--text)]">{TICKET_LABELS[k]}</th>
                ))}
                <th className="w-28 pl-2 pb-3 font-medium text-[var(--text)]">일자</th>
                <th className="w-12 pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="table-row-hover transition-colors">
                  <td className="py-2 pr-2">
                    <input
                      ref={(el) => { vehicleRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={row.vehicle_num}
                      onChange={(e) => updateRow(index, "vehicle_num", e.target.value.replace(/\D/g, ""))}
                      onBlur={() => saveVehicleRow(index)}
                      onKeyDown={(e) => onVehicleKeyDown(e, index)}
                      className="input w-20 px-2.5 py-2 text-center text-sm font-bold text-[var(--text)]"
                      placeholder="0000"
                    />
                  </td>
                  {TICKET_KEYS.map((key, colIndex) => (
                    <td key={key} className="w-16 px-1 py-2">
                      <input
                        ref={(el) => {
                          if (!ticketRefs.current[index]) ticketRefs.current[index] = [];
                          ticketRefs.current[index][colIndex] = el;
                        }}
                        type="number"
                        min={0}
                        value={row[key] === 0 ? "" : row[key]}
                        onChange={(e) => updateRow(index, key, e.target.value)}
                        onKeyDown={(e) => onTicketKeyDown(e, index, colIndex)}
                        className="input-inset w-full px-1 py-1.5 text-center text-sm text-[var(--text)]"
                      />
                    </td>
                  ))}
                  <td className="w-28 pl-2 py-2 text-[var(--text-muted)]">{row.date || selectedDate}</td>
                  <td className="w-12 py-2 pl-1">
                    {(row.recordId || row.vehicle_num?.trim()) && (
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="rounded p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600"
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={addRow}
            className="btn inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            행 추가
          </button>
          <Link
            href="/"
            className="btn btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            완료
          </Link>
        </div>
      </main>
    </div>
  );
}
