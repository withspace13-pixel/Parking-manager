// 솔라피 발송 처리 중(pending) 건 백그라운드 상태 추적 (탭·창 전환 후에도 유지)

import { refreshMessageStatusesViaApi } from "@/lib/send-message-client";
import { addRecipientSentId, loadRecipientSentIds } from "@/lib/recipient-sent-storage";
import {
  loadSmsSendLogs,
  updateSmsSendLog,
  type SmsCampaign,
} from "@/lib/sms-send-log";

const POLL_MS = 2000;

type TrackerListener = () => void;

const listeners = new Set<TrackerListener>();
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let visibilityBound = false;

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void tick();
    }
  });
}

function ensureTimer() {
  if (timer) return;
  bindVisibility();
  timer = setInterval(() => void tick(), POLL_MS);
}

function stopTimerIfIdle() {
  const hasPending = loadSmsSendLogs().some((e) => e.outcome === "pending" && e.messageId);
  if (!hasPending && timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick() {
  if (ticking) return;

  const pending = loadSmsSendLogs().filter((e) => e.outcome === "pending" && e.messageId);
  if (pending.length === 0) {
    stopTimerIfIdle();
    return;
  }

  ticking = true;
  try {
    const messageIds = pending.map((e) => e.messageId as string);
    const statuses = await refreshMessageStatusesViaApi(messageIds);
    let changed = false;

    for (const entry of pending) {
      const messageId = entry.messageId as string;
      const status = statuses[messageId];
      if (!status || status.outcome === "pending") continue;

      updateSmsSendLog(entry.id, {
        statusCode: status.statusCode,
        statusMessage: status.statusMessage,
        statusLabel: status.statusLabel,
        outcome: status.outcome,
      });

      if (status.outcome === "delivered") {
        addRecipientSentId(entry.campaign, entry.campaignKey, entry.recipientId);
      }

      changed = true;
    }

    if (changed) notifyListeners();
  } catch {
    /* 네트워크 오류 시 다음 주기에 재시도 */
  } finally {
    ticking = false;
    stopTimerIfIdle();
  }
}

/** pending 건이 있으면 백그라운드 폴링 시작 */
export function ensureSmsPendingTracker(): void {
  const hasPending = loadSmsSendLogs().some((e) => e.outcome === "pending" && e.messageId);
  if (hasPending) {
    ensureTimer();
    void tick();
  }
}

/** UI 갱신 구독 (발송 완료·로그 변경 시) */
export function subscribeSmsPendingTracker(listener: TrackerListener): () => void {
  listeners.add(listener);
  ensureSmsPendingTracker();
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingRecipientIds(campaign: SmsCampaign, campaignKey: string): Set<string> {
  return new Set(
    loadSmsSendLogs()
      .filter(
        (e) =>
          e.campaign === campaign &&
          e.campaignKey === campaignKey &&
          e.outcome === "pending" &&
          Boolean(e.messageId)
      )
      .map((e) => e.recipientId)
  );
}

export function countCampaignSmsLogs(campaign: SmsCampaign, campaignKey: string): number {
  return loadSmsSendLogs().filter(
    (e) => e.campaign === campaign && e.campaignKey === campaignKey
  ).length;
}

/** 트래커가 갱신한 발송 완료 목록을 패널 state에 반영 */
export function syncRecipientSentIds(campaign: SmsCampaign, campaignKey: string): Set<string> {
  return loadRecipientSentIds(campaign, campaignKey);
}
