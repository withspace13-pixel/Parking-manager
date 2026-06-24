// MHP 브리지 확장 설치·버전 상태 배지
"use client";

import { Puzzle, RefreshCw } from "lucide-react";
import type { MhpExtensionStatus } from "@/lib/use-mhp-extension-status";
import { MHP_EXTENSION_REQUIRED_VERSION } from "@/lib/mhp-extension-version";

type MhpExtensionStatusBadgeProps = {
  status: MhpExtensionStatus;
  loading?: boolean;
  onRefresh: () => void;
  missingHint: string;
  outdatedHint: string;
};

function statusPresentation(
  status: MhpExtensionStatus,
  missingHint: string,
  outdatedHint: string
): { line: string; detail: string; tone: "ok" | "warn" | "bad" | "muted" } {
  switch (status.state) {
    case "checking":
      return { line: "확장 확인 중…", detail: "", tone: "muted" };
    case "connected":
      return {
        line: `확장 연결됨 · v${status.version}`,
        detail: "MHP 조회·등록에 확장이 필요합니다.",
        tone: "ok",
      };
    case "missing":
      return {
        line: "확장 없음",
        detail: missingHint,
        tone: "bad",
      };
    case "outdated":
      return {
        line: `확장 v${status.version} → v${status.requiredVersion} 필요`,
        detail: outdatedHint,
        tone: "warn",
      };
    default:
      return { line: "확장 상태 불명", detail: "", tone: "muted" };
  }
}

const TONE_CLASS: Record<ReturnType<typeof statusPresentation>["tone"], string> = {
  ok: "border-emerald-200 bg-emerald-50/80",
  warn: "border-amber-200 bg-amber-50/90",
  bad: "border-red-200 bg-red-50/90",
  muted: "border-[var(--border)] bg-white",
};

export function MhpExtensionStatusBadge({
  status,
  loading = false,
  onRefresh,
  missingHint,
  outdatedHint,
}: MhpExtensionStatusBadgeProps) {
  const { line, detail, tone } = statusPresentation(status, missingHint, outdatedHint);
  const isChecking = status.state === "checking" || loading;

  return (
    <div
      className={`flex max-w-[20rem] items-center gap-2 rounded-2xl border px-3 py-2 shadow-sm sm:px-4 sm:py-2.5 ${TONE_CLASS[tone]}`}
      title={detail || `필요 버전 v${MHP_EXTENSION_REQUIRED_VERSION}`}
    >
      <Puzzle className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
      <div className="min-w-0 text-right">
        <p className="text-sm font-semibold tracking-tight text-[var(--text-muted)] sm:text-base">MHP 확장</p>
        <p className="truncate text-sm font-bold text-[var(--text)] sm:text-base">{line}</p>
      </div>
      <button
        type="button"
        onClick={() => onRefresh()}
        disabled={isChecking}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent p-1.5 text-[var(--text-muted)] hover:bg-white/70 hover:text-[var(--text)] disabled:cursor-wait disabled:opacity-50"
        title="확장 연결 상태 다시 확인"
        aria-label="확장 상태 새로고침"
      >
        <RefreshCw className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
