"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Calculator, Home, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";
import { isDevMode } from "@/lib/dev-mode";
import { useDevStore } from "@/lib/dev-store";
import { supabase } from "@/lib/supabase";
import type { Project, ParkingRecord } from "@/lib/supabase";
import {
  cycleParkingSupport,
  parseParkingSupport,
  parkingSupportShortLabel,
  parkingSupportUiClass,
} from "@/lib/parking-support";
import { formatMonthDaySlash, periodLabelMonthDayFromSortedYmd } from "@/lib/schedule-dates";
import {
  isMhpApplyResponse,
  isMhpCreditResponse,
  isMhpLookupResponse,
  postMhpApplyRequest,
  postMhpCreditRequest,
  postMhpLookupRequest,
  splitMhpParkingDisplayText,
} from "@/lib/mhp-extension";

const MHP_CREDIT_POLL_MS = 40_000;
const MHP_CREDIT_TIMEOUT_MS = 22_000;

function fallbackPeriodFromProject(p: Project): string {
  const s = String(p.start_date).slice(0, 10);
  const e = String(p.end_date).slice(0, 10);
  if (s.length < 10 || e.length < 10) return "";
  return s === e ? formatMonthDaySlash(s) : `${formatMonthDaySlash(s)} ~ ${formatMonthDaySlash(e)}`;
}

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
  /** MHP 콘솔 조회 결과(화면 전용, DB 미저장) */
  mhp_entry_at?: string;
  mhp_parking_duration?: string;
  /** MHP에 이미 적용된(취소 아님) 할인 요약 — 중복 등록 안내 */
  mhp_applied_discounts_summary?: string;
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
  const [remarksInput, setRemarksInput] = useState("");
  const [remarksSaving, setRemarksSaving] = useState(false);
  const [remarksEditing, setRemarksEditing] = useState(false);
  const [togglingSupport, setTogglingSupport] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedRoomName, setSelectedRoomName] = useState<string>("미지정");
  const [roomsSummaryLine, setRoomsSummaryLine] = useState("");
  const [periodLabelLine, setPeriodLabelLine] = useState("");
  const [dateList, setDateList] = useState<string[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const vehicleRefs = useRef<(HTMLInputElement | null)[]>([]);
  const ticketRefs = useRef<(HTMLInputElement | null)[][]>([]);
  const mhpPendingRef = useRef<{ requestId: string; index: number; vehicleNum: string } | null>(null);
  const mhpApplyPendingRef = useRef<{ requestId: string; index: number } | null>(null);
  const mhpCreditPendingRef = useRef<string | null>(null);
  const refreshMhpCreditRef = useRef<() => void>(() => {});
  const [mhpLoadingIndex, setMhpLoadingIndex] = useState<number | null>(null);
  const [mhpApplyLoadingIndex, setMhpApplyLoadingIndex] = useState<number | null>(null);
  const [mhpCreditDisplay, setMhpCreditDisplay] = useState<string | null>(null);
  const [mhpCreditError, setMhpCreditError] = useState<string | null>(null);
  const [mhpCreditLoading, setMhpCreditLoading] = useState(false);

  useEffect(() => {
    if (!dateList.length) {
      setSelectedDate("");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const defaultDate = dateList.includes(today) ? today : dateList[0];
    if (!selectedDate || !dateList.includes(selectedDate)) {
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
    if (!projectId || !project) return;
    const proj = project;

    function applyFromRoomRows(rows: { date: string; room_name: string }[]) {
      const sortedDates = Array.from(new Set(rows.map((r) => String(r.date).slice(0, 10)))).sort();
      // "사용한 날짜만" 보여주기 위해 dateList를 project_rooms에 있는 날짜로 구성합니다.
      // (rooms가 비어있으면 기존 start_date~end_date fallback)
      setDateList(
        sortedDates.length > 0
          ? sortedDates
          : proj.start_date && proj.end_date
            ? getDateRange(proj.start_date, proj.end_date)
            : []
      );
      const period =
        sortedDates.length > 0
          ? periodLabelMonthDayFromSortedYmd(sortedDates)
          : fallbackPeriodFromProject(proj);
      setPeriodLabelLine(period);
      const byDate = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const seen = new Set<string>();
      const names: string[] = [];
      for (const r of byDate) {
        const n = (r.room_name ?? "").trim() || "미지정";
        if (!seen.has(n)) {
          seen.add(n);
          names.push(n);
        }
      }
      setRoomsSummaryLine(names.length > 0 ? names.join(", ") : "미지정");
    }

    if (isDevMode()) {
      applyFromRoomRows(devStore.getRooms(projectId));
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("project_rooms").select("date, room_name").eq("project_id", projectId);
      if (!cancelled) applyFromRoomRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, project, devStore.data]);

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
      if (!error && data) {
        const row = data as Project;
        setProject({ ...row, parking_support: parseParkingSupport(row.parking_support as unknown) });
      }
    }
    loadProject();
  }, [projectId, devStore.data]);

  useEffect(() => {
    if (project) setRemarksInput(project.remarks ?? "");
  }, [project?.id, project?.remarks]);

  const handleToggleParkingSupport = useCallback(async () => {
    if (!project || togglingSupport) return;
    const next = cycleParkingSupport(parseParkingSupport(project.parking_support as unknown));
    setTogglingSupport(true);
    try {
      if (isDevMode()) {
        devStore.updateProject(projectId, { parking_support: next });
        const p = devStore.getProject(projectId);
        if (p) setProject(p);
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
        setProject((prev) => (prev ? { ...prev, parking_support: next } : prev));
      }
    } finally {
      setTogglingSupport(false);
    }
  }, [project, projectId, togglingSupport, devStore]);

  const saveRemarks = useCallback(async () => {
    if (!project) return;
    const trimmed = remarksInput.trim();
    const prev = (project.remarks ?? "").trim();
    if (trimmed === prev) return;
    setRemarksSaving(true);
    try {
      if (isDevMode()) {
        devStore.updateProject(projectId, { remarks: trimmed || null });
        const p = devStore.getProject(projectId);
        if (p) setProject(p);
      } else {
        const { error } = await supabase
          .from("projects")
          .update({ remarks: trimmed || null, updated_at: new Date().toISOString() })
          .eq("id", projectId);
        if (error) {
          console.error(error);
          alert("비고를 저장하지 못했습니다.");
          return;
        }
        setProject((p) => (p ? { ...p, remarks: trimmed || null } : p));
      }
    } finally {
      setRemarksSaving(false);
    }
  }, [project, projectId, remarksInput, devStore]);

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
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
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

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !isMhpLookupResponse(e.data)) return;
      const pending = mhpPendingRef.current;
      if (!pending || e.data.requestId !== pending.requestId) return;
      const { index: rowIndex, vehicleNum: expectedV } = pending;
      mhpPendingRef.current = null;
      setMhpLoadingIndex(null);

      const rowVehicleOk = (v: string) =>
        String(v ?? "")
          .replace(/\D/g, "")
          .slice(0, 4) === expectedV;

      if (e.data.ok && (e.data.parkingTimeText ?? "").trim()) {
        const text = (e.data.parkingTimeText ?? "").trim();
        const { entryAt, duration } = splitMhpParkingDisplayText(text);
        const summary = (e.data.appliedDiscountsSummary ?? "").trim();
        setRows((prev) => {
          const row = prev[rowIndex];
          if (!row || !rowVehicleOk(row.vehicle_num)) return prev;
          return prev.map((r, i) =>
            i === rowIndex
              ? {
                  ...r,
                  mhp_entry_at: entryAt,
                  mhp_parking_duration: duration,
                  mhp_applied_discounts_summary: summary || undefined,
                }
              : r
          );
        });
        if (summary) {
          alert(`이미 주차권 등록된 내역이 있습니다.\n\n${summary}`);
        }
      } else {
        setRows((prev) => {
          const row = prev[rowIndex];
          if (!row || !rowVehicleOk(row.vehicle_num)) return prev;
          return prev.map((r, i) =>
            i === rowIndex
              ? {
                  ...r,
                  mhp_entry_at: undefined,
                  mhp_parking_duration: undefined,
                  mhp_applied_discounts_summary: undefined,
                }
              : r
          );
        });
        alert(e.data.error?.trim() || "MHP 조회에 실패했습니다.");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    const onApplyMsg = (e: MessageEvent) => {
      if (e.source !== window || !isMhpApplyResponse(e.data)) return;
      const pending = mhpApplyPendingRef.current;
      if (!pending || e.data.requestId !== pending.requestId) return;
      mhpApplyPendingRef.current = null;
      setMhpApplyLoadingIndex(null);
      if (e.data.ok) {
        alert((e.data.detail || "MHP에 할인 적용을 요청했습니다.").trim());
        refreshMhpCreditRef.current();
      } else {
        alert(e.data.error?.trim() || "MHP 등록에 실패했습니다.");
      }
    };
    window.addEventListener("message", onApplyMsg);
    return () => window.removeEventListener("message", onApplyMsg);
  }, []);

  const requestMhpCredit = useCallback(() => {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `mhp-credit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mhpCreditPendingRef.current = requestId;
    setMhpCreditLoading(true);
    postMhpCreditRequest(requestId);
    window.setTimeout(() => {
      if (mhpCreditPendingRef.current !== requestId) return;
      mhpCreditPendingRef.current = null;
      setMhpCreditLoading(false);
      setMhpCreditError("크레딧 응답이 없습니다. MHP 탭·확장을 확인하세요.");
    }, MHP_CREDIT_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    refreshMhpCreditRef.current = requestMhpCredit;
  }, [requestMhpCredit]);

  useEffect(() => {
    const onCredit = (e: MessageEvent) => {
      if (e.source !== window || !isMhpCreditResponse(e.data)) return;
      if (mhpCreditPendingRef.current !== e.data.requestId) return;
      mhpCreditPendingRef.current = null;
      setMhpCreditLoading(false);
      if (e.data.ok && (e.data.creditText ?? "").trim()) {
        setMhpCreditDisplay((e.data.creditText ?? "").trim());
        setMhpCreditError(null);
      } else {
        setMhpCreditError(e.data.error?.trim() || "스토어 크레딧을 불러오지 못했습니다.");
      }
    };
    window.addEventListener("message", onCredit);
    return () => window.removeEventListener("message", onCredit);
  }, []);

  useEffect(() => {
    requestMhpCredit();
    const id = window.setInterval(requestMhpCredit, MHP_CREDIT_POLL_MS);
    return () => window.clearInterval(id);
  }, [requestMhpCredit]);

  const requestMhpApply = useCallback(
    (index: number) => {
      const row = rows[index];
      const v = String(row?.vehicle_num ?? "").trim().replace(/\D/g, "").slice(0, 4);
      if (v.length !== 4) {
        alert("차량 번호 4자리를 입력한 뒤 등록하세요.");
        return;
      }
      const ad = row?.all_day_cnt ?? 0;
      const h2 = row?.["2h_cnt"] ?? 0;
      const h1 = row?.["1h_cnt"] ?? 0;
      const m30 = row?.["30m_cnt"] ?? 0;
      if (ad + h2 + h1 + m30 <= 0) {
        alert("종일·2h·1h·30m 중 최소 하나에 수량을 입력하세요.");
        return;
      }
      const mhpExisting = (row?.mhp_applied_discounts_summary ?? "").trim();
      if (mhpExisting) {
        alert(
          `이미 주차권 등록된 내역이 있습니다.\n\n${mhpExisting}\n\nMHP에서 해당 할인을 확인·처리한 뒤 다시 조회하면 등록할 수 있습니다.`
        );
        return;
      }
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `mhp-apply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      mhpApplyPendingRef.current = { requestId, index };
      setMhpApplyLoadingIndex(index);
      postMhpApplyRequest(requestId, v, {
        all_day_cnt: ad,
        "2h_cnt": h2,
        "1h_cnt": h1,
        "30m_cnt": m30,
      });
      const applySteps =
        (ad > 0 ? 1 : 0) + (h2 > 0 ? 1 : 0) + (h1 > 0 ? 1 : 0) + (m30 > 0 ? 1 : 0);
      const applyTimeoutMs = 25000 + Math.max(0, applySteps - 1) * 7000;
      window.setTimeout(() => {
        if (mhpApplyPendingRef.current?.requestId !== requestId) return;
        mhpApplyPendingRef.current = null;
        setMhpApplyLoadingIndex((cur) => (cur === index ? null : cur));
        alert("응답이 없습니다. 확장 프로그램과 MHP 탭을 확인하세요.");
      }, applyTimeoutMs);
    },
    [rows]
  );

  const requestMhpLookup = useCallback(
    (index: number) => {
      const row = rows[index];
      const v = String(row?.vehicle_num ?? "").trim().replace(/\D/g, "").slice(0, 4);
      if (v.length !== 4) {
        alert("차량 번호 4자리를 입력한 뒤 조회하세요.");
        return;
      }
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `mhp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setRows((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                mhp_entry_at: undefined,
                mhp_parking_duration: undefined,
                mhp_applied_discounts_summary: undefined,
              }
            : r
        )
      );
      mhpPendingRef.current = { requestId, index, vehicleNum: v };
      setMhpLoadingIndex(index);
      postMhpLookupRequest(v, requestId);
      window.setTimeout(() => {
        if (mhpPendingRef.current?.requestId !== requestId) return;
        mhpPendingRef.current = null;
        setMhpLoadingIndex((cur) => (cur === index ? null : cur));
        alert("응답이 없습니다. 확장 프로그램 설치·새로고침과 MHP 콘솔 탭을 확인하세요.");
      }, 32000);
    },
    [rows]
  );

  const saveRow = useCallback(
    (row: RowState, index: number) => {
      const vehicle = String(row.vehicle_num).trim().slice(0, 4);
      if (!vehicle) return;
      if (isDevMode()) {
        const saved = devStore.upsertParkingRecord({
          id: row.recordId,
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
        const query = row.recordId
          ? supabase.from("parking_records").update(payload).eq("id", row.recordId).select("id").single()
          : supabase.from("parking_records").insert(payload).select("id").single();
        const { data, error } = await query;
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
    setRows((prev) => {
      const newIndex = prev.length;
      setTimeout(() => vehicleRefs.current[newIndex]?.focus(), 0);
      return [
        ...prev,
        {
          vehicle_num: "",
          date: selectedDate,
          all_day_cnt: 0,
          "2h_cnt": 0,
          "1h_cnt": 0,
          "30m_cnt": 0,
        },
      ];
    });
  }, [selectedDate]);

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
    const lastTicketCol = TICKET_KEYS.length - 1;
    if (e.key === "Enter") {
      e.preventDefault();
      saveVehicleRow(index);
      addRow();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index > 0) vehicleRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (index < rows.length - 1) vehicleRefs.current[index + 1]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (index > 0) ticketRefs.current[index - 1]?.[lastTicketCol]?.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      ticketRefs.current[index]?.[0]?.focus();
    }
  };

  const onTicketKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    const lastCol = TICKET_KEYS.length - 1;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowIndex > 0) ticketRefs.current[rowIndex - 1]?.[colIndex]?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rowIndex < rows.length - 1) ticketRefs.current[rowIndex + 1]?.[colIndex]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (colIndex > 0) {
        ticketRefs.current[rowIndex]?.[colIndex - 1]?.focus();
      } else {
        vehicleRefs.current[rowIndex]?.focus();
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (colIndex < lastCol) {
        ticketRefs.current[rowIndex]?.[colIndex + 1]?.focus();
      } else if (rowIndex < rows.length - 1) {
        vehicleRefs.current[rowIndex + 1]?.focus();
      }
    } else if (e.key === "Tab" && !e.shiftKey && colIndex === lastCol) {
      e.preventDefault();
      if (rowIndex < rows.length - 1) {
        vehicleRefs.current[rowIndex + 1]?.focus();
      } else {
        addRow();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      saveVehicleRow(rowIndex);
      addRow();
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
        <div className="mx-auto max-w-7xl px-8 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
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
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 shadow-sm sm:px-4 sm:py-2.5">
              <Wallet className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
              <div className="min-w-0 text-right">
                <p className="text-sm font-semibold tracking-tight text-[var(--text-muted)] sm:text-base">
                  MHP 스토어 크레딧
                </p>
                <p
                  className="text-base font-bold tabular-nums text-[var(--text)] sm:text-lg"
                  title={mhpCreditError && !mhpCreditDisplay ? mhpCreditError : undefined}
                >
                  {mhpCreditLoading && !mhpCreditDisplay ? "…" : (mhpCreditDisplay ?? "—")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => requestMhpCredit()}
                disabled={mhpCreditLoading}
                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)] disabled:cursor-wait disabled:opacity-50"
                title="크레딧 다시 읽기 (MHP 탭 열림 필요)"
                aria-label="스토어 크레딧 새로고침"
              >
                <RefreshCw className={`h-4 w-4 ${mhpCreditLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-6">
            <div className="min-w-[260px] space-y-3 rounded-2xl border border-[#DCE8FF] bg-[#EFF4FF] px-6 py-5">
              <p className="text-lg font-semibold text-[var(--text)]">
                {project.org_name}{" "}
                <span className="text-base font-normal text-[var(--text-muted)]">/ {project.manager}</span>
              </p>
              <p className="text-base font-semibold text-[var(--text)]">
                공간 : <span className="font-semibold text-[var(--text)]">{roomsSummaryLine || selectedRoomName}</span>
              </p>
              <p className="text-lg font-bold tracking-tight text-[var(--text)]">
                {periodLabelLine || fallbackPeriodFromProject(project)}
              </p>
            </div>
            <div className="flex min-w-[200px] flex-1 flex-col gap-4 sm:max-w-xl">
              <div className="max-w-md space-y-1.5">
                <div className="flex items-center gap-4">
                  <span className="shrink-0 text-base font-semibold text-[var(--text)]">주차지원</span>
                  <button
                    type="button"
                    title="클릭하여 주차지원 여부 변경"
                    aria-pressed={parseParkingSupport(project.parking_support as unknown) === "yes"}
                    aria-label={(() => {
                      const s = parseParkingSupport(project.parking_support as unknown);
                      if (s === "yes") return "주차지원 함";
                      if (s === "no") return "주차지원 안 함";
                      if (s === "undecided") return "주차지원 미정";
                      return "주차지원 확인 필요";
                    })()}
                    aria-describedby="parking-support-hint"
                    disabled={togglingSupport}
                    onClick={() => void handleToggleParkingSupport()}
                    className={`inline-flex h-auto min-h-10 min-w-[3rem] max-w-[10rem] shrink-0 items-center justify-center rounded-full border px-3 py-2 text-sm font-bold leading-tight transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60 sm:text-base ${parkingSupportUiClass(parseParkingSupport(project.parking_support as unknown))}`}
                  >
                    {parkingSupportShortLabel(parseParkingSupport(project.parking_support as unknown))}
                  </button>
                </div>
                <p id="parking-support-hint" className="text-sm leading-snug text-[var(--text-muted)]">
                  버튼을 눌러 주차지원 여부를 변경할 수 있습니다.
                </p>
              </div>
              <div className="flex w-full min-w-0 items-center gap-3">
                <label
                  htmlFor="parking-remarks"
                  className="shrink-0 text-base font-semibold leading-none text-[var(--text)]"
                >
                  비고
                </label>

                <div className="min-w-0 flex-1">
                  {!remarksEditing ? (
                    (() => {
                      const trimmed = remarksInput.trim();
                      if (!trimmed) return null;
                      return (
                        <p
                          className="line-clamp-3 break-words whitespace-pre-line text-base leading-snug text-[var(--text)]"
                          title={trimmed}
                        >
                          {trimmed}
                        </p>
                      );
                    })()
                  ) : (
                    <textarea
                      id="parking-remarks"
                      value={remarksInput}
                      onChange={(e) => setRemarksInput(e.target.value)}
                      onBlur={() => void saveRemarks()}
                      disabled={remarksSaving}
                      rows={3}
                      className="input min-h-[48px] w-full resize-none px-3 py-2.5 text-base text-[var(--text)] placeholder:text-[var(--text-muted)] disabled:opacity-60"
                      placeholder="비고 없음"
                      autoComplete="off"
                    />
                  )}
                </div>

                <button
                  type="button"
                  disabled={remarksSaving}
                  onClick={() => {
                    if (!project) return;
                    if (remarksEditing) {
                      void (async () => {
                        await saveRemarks();
                        setRemarksEditing(false);
                      })();
                    } else {
                      setRemarksEditing(true);
                    }
                  }}
                  className="btn inline-flex h-10 shrink-0 items-center gap-2 px-3 text-sm"
                >
                  {remarksEditing ? "완료" : "수정"}
                </button>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-4">
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
          방향키로 상하좌우 이동. Tab은 다음칸으로 이동하며, Enter는 새 행을 만든 뒤 그 행으로 이동합니다.{" "}
          <span className="font-medium text-[var(--text)]">조회</span>는 MHP에 4자리 조회,{" "}
          <span className="font-medium text-[var(--text)]">등록</span>은 입력한 종류·수량만큼 MHP에서 순서대로 할인 적용합니다.
        </p>

        <div className="card card-hover overflow-x-auto p-8">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col style={{ width: "5.25rem" }} />
              <col style={{ width: "4.75rem" }} />
              <col style={{ width: "12.25rem" }} />
              <col style={{ width: "6.75rem" }} />
              {TICKET_KEYS.map((k) => (
                <col key={k} style={{ width: "2.85rem" }} />
              ))}
              <col style={{ width: "4.25rem" }} />
              <col style={{ width: "6.5rem" }} />
              <col style={{ width: "2.35rem" }} />
            </colgroup>
            <thead>
              <tr className="text-[var(--text-muted)]">
                <th className="pb-3 font-medium text-[var(--text)]">차량</th>
                <th className="pb-3 text-center font-medium text-[var(--text)]">조회</th>
                <th className="pb-3 text-left font-medium text-[var(--text)]">입차 일시</th>
                <th className="pb-3 font-medium text-[var(--text)]">주차시간</th>
                {TICKET_KEYS.map((k) => (
                  <th key={k} className="px-0.5 pb-3 text-center text-xs font-medium text-[var(--text)]">
                    {TICKET_LABELS[k]}
                  </th>
                ))}
                <th className="pb-3 text-center text-xs font-medium text-[var(--text)]">등록</th>
                <th className="pb-3 pl-1 font-medium text-[var(--text)]">일자</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <Fragment key={index}>
                <tr className="table-row-hover transition-colors">
                  <td className="py-2 pr-3 align-middle">
                    <input
                      ref={(el) => { vehicleRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={row.vehicle_num}
                      onChange={(e) => updateRow(index, "vehicle_num", e.target.value.replace(/\D/g, ""))}
                      onBlur={() => saveVehicleRow(index)}
                      onKeyDown={(e) => onVehicleKeyDown(e, index)}
                      className="input w-full max-w-[5rem] px-2.5 py-2 text-center text-sm font-bold text-[var(--text)]"
                      placeholder="0000"
                    />
                  </td>
                  <td className="py-2 px-3 align-middle">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={mhpLoadingIndex !== null || mhpApplyLoadingIndex !== null}
                        onClick={() => requestMhpLookup(index)}
                        className="btn inline-flex min-w-[3.25rem] shrink-0 items-center justify-center px-2 py-1.5 text-xs disabled:cursor-wait disabled:opacity-60"
                        title="MHP 콘솔에 번호 입력·자동 조회 후 입차 정보 반영(확장 필요)"
                      >
                        {mhpLoadingIndex === index ? "…" : "조회"}
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-1 align-middle">
                    <input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={row.mhp_entry_at ?? ""}
                      placeholder="조회 시"
                      className="input w-full max-w-[12rem] px-2.5 py-2 text-left text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
                    />
                  </td>
                  <td className="py-2 pr-1 align-middle">
                    <input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={row.mhp_parking_duration ?? ""}
                      placeholder="조회 시"
                      className="input w-full max-w-[6.75rem] px-2.5 py-2 text-left text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
                    />
                  </td>
                  {TICKET_KEYS.map((key, colIndex) => (
                    <td key={key} className="px-0.5 py-2 align-middle">
                      <input
                        ref={(el) => {
                          if (!ticketRefs.current[index]) ticketRefs.current[index] = [];
                          ticketRefs.current[index][colIndex] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        value={row[key] === 0 ? "" : row[key]}
                        onChange={(e) => updateRow(index, key, e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => onTicketKeyDown(e, index, colIndex)}
                        className="input-inset w-full min-w-0 px-0.5 py-1.5 text-center text-sm text-[var(--text)]"
                      />
                    </td>
                  ))}
                  <td className="py-2 px-0.5 text-center align-middle">
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={mhpApplyLoadingIndex !== null || mhpLoadingIndex !== null}
                      onClick={() => requestMhpApply(index)}
                      className="btn btn-primary inline-flex w-full max-w-[3.75rem] items-center justify-center px-1.5 py-1.5 text-xs whitespace-nowrap shadow-sm disabled:cursor-wait disabled:opacity-60"
                      title="MHP 콘솔에서 선택한 할인 종류·수량으로 할인 적용(확장 필요)"
                      aria-label="MHP 할인 등록"
                    >
                      {mhpApplyLoadingIndex === index ? "…" : "등록"}
                    </button>
                  </td>
                  <td className="py-2 pl-1 pr-0 text-sm text-[var(--text-muted)]">{row.date || selectedDate}</td>
                  <td className="w-12 py-2 pl-1">
                    {(row.recordId || row.vehicle_num?.trim()) && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => removeRow(index)}
                        className="rounded p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600"
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
                {row.mhp_applied_discounts_summary ? (
                  <tr className="table-row-hover">
                    <td
                      colSpan={
                        4 +
                        TICKET_KEYS.length +
                        3
                      }
                      className="border-t border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
                    >
                      <span className="font-semibold">이미 주차권 등록된 내역이 있습니다.</span>{" "}
                      <span className="opacity-90">{row.mhp_applied_discounts_summary}</span>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
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
