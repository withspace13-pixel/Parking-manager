"use client";

// 주차권 등록 화면용 입·출차 시간 → 권종 추천 계산기
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { recommendParkingTickets } from "@/lib/parking-duration-tickets";
import {
  TimePickerInput,
  type TimePickerInputHandle,
  type TimeSegment,
} from "@/components/TimePickerInput";

type Props = {
  /** 조회 성공 시 반영할 입차 HH:mm */
  lookupEntryTime?: string;
  /** 조회할 때마다 증가 — 출차 초기화 + 입차 교체 */
  lookupNonce?: number;
};

export function ParkingDurationCalculator({
  lookupEntryTime = "",
  lookupNonce = 0,
}: Props) {
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const entryRef = useRef<TimePickerInputHandle>(null);
  const exitRef = useRef<TimePickerInputHandle>(null);
  const lastNonceRef = useRef(lookupNonce);

  useEffect(() => {
    if (lookupNonce === 0) return;
    if (lookupNonce === lastNonceRef.current) return;
    lastNonceRef.current = lookupNonce;
    setEntryTime(lookupEntryTime);
    setExitTime("");
    if (lookupEntryTime) {
      window.setTimeout(() => exitRef.current?.focusSegment("hour"), 0);
    }
  }, [lookupNonce, lookupEntryTime]);

  const result = useMemo(() => {
    if (!entryTime || !exitTime) return null;
    return recommendParkingTickets(entryTime, exitTime);
  }, [entryTime, exitTime]);

  const focusExit = (segment: TimeSegment = "hour") => {
    exitRef.current?.focusSegment(segment);
  };

  const focusEntry = (segment: TimeSegment = "hour") => {
    entryRef.current?.focusSegment(segment);
  };

  return (
    <div className="card w-full p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 shrink-0 text-[var(--primary)]" />
        <h3 className="text-sm font-bold text-[var(--text)]">주차 시간 계산기</h3>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
        입차·출차(예정) 시간을 넣으면 여유를 둔 등록 권종을 알려줍니다.
      </p>

      <div className="space-y-3">
        <label className="block text-xs font-medium text-[var(--text-muted)]">
          입차 시간
          <TimePickerInput
            ref={entryRef}
            value={entryTime}
            onChange={setEntryTime}
            onComplete={() => focusExit("hour")}
            onNavigate={(direction, segment) => {
              if (direction === "right" || direction === "down") {
                focusExit(direction === "right" ? "hour" : segment);
              }
            }}
          />
        </label>
        <label className="block text-xs font-medium text-[var(--text-muted)]">
          출차 시간 (예정)
          <TimePickerInput
            ref={exitRef}
            value={exitTime}
            onChange={setExitTime}
            onNavigate={(direction, segment) => {
              if (direction === "left") {
                focusEntry("minute");
                return;
              }
              if (direction === "up") {
                focusEntry(segment);
              }
            }}
          />
        </label>
      </div>

      <div className="mt-5 space-y-2 rounded-lg border border-[var(--border)] bg-[#F8FAFC] px-3 py-3">
        {!result ? (
          <p className="text-sm text-[var(--text-muted)]">입차·출차 시간을 입력해 주세요.</p>
        ) : "error" in result ? (
          <p className="text-sm text-amber-800">{result.error}</p>
        ) : (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                예상 주차 시간
              </p>
              <p className="mt-0.5 text-base font-semibold text-[var(--text)]">
                {result.expectedLabel}
              </p>
            </div>
            <div className="border-t border-[var(--border)] pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                등록 필요 시간
              </p>
              <p className="mt-0.5 text-base font-bold text-[var(--primary)]">
                {result.ticketsLabel}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
