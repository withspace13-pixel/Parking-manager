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
      return { line: "확인 중…", detail: "", tone: "muted" };
    case "connected":
      return {
        line: `v${status.version}`,
        detail: "MHP 조회·등록에 확장이 필요합니다.",
        tone: "ok",
      };
    case "missing":
      return {
        line: "없음",
        detail: missingHint,
        tone: "bad",
      };
    case "outdated":
      return {
        line: `v${status.version} → v${status.requiredVersion}`,
        detail: outdatedHint,
        tone: "warn",
      };
    default:
      return { line: "—", detail: "", tone: "muted" };
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
      className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 shadow-sm ${TONE_CLASS[tone]}`}
      title={detail || `필요 버전 v${MHP_EXTENSION_REQUIRED_VERSION}`}
    >
      <Puzzle className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-medium leading-none text-[var(--text-muted)]">MHP 확장</p>
        <p className="truncate text-xs font-semibold leading-tight text-[var(--text)]">{line}</p>
      </div>
      <button
        type="button"
        onClick={() => onRefresh()}
        disabled={isChecking}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-transparent p-0.5 text-[var(--text-muted)] hover:bg-white/70 hover:text-[var(--text)] disabled:cursor-wait disabled:opacity-50"
        title="확장 연결 상태 다시 확인"
        aria-label="확장 상태 새로고침"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
