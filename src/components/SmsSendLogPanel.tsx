"use client";

// 솔라피 발송 기록 목록·상태 새로고침
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatManagerPhoneDisplay } from "@/lib/manager-display";
import { formatSmsStatusLabel } from "@/lib/solapi-status";
import {
  filterSmsSendLogs,
  loadSmsSendLogs,
  updateSmsSendLog,
  type SmsCampaign,
  type SmsSendLogEntry,
} from "@/lib/sms-send-log";
import { refreshMessageStatusesViaApi } from "@/lib/send-message-client";

type Props = {
  campaign: SmsCampaign;
  campaignKey: string;
  /** 부모에서 발송 후 증가시키면 목록 갱신 */
  logVersion: number;
  /** 모달 내부용 — 바깥 card 래퍼 생략 */
  embedded?: boolean;
};

function formatSentAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function outcomeBadgeClass(outcome: SmsSendLogEntry["outcome"]): string {
  if (outcome === "delivered") return "bg-emerald-50 text-emerald-800 ring-emerald-200/80";
  if (outcome === "failed") return "bg-red-50 text-red-800 ring-red-200/80";
  return "bg-amber-50 text-amber-900 ring-amber-200/80";
}

export function SmsSendLogPanel({ campaign, campaignKey, logVersion, embedded = false }: Props) {
  const [logs, setLogs] = useState<SmsSendLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(() => {
    setLogs(filterSmsSendLogs(loadSmsSendLogs(), campaign, campaignKey));
  }, [campaign, campaignKey]);

  useEffect(() => {
    reload();
  }, [reload, logVersion]);

  const pendingIds = useMemo(
    () =>
      logs
        .filter((e) => e.outcome === "pending" && e.messageId)
        .map((e) => e.messageId as string),
    [logs]
  );

  const handleRefresh = async () => {
    reload();
    if (pendingIds.length === 0) return;
    setRefreshing(true);
    try {
      const statuses = await refreshMessageStatusesViaApi(pendingIds);
      for (const [messageId, status] of Object.entries(statuses)) {
        const entry = logs.find((e) => e.messageId === messageId);
        if (!entry) continue;
        updateSmsSendLog(entry.id, {
          statusCode: status.statusCode,
          statusMessage: status.statusMessage,
          statusLabel: status.statusLabel,
          outcome: status.outcome,
        });
      }
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "상태 새로고침에 실패했습니다.");
    } finally {
      setRefreshing(false);
    }
  };

  const tableBody = logs.length === 0 ? (
    <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
      아직 발송 기록이 없습니다.
    </p>
  ) : (
    <div className={embedded ? "max-h-[calc(85vh-8rem)] overflow-auto" : "max-h-64 overflow-auto"}>
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-white text-[var(--text-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">시간</th>
            <th className="px-3 py-2 font-medium">담당자</th>
            <th className="px-3 py-2 font-medium">번호</th>
            <th className="px-3 py-2 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t border-[var(--border)]">
              <td className="whitespace-nowrap px-3 py-2 text-[var(--text-muted)]">
                {formatSentAt(log.sentAt)}
              </td>
              <td className="px-3 py-2">
                <p className="font-medium text-[var(--text)]">{log.managerName}</p>
                <p className="text-[var(--text-muted)]">{log.orgName}</p>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-[var(--text)]">
                {formatManagerPhoneDisplay(log.to)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${outcomeBadgeClass(log.outcome)}`}
                  title={
                    log.statusMessage || formatSmsStatusLabel(log.statusCode, log.statusMessage)
                  }
                >
                  {log.statusLabel}
                </span>
                {log.statusMessage && log.outcome === "failed" && (
                  <p className="mt-1 max-w-[12rem] text-[var(--text-muted)]">{log.statusMessage}</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[var(--border)] px-4 py-2">
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "확인 중…" : "상태 새로고침"}
          </button>
        </div>
        {tableBody}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[#F8FAFC] px-4 py-3">
        <div>
          <h4 className="text-sm font-bold text-[var(--text)]">발송 기록</h4>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            솔라피 실제 처리 상태 · 이 기간 {logs.length}건
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "확인 중…" : "상태 새로고침"}
        </button>
      </div>
      {tableBody}
    </div>
  );
}
