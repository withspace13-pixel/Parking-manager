"use client";

// 솔라피 발송 기록 모달
import { X } from "lucide-react";
import { SmsSendLogPanel } from "@/components/SmsSendLogPanel";
import type { SmsCampaign } from "@/lib/sms-send-log";

type Props = {
  open: boolean;
  onClose: () => void;
  campaign: SmsCampaign;
  campaignKey: string;
  logVersion: number;
};

export function SmsSendLogModal({ open, onClose, campaign, campaignKey, logVersion }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sms-send-log-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[#F8FAFC] px-4 py-3">
          <div>
            <h3 id="sms-send-log-title" className="text-sm font-bold text-[var(--text)]">
              발송 기록
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              솔라피 실제 처리 상태 (담당자·번호·시간)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-white hover:text-[var(--text)]"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SmsSendLogPanel
            embedded
            campaign={campaign}
            campaignKey={campaignKey}
            logVersion={logVersion}
          />
        </div>
      </div>
    </div>
  );
}
