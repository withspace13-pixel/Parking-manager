// MHP 스토어 크레딧 잔액 표시(대시보드·주차권 등록 공통)
"use client";

import { RefreshCw, Wallet } from "lucide-react";

type MhpStoreCreditBadgeProps = {
  display: string | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
};

export function MhpStoreCreditBadge({ display, error, loading, onRefresh }: MhpStoreCreditBadgeProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-2.5 py-1.5 shadow-sm">
      <Wallet className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
      <div className="min-w-0 text-right">
        <p className="text-xs font-medium text-[var(--text-muted)]">MHP 스토어 크레딧</p>
        <p
          className="text-sm font-bold tabular-nums text-[var(--text)]"
          title={error && !display ? error : undefined}
        >
          {loading && !display ? "…" : (display ?? "—")}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRefresh()}
        disabled={loading}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-transparent p-1 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)] disabled:cursor-wait disabled:opacity-50"
        title="크레딧 다시 읽기 (MHP 탭 열림 필요)"
        aria-label="스토어 크레딧 새로고침"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
