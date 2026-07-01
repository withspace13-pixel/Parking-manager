// 솔라피 pending 추적 구독 — 탭 전환 후 복귀 시 발송 상태·로그 동기화
import { useEffect, useRef } from "react";
import type { SmsCampaign } from "@/lib/sms-send-log";
import { refreshSmsSendLogsCache } from "@/lib/sms-send-log";
import { supabase } from "@/lib/supabase";
import {
  ensureSmsPendingTracker,
  getPendingRecipientIds,
  subscribeSmsPendingTracker,
  syncRecipientSentIds,
} from "@/lib/sms-pending-tracker";

type Options = {
  campaign: SmsCampaign;
  campaignKey: string;
  onSentIdsChange: (ids: Set<string>) => void;
  onPendingIdsChange: (ids: Set<string>) => void;
  onLogChange: () => void;
};

export function useSmsPendingSync({
  campaign,
  campaignKey,
  onSentIdsChange,
  onPendingIdsChange,
  onLogChange,
}: Options) {
  const sentRef = useRef(onSentIdsChange);
  const pendingRef = useRef(onPendingIdsChange);
  const logRef = useRef(onLogChange);
  sentRef.current = onSentIdsChange;
  pendingRef.current = onPendingIdsChange;
  logRef.current = onLogChange;

  useEffect(() => {
    const sync = () => {
      void (async () => {
        await refreshSmsSendLogsCache(supabase);
        sentRef.current(await syncRecipientSentIds(campaign, campaignKey));
        pendingRef.current(getPendingRecipientIds(campaign, campaignKey));
        logRef.current();
      })();
    };

    sync();
    void ensureSmsPendingTracker();
    return subscribeSmsPendingTracker(sync);
  }, [campaign, campaignKey]);
}
