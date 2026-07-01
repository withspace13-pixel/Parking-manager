"use client";

// 솔라피 충전 잔액 표시
import { Coins, RefreshCw } from "lucide-react";

type Props = {
  display: string | null;
  error: string | null;
  loading: boolean;
  configured: boolean | null;
  onRefresh: () => void;
};

export function SolapiBalanceBadge({ display, error, loading, configured, onRefresh }: Props) {
  const value =
    configured === false
      ? "미설정"
      : loading && !display
        ? "…"
        : (display ?? "—");

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-2.5 py-1.5 shadow-sm">
      <Coins className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
      <div className="min-w-0 text-right">
        <p className="text-xs font-medium text-[var(--text-muted)]">솔라피 잔액</p>
        <p
          className="text-sm font-bold tabular-nums text-[var(--text)]"
          title={error && !display ? error : undefined}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRefresh()}
        disabled={loading || configured === false}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-transparent p-1 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
        title="솔라피 잔액 다시 조회"
        aria-label="솔라피 잔액 새로고침"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
