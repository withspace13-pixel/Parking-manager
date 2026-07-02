// 솔라피 발송 처리 중(pending) 건 백그라운드 상태 추적
import { supabase } from "@/lib/supabase";
import { refreshMessageStatusesViaApi } from "@/lib/send-message-client";
import { addRecipientSentId, fetchRecipientSentIds } from "@/lib/recipient-sent-storage";
import {
  fetchSmsSendLogs,
  getSmsSendLogsCache,
  mergeSmsSendLogsIntoCache,
  updateSmsSendLog,
  type SmsCampaign,
} from "@/lib/sms-send-log";

const POLL_MS = 10_000;
const POLL_MAX_MS = 60_000;

type TrackerListener = () => void;

const listeners = new Set<TrackerListener>();
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let visibilityBound = false;
let pollingStartedAt = 0;

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
  pollingStartedAt = Date.now();
  timer = setInterval(() => void tick(), POLL_MS);
}

function stopTimerIfIdle() {
  const hasPending = getSmsSendLogsCache().some((e) => e.outcome === "pending" && e.messageId);
  if (!hasPending && timer) {
    clearInterval(timer);
    timer = null;
    pollingStartedAt = 0;
  }
}

async function tick() {
  if (ticking) return;

  const fetchedPending = await fetchSmsSendLogs(supabase, { pendingOnly: true, limit: 30 });
  mergeSmsSendLogsIntoCache(fetchedPending);
  const pending = getSmsSendLogsCache().filter((e) => e.outcome === "pending" && e.messageId);
  if (pending.length === 0) {
    stopTimerIfIdle();
    return;
  }
  if (pollingStartedAt && Date.now() - pollingStartedAt > POLL_MAX_MS) {
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

      await updateSmsSendLog(supabase, entry.id, {
        statusCode: status.statusCode,
        statusMessage: status.statusMessage,
        statusLabel: status.statusLabel,
        outcome: status.outcome,
      });

      if (status.outcome === "delivered") {
        await addRecipientSentId(
          supabase,
          entry.campaign,
          entry.campaignKey,
          entry.recipientId
        );
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

export async function ensureSmsPendingTracker(): Promise<void> {
  const fetchedPending = await fetchSmsSendLogs(supabase, { pendingOnly: true, limit: 30 });
  mergeSmsSendLogsIntoCache(fetchedPending);
  const hasPending = getSmsSendLogsCache().some((e) => e.outcome === "pending" && e.messageId);
  if (hasPending) {
    ensureTimer();
    void tick();
  }
}

export function subscribeSmsPendingTracker(listener: TrackerListener): () => void {
  listeners.add(listener);
  void ensureSmsPendingTracker();
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingRecipientIds(campaign: SmsCampaign, campaignKey: string): Set<string> {
  return new Set(
    getSmsSendLogsCache()
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
  return getSmsSendLogsCache().filter(
    (e) => e.campaign === campaign && e.campaignKey === campaignKey
  ).length;
}

export async function syncRecipientSentIds(
  campaign: SmsCampaign,
  campaignKey: string
): Promise<Set<string>> {
  return fetchRecipientSentIds(supabase, campaign, campaignKey);
}
