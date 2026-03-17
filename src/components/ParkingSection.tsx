"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, DoorOpen, Plus, Trash2 } from "lucide-react";
import { useDevStore } from "@/lib/dev-store";
import type { Project, ParkingRecord } from "@/lib/supabase";
import { Badge } from "@/components/ui/Badge";

const TICKET_KEYS = ["all_day_cnt", "2h_cnt", "1h_cnt", "30m_cnt"] as const;
const TICKET_LABELS: Record<string, string> = {
  all_day_cnt: "종일",
  "2h_cnt": "2h",
  "1h_cnt": "1h",
  "30m_cnt": "30m",
};

type RowState = {
  vehicle_num: string;
  date: string;
  all_day_cnt: number;
  "2h_cnt": number;
  "1h_cnt": number;
  "30m_cnt": number;
  recordId?: string;
};

type Props = {
  projectId: string;
  date: string;
  project: Project;
};

export function ParkingSection({ projectId, date, project }: Props) {
  const devStore = useDevStore();
  const [rows, setRows] = useState<RowState[]>([]);
  const vehicleRefs = useRef<(HTMLInputElement | null)[]>([]);
  const ticketRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const loadRecords = useCallback(() => {
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
  }, [projectId, date, devStore]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords, devStore.data]);

  const saveRow = useCallback(
    (row: RowState, index: number) => {
      const vehicle = String(row.vehicle_num).trim().slice(0, 4);
      if (!vehicle) return;
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
      { vehicle_num: "", date, all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0 },
    ]);
    setTimeout(() => vehicleRefs.current[rows.length]?.focus(), 0);
  }, [date, rows.length]);

  const removeRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (row?.recordId) devStore.deleteParkingRecord(row.recordId);
      setRows((prev) => prev.filter((_, i) => i !== index));
    },
    [rows, devStore]
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
    }
    if (e.key === "Tab" && !e.shiftKey) {
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
      if (colIndex > 0) {
        e.preventDefault();
        ticketRefs.current[rowIndex]?.[colIndex - 1]?.focus();
      }
    } else if (e.key === "ArrowRight") {
      if (colIndex < TICKET_KEYS.length - 1) {
        e.preventDefault();
        ticketRefs.current[rowIndex]?.[colIndex + 1]?.focus();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (colIndex < TICKET_KEYS.length - 1) {
        ticketRefs.current[rowIndex]?.[colIndex + 1]?.focus();
      } else {
        addRow();
      }
    }
  };

  return (
    <div className="card card-hover p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2 rounded-lg bg-[#F9FAFF] px-4 py-3">
          <p className="text-base font-semibold text-[var(--text)]">
            {project.org_name}{" "}
            <span className="text-sm font-normal text-[var(--text-muted)]">/ {project.manager}</span>
          </p>
          <div className="flex flex-wrap gap-6 text-sm items-center">
            <Badge variant={project.parking_support ? "success" : "destructive"}>
              주차지원 {project.parking_support ? "O" : "X"}
            </Badge>
            {project.remarks && (
              <p className="font-semibold text-[var(--text)]">{project.remarks}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${projectId}/rooms`} className="btn inline-flex items-center gap-2 px-3 py-2 text-sm">
            <DoorOpen className="h-4 w-4" />
            룸 설정
          </Link>
          <Link href={`/projects/${projectId}/settlement`} className="btn btn-primary inline-flex items-center gap-2 px-3 py-2 text-sm">
            <Calculator className="h-4 w-4" />
            정산
          </Link>
        </div>
      </div>
      <p className="mb-4 text-xs text-[var(--text-muted)]">
        차량 4자리 → Enter 시 숫자 칸. Tab 다음 칸. ↑↓ 수량.
      </p>
      <div className="overflow-x-auto">
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
                <td className="w-28 pl-2 py-2 text-[var(--text-muted)]">{row.date || date}</td>
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
      <button
        type="button"
        onClick={addRow}
        className="btn mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm"
      >
        <Plus className="h-4 w-4" />
        행 추가
      </button>
    </div>
  );
}
