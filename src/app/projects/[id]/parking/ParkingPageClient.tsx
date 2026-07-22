"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Calculator, Home, Plus, Trash2 } from "lucide-react";
import { MhpStoreCreditBadge } from "@/components/MhpStoreCreditBadge";
import { MhpExtensionStatusBadge } from "@/components/MhpExtensionStatusBadge";
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
import { formatMonthDaySlash } from "@/lib/schedule-dates";
import { ManagerNameWithPhone } from "@/lib/manager-display";
import {
  computePresetupDateYmd,
  findPresetupDateYmd,
  getFirstEventStartYmdFromRooms,
  isPresetupRoomName,
  periodLabelMonthDayFromRooms,
  PRESETUP_ROOM_NAME,
  type ProjectRoomDate,
} from "@/lib/presetup";
import {
  isMhpApplyResponse,
  isMhpCancelAllResponse,
  isMhpLookupResponse,
  isMhpSyncResponse,
  postMhpApplyRequest,
  postMhpCancelAllRequest,
  postMhpLookupRequest,
  postMhpSyncRequest,
  splitMhpParkingDisplayText,
} from "@/lib/mhp-extension";
import { formatMhpBridgeAlert } from "@/lib/mhp-bridge-errors";
import { useMhpStoreCredit } from "@/lib/use-mhp-store-credit";
import { useMhpExtensionStatus } from "@/lib/use-mhp-extension-status";

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

/** 로컬 타임존 기준 오늘 (YYYY-MM-DD) — UTC toISOString 사용 금지 */
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  /** 앱 수량과 실제 MHP 수량이 다를 때 표시 */
  mhp_sync_warning?: string;
};

const TICKET_KEYS = ["all_day_cnt", "2h_cnt", "1h_cnt", "30m_cnt"] as const;
type TicketKey = (typeof TICKET_KEYS)[number];
type TicketCounts = Record<TicketKey, number>;
const TICKET_LABELS: Record<string, string> = {
  all_day_cnt: "종일",
  "2h_cnt": "2h",
  "1h_cnt": "1h",
  "30m_cnt": "30m",
};

const DEFAULT_EMPTY_ROW_COUNT = 5;

function emptyParkingRows(date: string): RowState[] {
  return Array.from({ length: DEFAULT_EMPTY_ROW_COUNT }, () => ({
    vehicle_num: "",
    date,
    all_day_cnt: 0,
    "2h_cnt": 0,
    "1h_cnt": 0,
    "30m_cnt": 0,
  }));
}

/** 저장된 행 + 빈 행을 합쳐 최소 `DEFAULT_EMPTY_ROW_COUNT`줄 유지 */
function padRowsToMinEmpty(list: RowState[], date: string): RowState[] {
  if (list.length >= DEFAULT_EMPTY_ROW_COUNT) return list;
  return [...list, ...emptyParkingRows(date).slice(0, DEFAULT_EMPTY_ROW_COUNT - list.length)];
}

function getTicketCounts(row: Pick<RowState, TicketKey>): TicketCounts {
  return {
    all_day_cnt: row.all_day_cnt ?? 0,
    "2h_cnt": row["2h_cnt"] ?? 0,
    "1h_cnt": row["1h_cnt"] ?? 0,
    "30m_cnt": row["30m_cnt"] ?? 0,
  };
}

function formatTicketCounts(counts: TicketCounts): string {
  return TICKET_KEYS.map((key) => `${TICKET_LABELS[key]} ${counts[key] ?? 0}매`).join(", ");
}

function buildMhpSyncWarning(expected: TicketCounts, actual: TicketCounts): string {
  return `앱 수량(${formatTicketCounts(expected)})과 MHP 실제 수량(${formatTicketCounts(actual)})이 다릅니다.`;
}

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
  const [periodLabelLine, setPeriodLabelLine] = useState("");
  const [projectRooms, setProjectRooms] = useState<ProjectRoomDate[]>([]);
  const [dateList, setDateList] = useState<string[]>([]);
  const [presetupSaving, setPresetupSaving] = useState(false);
  const [rows, setRows] = useState<RowState[]>([]);
  const vehicleRefs = useRef<(HTMLInputElement | null)[]>([]);
  const ticketRefs = useRef<(HTMLInputElement | null)[][]>([]);
  const mhpPendingRef = useRef<{ requestId: string; index: number; vehicleNum: string } | null>(null);
  const mhpApplyPendingRef = useRef<{ requestId: string; index: number; kind: "sync" | "cancel_all" } | null>(null);
  const [mhpLoadingIndex, setMhpLoadingIndex] = useState<number | null>(null);
  const [mhpApplyLoadingIndex, setMhpApplyLoadingIndex] = useState<number | null>(null);
  const mhpStoreCredit = useMhpStoreCredit();
  const mhpExtensionStatus = useMhpExtensionStatus();

  const focusFirstTicketInput = useCallback((index: number) => {
    window.setTimeout(() => {
      ticketRefs.current[index]?.[0]?.focus();
    }, 0);
  }, []);

  const focusNextVehicleInput = useCallback(
    (index: number) => {
      const nextIndex = index + 1;
      setRows((prev) => {
        if (nextIndex < prev.length) {
          window.setTimeout(() => {
            vehicleRefs.current[nextIndex]?.focus();
          }, 0);
          return prev;
        }
        window.setTimeout(() => {
          vehicleRefs.current[nextIndex]?.focus();
        }, 0);
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
    },
    [selectedDate]
  );

  useEffect(() => {
    if (!dateList.length) {
      setSelectedDate("");
      return;
    }
    const today = todayString();
    // 초기 진입은 항상 로컬 오늘. 행사 첫날·사전세팅으로 떨어지지 않음.
    if (!selectedDate) {
      setSelectedDate(today);
      return;
    }
    // 사용자가 고른 날(목록에 있음) 또는 오늘(목록 밖이어도)은 유지
    if (dateList.includes(selectedDate) || selectedDate === today) return;
    setSelectedDate(today);
  }, [dateList, selectedDate]);

  const dateOptions = useMemo(() => {
    if (!selectedDate || dateList.includes(selectedDate)) return dateList;
    return [...dateList, selectedDate].sort();
  }, [dateList, selectedDate]);

  const applyFromRoomRows = useCallback(
    (rows: { date: string; room_name: string }[]) => {
      if (!project) return;
      const normalized: ProjectRoomDate[] = rows.map((r) => ({
        date: String(r.date).slice(0, 10),
        room_name: r.room_name ?? "",
      }));
      setProjectRooms(normalized);
      const sortedDates = Array.from(new Set(normalized.map((r) => r.date)))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
      setDateList(
        sortedDates.length > 0
          ? sortedDates
          : project.start_date && project.end_date
            ? getDateRange(project.start_date, project.end_date)
            : []
      );
      const period =
        sortedDates.length > 0
          ? periodLabelMonthDayFromRooms(normalized, sortedDates)
          : fallbackPeriodFromProject(project);
      setPeriodLabelLine(period);
    },
    [project]
  );

  useEffect(() => {
    if (!selectedDate) {
      setSelectedRoomName("미지정");
      return;
    }
    const r = projectRooms.find((x) => x.date === selectedDate);
    setSelectedRoomName(r?.room_name?.trim() || "미지정");
  }, [selectedDate, projectRooms]);

  useEffect(() => {
    if (!projectId || !project) return;

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
  }, [projectId, project, devStore.data, applyFromRoomRows]);

  const handlePresetupRegistration = useCallback(async () => {
    const existing = findPresetupDateYmd(projectRooms);
    if (existing) {
      setSelectedDate(existing);
      return;
    }
    const firstStart = getFirstEventStartYmdFromRooms(projectRooms);
    if (!firstStart) {
      alert("행사 일자가 없어 사전세팅을 추가할 수 없습니다.");
      return;
    }
    const presetupDate = computePresetupDateYmd(firstStart);
    setPresetupSaving(true);
    try {
      if (isDevMode()) {
        const current = devStore.getRooms(projectId).map((r) => ({
          date: String(r.date).slice(0, 10),
          room_name: r.room_name ?? "",
        }));
        devStore.saveRooms(projectId, [
          ...current,
          { date: presetupDate, room_name: PRESETUP_ROOM_NAME },
        ]);
        applyFromRoomRows(devStore.getRooms(projectId));
      } else {
        const { error } = await supabase.from("project_rooms").insert({
          project_id: projectId,
          date: presetupDate,
          room_name: PRESETUP_ROOM_NAME,
        });
        if (error) throw error;
        const { data } = await supabase
          .from("project_rooms")
          .select("date, room_name")
          .eq("project_id", projectId)
          .order("date");
        applyFromRoomRows(data ?? []);
      }
      setSelectedDate(presetupDate);
    } catch (e) {
      console.error(e);
      alert("사전세팅 일자를 추가하지 못했습니다.");
    } finally {
      setPresetupSaving(false);
    }
  }, [projectRooms, projectId, devStore, applyFromRoomRows]);

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
        setRows(padRowsToMinEmpty(list, date));
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
        setRows(padRowsToMinEmpty(list, date));
      })();
    },
    [projectId, devStore]
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
      void (async () => {
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
        const counts = e.data.appliedDiscountCounts ?? null;
        let savedRow: RowState | null = null;
        setRows((prev) => {
          const row = prev[rowIndex];
          if (!row || !rowVehicleOk(row.vehicle_num)) return prev;
          const nextRow: RowState = {
            ...row,
            mhp_entry_at: entryAt,
            mhp_parking_duration: duration,
            mhp_applied_discounts_summary: summary || undefined,
            mhp_sync_warning: undefined,
            ...(counts
              ? {
                  all_day_cnt: counts.all_day_cnt ?? row.all_day_cnt,
                  "2h_cnt": counts["2h_cnt"] ?? row["2h_cnt"],
                  "1h_cnt": counts["1h_cnt"] ?? row["1h_cnt"],
                  "30m_cnt": counts["30m_cnt"] ?? row["30m_cnt"],
                }
              : {}),
          };
          savedRow = nextRow;
          return prev.map((r, i) => (i === rowIndex ? nextRow : r));
        });
        if (savedRow) saveRow(savedRow, rowIndex);
        focusFirstTicketInput(rowIndex);
        if (summary) alert(`이미 등록된 할인 내역이 있어요.\n${summary}\n\n원하시면 표 수량을 바꾼 뒤 “등록”을 누르면 MHP에 맞게 동기화됩니다.`);
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
                  mhp_sync_warning: undefined,
                }
              : r
          );
        });
        alert(formatMhpBridgeAlert(e.data.error?.trim() || "MHP 조회에 실패했습니다."));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [focusFirstTicketInput, saveRow]);

  useEffect(() => {
    const onApplyMsg = (e: MessageEvent) => {
      if (
        e.source !== window ||
        (!isMhpSyncResponse(e.data) && !isMhpCancelAllResponse(e.data) && !isMhpApplyResponse(e.data))
      )
        return;
      const pending = mhpApplyPendingRef.current;
      if (!pending || e.data.requestId !== pending.requestId) return;
      const kind = pending.kind;
      const currentRow = rows[pending.index];
      const expectedCounts =
        kind === "cancel_all"
          ? { all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0 }
          : currentRow
            ? getTicketCounts(currentRow)
            : { all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0 };
      const actualCounts =
        "actualCounts" in e.data && e.data.actualCounts
          ? {
              all_day_cnt: Number(e.data.actualCounts.all_day_cnt) || 0,
              "2h_cnt": Number(e.data.actualCounts["2h_cnt"]) || 0,
              "1h_cnt": Number(e.data.actualCounts["1h_cnt"]) || 0,
              "30m_cnt": Number(e.data.actualCounts["30m_cnt"]) || 0,
            }
          : null;
      mhpApplyPendingRef.current = null;
      setMhpApplyLoadingIndex(null);
      if (e.data.ok) {
        const warning =
          actualCounts &&
          TICKET_KEYS.some((key) => expectedCounts[key] !== actualCounts[key])
            ? buildMhpSyncWarning(expectedCounts, actualCounts)
            : undefined;
        let savedRow: RowState | null = null;
        setRows((prev) => {
          const row = prev[pending.index];
          if (!row) return prev;
          const persistedCounts =
            kind === "cancel_all"
              ? { all_day_cnt: 0, "2h_cnt": 0, "1h_cnt": 0, "30m_cnt": 0 }
              : actualCounts ?? getTicketCounts(row);
          const nextRow: RowState = {
            ...row,
            ...persistedCounts,
            ...(kind === "cancel_all" ? { mhp_applied_discounts_summary: undefined } : null),
            mhp_sync_warning: warning,
          };
          savedRow = nextRow;
          return prev.map((r, i) => (i === pending.index ? nextRow : r));
        });
        if (savedRow) saveRow(savedRow, pending.index);
        const successText = (e.data.detail || (kind === "cancel_all" ? "할인 내역을 취소했어요." : "MHP와 수량을 맞췄어요.")).trim();
        alert(warning ? `${successText}\n\n경고: ${warning}` : successText);
        mhpStoreCredit.refresh();
        focusNextVehicleInput(pending.index);
      } else {
        alert(
          formatMhpBridgeAlert(
            e.data.error?.trim() ||
              (kind === "cancel_all" ? "취소에 실패했어요. MHP 콘솔을 확인해 주세요." : "동기화에 실패했어요. MHP 콘솔을 확인해 주세요.")
          )
        );
      }
    };
    window.addEventListener("message", onApplyMsg);
    return () => window.removeEventListener("message", onApplyMsg);
  }, [focusNextVehicleInput, mhpStoreCredit.refresh, rows, saveRow]);

  const requestMhpSync = useCallback(
    (index: number) => {
      const row = rows[index];
      const v = String(row?.vehicle_num ?? "").trim().replace(/\D/g, "").slice(0, 4);
      if (v.length !== 4) {
        alert("차량 번호 4자리를 입력한 뒤 등록하세요.");
        return;
      }
      if (!(row?.mhp_entry_at ?? "").trim()) {
        alert("먼저 조회를 눌러 MHP에서 차량을 불러온 뒤 등록(동기화)하세요.");
        return;
      }
      const ad = row?.all_day_cnt ?? 0;
      const h2 = row?.["2h_cnt"] ?? 0;
      const h1 = row?.["1h_cnt"] ?? 0;
      const m30 = row?.["30m_cnt"] ?? 0;
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `mhp-apply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      mhpApplyPendingRef.current = { requestId, index, kind: "sync" };
      setMhpApplyLoadingIndex(index);
      postMhpSyncRequest(requestId, v, {
        all_day_cnt: ad,
        "2h_cnt": h2,
        "1h_cnt": h1,
        "30m_cnt": m30,
      });
      const syncTimeoutMs = 45000;
      window.setTimeout(() => {
        if (mhpApplyPendingRef.current?.requestId !== requestId) return;
        mhpApplyPendingRef.current = null;
        setMhpApplyLoadingIndex((cur) => (cur === index ? null : cur));
        alert(formatMhpBridgeAlert("응답이 없습니다. 확장 프로그램과 MHP 탭을 확인하세요."));
      }, syncTimeoutMs);
    },
    [rows]
  );

  const requestMhpCancelAll = useCallback(
    (index: number) => {
      const row = rows[index];
      const v = String(row?.vehicle_num ?? "").trim().replace(/\D/g, "").slice(0, 4);
      if (v.length !== 4) {
        alert("차량 번호 4자리를 입력한 뒤 취소하세요.");
        return;
      }
      if (!(row?.mhp_entry_at ?? "").trim()) {
        alert("먼저 조회를 눌러 MHP에서 차량을 불러온 뒤 취소하세요.");
        return;
      }
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `mhp-cancel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      mhpApplyPendingRef.current = { requestId, index, kind: "cancel_all" };
      setMhpApplyLoadingIndex(index);
      postMhpCancelAllRequest(requestId, v);
      window.setTimeout(() => {
        if (mhpApplyPendingRef.current?.requestId !== requestId) return;
        mhpApplyPendingRef.current = null;
        setMhpApplyLoadingIndex((cur) => (cur === index ? null : cur));
        alert(formatMhpBridgeAlert("응답이 없습니다. 확장 프로그램과 MHP 탭을 확인하세요."));
      }, 45000);
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
                mhp_sync_warning: undefined,
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
        alert(formatMhpBridgeAlert("응답이 없습니다. 확장 프로그램 설치·새로고침과 MHP 콘솔 탭을 확인하세요."));
      }, 32000);
    },
    [rows]
  );

  const updateRow = useCallback(
    (index: number, field: keyof RowState, value: string | number) => {
      setRows((prev) => {
        const next = [...prev];
        const r = { ...next[index] };
        if (field === "vehicle_num") {
          r.vehicle_num = String(value).replace(/\D/g, "").slice(0, 4);
          r.mhp_sync_warning = undefined;
        } else if (field === "all_day_cnt" || field === "2h_cnt" || field === "1h_cnt" || field === "30m_cnt") {
          r[field] = Math.max(0, parseInt(String(value), 10) || 0);
          r.mhp_sync_warning = undefined;
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
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <MhpExtensionStatusBadge
                status={mhpExtensionStatus.status}
                onRefresh={mhpExtensionStatus.refresh}
                missingHint={mhpExtensionStatus.missingHint}
                outdatedHint={mhpExtensionStatus.outdatedHint}
              />
              <MhpStoreCreditBadge
                display={mhpStoreCredit.display}
                error={mhpStoreCredit.error}
                loading={mhpStoreCredit.loading}
                onRefresh={mhpStoreCredit.refresh}
              />
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
                <span className="text-base">
                  <ManagerNameWithPhone
                    manager={project.manager}
                    managerPhone={project.manager_phone}
                    prefix="/ "
                    phoneClassName="font-normal text-[var(--text-muted)]"
                  />
                </span>
              </p>
              <p className="text-base font-semibold text-[var(--text)]">
                공간 : <span className="font-semibold text-[var(--text)]">{selectedRoomName}</span>
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
          <div className="flex shrink-0 flex-col items-end gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-sm font-medium text-[var(--text)]">일자</label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="input min-w-[148px] px-3 py-2.5 text-sm text-[var(--text)]"
              >
                {dateOptions.map((d) => {
                  const room = projectRooms.find((r) => r.date === d);
                  const label = isPresetupRoomName(room?.room_name) ? `${d} (사전세팅)` : d;
                  return (
                    <option key={d} value={d}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:min-w-[148px]">
              <Link
                href={`/projects/${projectId}/settlement`}
                className="btn btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm"
              >
                <Calculator className="h-4 w-4" />
                정산 보기
              </Link>
              <button
                type="button"
                disabled={presetupSaving}
                onClick={() => void handlePresetupRegistration()}
                className="btn inline-flex items-center justify-center px-4 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60"
              >
                {presetupSaving ? "추가 중…" : "사전세팅 차량 등록"}
              </button>
            </div>
          </div>
        </div>

        <p className="mb-4 text-xs text-[var(--text-muted)]">
          방향키로 상하좌우 이동. Tab은 다음칸으로 이동하며, Enter는 새 행을 만든 뒤 그 행으로 이동합니다.{" "}
          <span className="font-medium text-[var(--text)]">조회</span>는 MHP에 4자리 조회,{" "}
          <span className="font-medium text-[var(--text)]">등록</span>은 입력한 종류·수량만큼 MHP에서 순서대로 할인 적용합니다. 조회가 성공하면 첫 수량 칸으로 이동하고, 등록/취소가 끝나면 다음 차량 칸으로 이동합니다.
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
              <col style={{ width: "4.25rem" }} />
              <col style={{ width: "7.25rem" }} />
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
                <th className="pb-3 text-center text-xs font-medium text-[var(--text)]">취소</th>
                <th className="pb-3 pr-2 text-right font-medium text-[var(--text)]">일자</th>
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
                      onClick={() => requestMhpSync(index)}
                      className="btn btn-primary inline-flex w-full max-w-[3.75rem] items-center justify-center px-1.5 py-1.5 text-xs whitespace-nowrap shadow-sm disabled:cursor-wait disabled:opacity-60"
                      title="앱 표 수량대로 MHP를 취소/추가하여 동기화(확장 필요)"
                      aria-label="MHP 할인 동기화"
                    >
                      {mhpApplyLoadingIndex === index ? "…" : "등록"}
                    </button>
                  </td>
                  <td className="py-2 px-0.5 text-center align-middle">
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={mhpApplyLoadingIndex !== null || mhpLoadingIndex !== null}
                      onClick={() => requestMhpCancelAll(index)}
                      className="btn inline-flex w-full max-w-[3.75rem] items-center justify-center px-1.5 py-1.5 text-xs whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
                      title="MHP에 등록된 미사용 할인 전체 취소(확장 필요)"
                      aria-label="MHP 전체 취소"
                    >
                      취소
                    </button>
                  </td>
                  <td className="py-2 pr-2 text-right text-sm text-[var(--text-muted)]">{row.date || selectedDate}</td>
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
                        4
                      }
                      className="border-t border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
                    >
                      <span className="font-semibold">이미 주차권 등록된 내역이 있습니다.</span>{" "}
                      <span className="opacity-90">{row.mhp_applied_discounts_summary}</span>
                    </td>
                  </tr>
                ) : null}
                {row.mhp_sync_warning ? (
                  <tr className="table-row-hover">
                    <td
                      colSpan={
                        4 +
                        TICKET_KEYS.length +
                        4
                      }
                      className="border-t border-red-200/80 bg-red-50/90 px-3 py-2 text-xs leading-relaxed text-red-900"
                    >
                      <span className="font-semibold">MHP 수량 확인 필요.</span>{" "}
                      <span className="opacity-90">{row.mhp_sync_warning}</span>
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
